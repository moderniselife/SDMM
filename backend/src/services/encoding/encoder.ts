/**
 * SchroDrive Media Manager — FFmpeg Encoder
 *
 * Executes FFmpeg via Bun.spawn(), parses stderr for progress updates,
 * supports cancellation, and returns the encoding result.
 *
 * @module services/encoding/encoder
 */

import type { EncodeJob } from '@/types';
import type { EncodingPresetConfig, EncodeRunResult, DetailedProbe } from './types';
import { buildFFmpegCommand } from './ffmpeg-builder';

// ---------------------------------------------------------------------------
// Progress Parsing
// ---------------------------------------------------------------------------

/**
 * Parses the `time=` field from FFmpeg stderr output.
 * FFmpeg outputs lines like: `frame= 1234 fps= 30 time=00:01:23.45 ...`
 *
 * @param line - A line from FFmpeg stderr
 * @returns The current time in seconds, or null if not found
 */
function parseTimeFromStderr(line: string): number | null {
  const match = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
  if (!match) return null;

  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  const seconds = parseInt(match[3]!, 10);
  const centiseconds = parseInt(match[4]!, 10);
  const fractional = match[4]!.length === 3 ? centiseconds / 1000 : centiseconds / 100;

  return hours * 3600 + minutes * 60 + seconds + fractional;
}

// ---------------------------------------------------------------------------
// Cancellation Handle
// ---------------------------------------------------------------------------

/** Handle returned by runEncode for external cancellation. */
export interface EncodeCancellation {
  cancel: () => void;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs an FFmpeg encode job using Bun.spawn().
 *
 * Parses stderr in real-time for `time=` progress markers, calculates
 * completion percentage from (current_time / total_duration), and invokes
 * the progress callback.
 *
 * Supports cancellation by killing the FFmpeg process via the returned
 * cancellation handle.
 *
 * @param inputPath - Absolute path to the source file
 * @param outputDir - Directory where .partial.mkv output will be written
 * @param probe - Detailed probe result for the source file
 * @param preset - Encoding preset configuration
 * @param onProgress - Callback invoked with completion percentage (0–100)
 * @returns Object with encode result and cancellation handle
 */
export async function runEncode(
  inputPath: string,
  outputDir: string,
  probe: DetailedProbe,
  preset: EncodingPresetConfig,
  onProgress?: (percent: number) => void,
): Promise<{ result: EncodeRunResult; cancellation: EncodeCancellation }> {
  const startTime = Date.now();

  // Build the FFmpeg command
  const { command, outputPath } = buildFFmpegCommand(
    inputPath,
    outputDir,
    probe,
    preset,
  );

  // The first element is 'ffmpeg', Bun.spawn needs the full array
  const proc = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let cancelled = false;
  const cancellation: EncodeCancellation = {
    cancel: () => {
      cancelled = true;
      proc.kill('SIGTERM');
    },
  };

  // Parse stderr for progress in a streaming fashion
  const stderrReader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let stderrBuffer = '';

  const readStderr = async (): Promise<void> => {
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;

        stderrBuffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = stderrBuffer.split('\r');
        stderrBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (probe.duration > 0 && onProgress) {
            const currentTime = parseTimeFromStderr(line);
            if (currentTime !== null) {
              const percent = Math.min(
                100,
                Math.round((currentTime / probe.duration) * 100),
              );
              onProgress(percent);
            }
          }
        }
      }
    } catch {
      // Reader may be cancelled on process kill — that's expected
    }
  };

  // Drain stdout (FFmpeg writes progress to stderr, stdout is minimal)
  const drainStdout = async (): Promise<void> => {
    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // Expected on cancellation
    }
  };

  // Read stderr and stdout concurrently
  await Promise.all([readStderr(), drainStdout()]);

  const exitCode = await proc.exited;
  const durationMs = Date.now() - startTime;

  if (cancelled) {
    return {
      result: {
        success: false,
        error: 'Encoding was cancelled',
        durationMs,
      },
      cancellation,
    };
  }

  if (exitCode !== 0) {
    return {
      result: {
        success: false,
        error: `FFmpeg exited with code ${exitCode}`,
        durationMs,
      },
      cancellation,
    };
  }

  // Get output file size
  let outputSize = 0;
  try {
    const file = Bun.file(outputPath);
    outputSize = file.size;
  } catch {
    // If we can't stat the file, leave size as 0
  }

  return {
    result: {
      success: true,
      outputPath,
      outputSize,
      durationMs,
    },
    cancellation,
  };
}

/**
 * Convenience wrapper that runs an encode from an EncodeJob record.
 *
 * Extracts input path, output directory, and rebuilds the probe/preset
 * needed by the encoding pipeline.
 *
 * @param job - The encode job record
 * @param probe - Detailed probe for the input file
 * @param preset - Encoding preset configuration
 * @param onProgress - Progress callback (0–100)
 * @returns The encode run result
 */
export async function runEncodeFromJob(
  job: EncodeJob,
  probe: DetailedProbe,
  preset: EncodingPresetConfig,
  onProgress?: (percent: number) => void,
): Promise<{ result: EncodeRunResult; cancellation: EncodeCancellation }> {
  const outputDir = job.outputPath
    ? job.outputPath.substring(0, job.outputPath.lastIndexOf('/'))
    : '/media/staging';

  return runEncode(job.inputPath, outputDir, probe, preset, onProgress);
}

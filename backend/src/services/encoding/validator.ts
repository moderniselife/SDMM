/**
 * SchroDrive Media Manager — Post-Encode Validator
 *
 * Validates encoded output by running ffprobe, comparing durations
 * and sizes, then performing the atomic rename from .partial.mkv
 * to the final filename.
 *
 * @module services/encoding/validator
 */

import { unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { probeFile } from './ffprobe';
import type { DetailedProbe, ValidationResult } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed duration difference (in seconds) between input and output. */
const DURATION_TOLERANCE_SECONDS = 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a completed encode output.
 *
 * Validation steps:
 * 1. Run ffprobe on the output to verify it's a valid media file
 * 2. Compare durations: abs(output - input) must be ≤ 2 seconds
 * 3. Compare sizes: if output ≥ input, mark as 'skipped' (no savings)
 * 4. If all pass: rename .partial.mkv → final name, return success
 * 5. If any fail: delete .partial.mkv, return failure with reason
 *
 * @param inputPath - Absolute path to the original source file
 * @param outputPath - Absolute path to the .partial.mkv output file
 * @param inputProbe - Detailed probe of the original input file
 * @returns Validation result with final path (on success) or failure reason
 */
export async function validateEncode(
  inputPath: string,
  outputPath: string,
  inputProbe: DetailedProbe,
): Promise<ValidationResult> {
  // Get input file size
  let inputSize = 0;
  try {
    const inputFile = Bun.file(inputPath);
    inputSize = inputFile.size;
  } catch (err) {
    return {
      valid: false,
      reason: `Failed to stat input file: ${err instanceof Error ? err.message : String(err)}`,
      inputSize: 0,
      outputSize: 0,
      inputDuration: inputProbe.duration,
      outputDuration: 0,
    };
  }

  // Step 1: Probe the output file
  let outputProbe: DetailedProbe;
  try {
    outputProbe = await probeFile(outputPath);
  } catch (err) {
    // Output is invalid — clean up and fail
    await safeDelete(outputPath);
    return {
      valid: false,
      reason: `Output file failed ffprobe validation: ${err instanceof Error ? err.message : String(err)}`,
      inputSize,
      outputSize: 0,
      inputDuration: inputProbe.duration,
      outputDuration: 0,
    };
  }

  // Get output file size
  let outputSize = 0;
  try {
    const outputFile = Bun.file(outputPath);
    outputSize = outputFile.size;
  } catch {
    outputSize = 0;
  }

  // Step 2: Compare durations
  const durationDiff = Math.abs(outputProbe.duration - inputProbe.duration);
  if (durationDiff > DURATION_TOLERANCE_SECONDS) {
    await safeDelete(outputPath);
    return {
      valid: false,
      reason: `Duration mismatch: input=${inputProbe.duration.toFixed(2)}s, output=${outputProbe.duration.toFixed(2)}s, diff=${durationDiff.toFixed(2)}s (tolerance: ${DURATION_TOLERANCE_SECONDS}s)`,
      inputSize,
      outputSize,
      inputDuration: inputProbe.duration,
      outputDuration: outputProbe.duration,
    };
  }

  // Step 3: Compare sizes — if output is bigger, it's not worth keeping
  if (outputSize >= inputSize) {
    await safeDelete(outputPath);
    return {
      valid: false,
      reason: `Output (${formatBytes(outputSize)}) is not smaller than input (${formatBytes(inputSize)}) — encoding provided no benefit`,
      inputSize,
      outputSize,
      inputDuration: inputProbe.duration,
      outputDuration: outputProbe.duration,
    };
  }

  // Step 4: All checks passed — rename .partial.mkv to final name
  const finalPath = generateFinalPath(outputPath);
  try {
    await rename(outputPath, finalPath);
  } catch (err) {
    return {
      valid: false,
      reason: `Failed to rename output: ${err instanceof Error ? err.message : String(err)}`,
      inputSize,
      outputSize,
      inputDuration: inputProbe.duration,
      outputDuration: outputProbe.duration,
    };
  }

  const savingsPercent = ((1 - outputSize / inputSize) * 100).toFixed(1);
  console.log(
    `[Validator] ✓ Encode validated: ${formatBytes(inputSize)} → ${formatBytes(outputSize)} (${savingsPercent}% reduction)`,
  );

  return {
    valid: true,
    finalPath,
    inputSize,
    outputSize,
    inputDuration: inputProbe.duration,
    outputDuration: outputProbe.duration,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates the final output path by removing '.partial' from the filename.
 *
 * @example
 * generateFinalPath('/media/staging/Movie.partial.mkv')
 * // → '/media/staging/Movie.mkv'
 */
function generateFinalPath(partialPath: string): string {
  const dir = path.dirname(partialPath);
  const baseName = path.basename(partialPath).replace('.partial.mkv', '.mkv');
  return path.join(dir, baseName);
}

/**
 * Safely deletes a file, ignoring errors if the file doesn't exist.
 */
async function safeDelete(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // File might already be gone — that's fine
  }
}

/**
 * Formats a byte count to a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KiB`;
  }
  return `${bytes} B`;
}

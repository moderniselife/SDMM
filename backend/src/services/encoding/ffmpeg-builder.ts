/**
 * SchroDrive Media Manager — FFmpeg Command Builder
 *
 * Constructs FFmpeg command-line argument arrays based on probe data
 * and selected encoding presets. Handles HDR preservation for both
 * CPU x265 and NVENC pipelines.
 *
 * @module services/encoding/ffmpeg-builder
 */

import path from 'node:path';
import type { DetailedProbe, EncodingPresetConfig, CpuPresetConfig, NvencPresetConfig } from './types';

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

/** Result of building an FFmpeg command. */
export interface FFmpegCommandResult {
  /** Full argument array (excluding 'ffmpeg' binary name). */
  command: string[];
  /** Path where the output will be written (always .partial.mkv). */
  outputPath: string;
}

// ---------------------------------------------------------------------------
// HDR Parameter Builders
// ---------------------------------------------------------------------------

/**
 * Builds x265-params string for HDR content preservation.
 *
 * @param probe - Detailed probe with optional master display and max CLL
 * @returns x265-params HDR portion string
 */
function buildX265HdrParams(probe: DetailedProbe): string {
  const parts = [
    'colorprim=bt2020',
    'transfer=smpte2084',
    'colormatrix=bt2020nc',
    'hdr-opt=1',
  ];

  if (probe.masterDisplay) {
    parts.push(`master-display=${probe.masterDisplay}`);
  }
  if (probe.maxCll) {
    parts.push(`max-cll=${probe.maxCll}`);
  }

  return parts.join(':');
}

/**
 * Builds NVENC HDR colour flag arguments.
 *
 * @returns Array of FFmpeg arguments for HDR colour space preservation
 */
function buildNvencHdrFlags(): string[] {
  return [
    '-color_primaries', 'bt2020',
    '-colorspace', 'bt2020nc',
    '-color_trc', 'smpte2084',
    '-color_range', 'limited',
  ];
}

// ---------------------------------------------------------------------------
// Command Builders
// ---------------------------------------------------------------------------

/**
 * Builds FFmpeg args for CPU libx265 encoding.
 */
function buildCpuCommand(
  inputPath: string,
  outputPath: string,
  probe: DetailedProbe,
  preset: CpuPresetConfig,
): string[] {
  const x265BaseParams = 'profile=main10';
  const x265Params = probe.isHdr
    ? `${x265BaseParams}:${buildX265HdrParams(probe)}`
    : x265BaseParams;

  return [
    'ffmpeg',
    '-i', inputPath,
    '-map', '0',
    '-map_metadata', '0',
    '-map_chapters', '0',
    '-c:v', 'libx265',
    '-crf', String(preset.crf),
    '-preset', preset.preset,
    '-pix_fmt', preset.pixFmt,
    '-x265-params', x265Params,
    '-c:a', 'copy',
    '-c:s', 'copy',
    '-y',
    outputPath,
  ];
}

/**
 * Builds FFmpeg args for NVENC hevc_nvenc encoding.
 */
function buildNvencCommand(
  inputPath: string,
  outputPath: string,
  probe: DetailedProbe,
  preset: NvencPresetConfig,
): string[] {
  const args = [
    'ffmpeg',
    '-i', inputPath,
    '-map', '0',
    '-map_metadata', '0',
    '-map_chapters', '0',
    '-c:v', 'hevc_nvenc',
    '-preset', preset.preset,
    '-tune', 'uhq',
    '-profile:v', 'main10',
    '-pix_fmt', preset.pixFmt,
    '-rc', 'vbr',
    '-b:v', preset.bitrate,
    '-maxrate', preset.maxrate,
    '-spatial_aq', '1',
    '-temporal_aq', '1',
    '-bf', '4',
  ];

  // Add HDR colour flags if the source is HDR
  if (probe.isHdr) {
    args.push(...buildNvencHdrFlags());
  }

  args.push(
    '-c:a', 'copy',
    '-c:s', 'copy',
    '-y',
    outputPath,
  );

  return args;
}

// ---------------------------------------------------------------------------
// Output Path Generator
// ---------------------------------------------------------------------------

/**
 * Generates the .partial.mkv output path within the given output directory.
 *
 * @param inputPath - Original input file path
 * @param outputDir - Directory to write the partial output into
 * @returns The full path ending in .partial.mkv
 */
function generateOutputPath(inputPath: string, outputDir: string): string {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  return path.join(outputDir, `${baseName}.partial.mkv`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a complete FFmpeg command array based on the input file, probe data,
 * and selected encoding preset.
 *
 * The output path always uses `.partial.mkv` extension. After successful
 * encoding and validation, the caller should rename to the final filename.
 *
 * @param inputPath - Absolute path to the source media file
 * @param outputDir - Directory where the encoded output will be written
 * @param probe - Detailed probe result for the source file
 * @param preset - The encoding preset configuration to apply
 * @returns Object containing the command array and output path
 */
export function buildFFmpegCommand(
  inputPath: string,
  outputDir: string,
  probe: DetailedProbe,
  preset: EncodingPresetConfig,
): FFmpegCommandResult {
  const outputPath = generateOutputPath(inputPath, outputDir);

  let command: string[];

  switch (preset.type) {
    case 'cpu_x265':
      command = buildCpuCommand(inputPath, outputPath, probe, preset);
      break;
    case 'nvenc':
      command = buildNvencCommand(inputPath, outputPath, probe, preset);
      break;
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unrecognised preset type: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return { command, outputPath };
}

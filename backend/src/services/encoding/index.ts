/**
 * SchroDrive Media Manager — Encoding Module Index
 *
 * Barrel export for the encoding pipeline.
 *
 * @module services/encoding
 */

export { probeFile, toFileProbe, getResolutionCategory } from './ffprobe';
export { getPreset, getAllPresets } from './presets';
export { buildFFmpegCommand } from './ffmpeg-builder';
export { shouldEncode } from './decision';
export { runEncode, runEncodeFromJob } from './encoder';
export { validateEncode } from './validator';

// Re-export types
export type {
  ResolutionCategory,
  AudioTrackInfo,
  SubtitleTrackInfo,
  DetailedProbe,
  CpuPresetConfig,
  NvencPresetConfig,
  EncodingPresetConfig,
  EncodeDecision,
  EncodeRunResult,
  ValidationResult,
} from './types';
export type { PresetEncoderType } from './presets';
export type { FFmpegCommandResult } from './ffmpeg-builder';
export type { EncodeDecisionResult } from './decision';
export type { EncodeCancellation } from './encoder';

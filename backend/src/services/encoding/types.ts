/**
 * SchroDrive Media Manager — Encoding Service Types
 *
 * Extended types used internally by the encoding pipeline.
 * These complement the shared types in @/types.
 *
 * @module services/encoding/types
 */

import type { EncoderType } from '@/types';

// ---------------------------------------------------------------------------
// Resolution Helpers
// ---------------------------------------------------------------------------

/** Detected resolution category for encoding preset selection. */
export type ResolutionCategory = '4k_hdr' | '4k_sdr' | '1080p' | '720p' | '480p';

// ---------------------------------------------------------------------------
// Detailed Track Info (from FFprobe)
// ---------------------------------------------------------------------------

/** Detailed audio track metadata parsed from FFprobe output. */
export interface AudioTrackInfo {
  index: number;
  codec: string;
  channels: number;
  language: string;
  bitrate: number;
}

/** Detailed subtitle track metadata parsed from FFprobe output. */
export interface SubtitleTrackInfo {
  index: number;
  codec: string;
  language: string;
  forced: boolean;
}

/** Extended probe result with detailed track arrays and HDR metadata. */
export interface DetailedProbe {
  filePath: string;
  codec: string;
  codecProfile: string | null;
  width: number;
  height: number;
  resolution: ResolutionCategory;
  bitrate: number;
  duration: number;
  framerate: number | null;
  pixelFormat: string;
  isHdr: boolean;
  is10Bit: boolean;
  audioTracks: AudioTrackInfo[];
  subtitleTracks: SubtitleTrackInfo[];
  chapterCount: number;
  /** Master display metadata string (HDR content). */
  masterDisplay?: string;
  /** Maximum Content Light Level string (HDR content). */
  maxCll?: string;
  /** Raw FFprobe JSON output for reference. */
  rawJson: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Encoding Presets
// ---------------------------------------------------------------------------

/** CPU x265 preset configuration (CRF-based). */
export interface CpuPresetConfig {
  type: 'cpu_x265';
  crf: number;
  preset: string;
  pixFmt: string;
}

/** NVENC hevc_nvenc preset configuration (bitrate-based). */
export interface NvencPresetConfig {
  type: 'nvenc';
  bitrate: string;
  maxrate: string;
  preset: string;
  pixFmt: string;
}

/** Union type for any encoding preset configuration. */
export type EncodingPresetConfig = CpuPresetConfig | NvencPresetConfig;

// ---------------------------------------------------------------------------
// Encoding Decision
// ---------------------------------------------------------------------------

/** Decision result from the encoding decision engine. */
export interface EncodeDecision {
  shouldEncode: boolean;
  reason: string;
  suggestedEncoder?: EncoderType;
}

// ---------------------------------------------------------------------------
// Encoding Results
// ---------------------------------------------------------------------------

/** Result returned after an encode run completes. */
export interface EncodeRunResult {
  success: boolean;
  outputPath?: string;
  outputSize?: number;
  durationMs?: number;
  error?: string;
}

/** Result from post-encode validation. */
export interface ValidationResult {
  valid: boolean;
  finalPath?: string;
  reason?: string;
  inputSize: number;
  outputSize: number;
  inputDuration: number;
  outputDuration: number;
}

// ---------------------------------------------------------------------------
// Target Bitrate Map (for decision logic)
// ---------------------------------------------------------------------------

/** Target bitrate in bits per second for each resolution. */
export const TARGET_BITRATE_BPS: Record<string, number> = {
  '4k_hdr': 20_000_000,
  '4k_sdr': 15_000_000,
  '1080p': 6_000_000,
  '720p': 3_000_000,
  '480p': 1_500_000,
};

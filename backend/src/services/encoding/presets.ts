/**
 * SchroDrive Media Manager — Encoding Presets
 *
 * Defines encoding preset configurations for CPU x265 and NVENC hevc_nvenc
 * across all supported resolution categories.
 *
 * @module services/encoding/presets
 */

import type { EncodingPresetConfig, ResolutionCategory } from './types';

// ---------------------------------------------------------------------------
// CPU x265 Presets (CRF-based)
// ---------------------------------------------------------------------------

const CPU_PRESETS: Record<ResolutionCategory, EncodingPresetConfig> = {
  '4k_hdr': { type: 'cpu_x265', crf: 19, preset: 'slow', pixFmt: 'yuv420p10le' },
  '4k_sdr': { type: 'cpu_x265', crf: 21, preset: 'slow', pixFmt: 'yuv420p10le' },
  '1080p':  { type: 'cpu_x265', crf: 22, preset: 'slow', pixFmt: 'yuv420p10le' },
  '720p':   { type: 'cpu_x265', crf: 24, preset: 'slow', pixFmt: 'yuv420p10le' },
  '480p':   { type: 'cpu_x265', crf: 25, preset: 'slow', pixFmt: 'yuv420p10le' },
};

// ---------------------------------------------------------------------------
// NVENC hevc_nvenc Presets (bitrate-based)
// ---------------------------------------------------------------------------

const NVENC_PRESETS: Record<ResolutionCategory, EncodingPresetConfig> = {
  '4k_hdr': { type: 'nvenc', bitrate: '20M', maxrate: '24M', preset: 'p6', pixFmt: 'p010le' },
  '4k_sdr': { type: 'nvenc', bitrate: '15M', maxrate: '18M', preset: 'p6', pixFmt: 'p010le' },
  '1080p':  { type: 'nvenc', bitrate: '6M',  maxrate: '8M',  preset: 'p6', pixFmt: 'p010le' },
  '720p':   { type: 'nvenc', bitrate: '3M',  maxrate: '4M',  preset: 'p6', pixFmt: 'p010le' },
  '480p':   { type: 'nvenc', bitrate: '1.5M', maxrate: '2M', preset: 'p6', pixFmt: 'p010le' },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Encoder type names used in the presets module. */
export type PresetEncoderType = 'cpu_x265' | 'nvenc';

/**
 * Retrieves the encoding preset for a given encoder, resolution, and HDR status.
 *
 * @param encoder - The encoder backend to use ('cpu_x265' or 'nvenc')
 * @param resolution - The resolution category of the source content
 * @returns The matching encoding preset configuration
 * @throws {Error} If the encoder type is not recognised
 */
export function getPreset(
  encoder: PresetEncoderType,
  resolution: ResolutionCategory,
): EncodingPresetConfig {
  switch (encoder) {
    case 'cpu_x265':
      return CPU_PRESETS[resolution];
    case 'nvenc':
      return NVENC_PRESETS[resolution];
    default: {
      const _exhaustive: never = encoder;
      throw new Error(`Unrecognised encoder type: ${_exhaustive}`);
    }
  }
}

/**
 * Returns all available presets for a given encoder type.
 *
 * @param encoder - The encoder backend
 * @returns Record of resolution → preset configuration
 */
export function getAllPresets(
  encoder: PresetEncoderType,
): Record<ResolutionCategory, EncodingPresetConfig> {
  switch (encoder) {
    case 'cpu_x265':
      return { ...CPU_PRESETS };
    case 'nvenc':
      return { ...NVENC_PRESETS };
    default: {
      const _exhaustive: never = encoder;
      throw new Error(`Unrecognised encoder type: ${_exhaustive}`);
    }
  }
}

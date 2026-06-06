/**
 * SchroDrive Media Manager — Encoding Decision Logic
 *
 * Determines whether a file should be encoded based on its source type,
 * path, codec, bitrate, and processing flags. Enforces the rule that
 * cloud-mounted files (RealDebrid / TorBox) are NEVER auto-encoded.
 *
 * @module services/encoding/decision
 */

import type { SourceType, EncoderType } from '@/types';
import type { DetailedProbe } from './types';
import { TARGET_BITRATE_BPS } from './types';

// ---------------------------------------------------------------------------
// Cloud / Protected Path Prefixes
// ---------------------------------------------------------------------------

/** Paths that must NEVER be auto-encoded. */
const NEVER_ENCODE_PATH_PREFIXES = [
  '/cloud/',
  '/pd_zurg/mnt/pd_zurg',
];

/** Source types that must NEVER be auto-encoded. */
const NEVER_ENCODE_SOURCE_TYPES: SourceType[] = ['realdebrid', 'torbox'];

/** Codecs that should always be re-encoded when found. */
const REENCODE_CODECS = [
  'h264',
  'mpeg2video',
  'vc1',
  'msmpeg4v3',
  'mpeg4',
  'vp8',
];



// ---------------------------------------------------------------------------
// Decision Result
// ---------------------------------------------------------------------------

/** Result of the encoding decision engine. */
export interface EncodeDecisionResult {
  shouldEncode: boolean;
  reason: string;
  suggestedEncoder?: EncoderType;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines whether a media file should be encoded.
 *
 * Rules (in priority order):
 * 1. NEVER encode if source is 'realdebrid' or 'torbox'
 * 2. NEVER encode if file path starts with a protected cloud prefix
 * 3. NEVER encode if doNotProcess flag is set
 * 4. SKIP if codec is 'av1' with bitrate below 2× target
 * 5. SKIP if codec is 'hevc' + 10-bit with bitrate below 2× target
 * 6. ENCODE if codec is in the re-encode list (h264, mpeg2, vc1, etc.)
 * 7. ENCODE if codec is hevc but oversized (bitrate > 2× target)
 * 8. Otherwise SKIP — already acceptable
 *
 * @param sourceType - The origin of the media file
 * @param filePath - Absolute path to the file
 * @param probe - Detailed probe result from FFprobe
 * @param doNotProcess - User flag to skip processing
 * @returns Decision result with reason and optional suggested encoder
 */
export function shouldEncode(
  sourceType: SourceType,
  filePath: string,
  probe: DetailedProbe,
  doNotProcess: boolean,
): EncodeDecisionResult {
  // Rule 1: NEVER encode cloud source types
  if (NEVER_ENCODE_SOURCE_TYPES.includes(sourceType)) {
    return {
      shouldEncode: false,
      reason: `Source type '${sourceType}' is cloud-mounted and must never be encoded`,
    };
  }

  // Rule 2: NEVER encode protected cloud paths
  const normalisedPath = filePath.toLowerCase();
  for (const prefix of NEVER_ENCODE_PATH_PREFIXES) {
    if (normalisedPath.startsWith(prefix)) {
      return {
        shouldEncode: false,
        reason: `File path starts with protected prefix '${prefix}'`,
      };
    }
  }

  // Rule 3: NEVER encode if doNotProcess is true
  if (doNotProcess) {
    return {
      shouldEncode: false,
      reason: 'File is marked as doNotProcess',
    };
  }

  // Get target bitrate for this resolution
  const targetBitrate = TARGET_BITRATE_BPS[probe.resolution] ?? TARGET_BITRATE_BPS['1080p']!;
  const bitrateThreshold = targetBitrate * 2;

  // Rule 4: Skip AV1 if bitrate is reasonable
  if (probe.codec === 'av1' && probe.bitrate <= bitrateThreshold) {
    return {
      shouldEncode: false,
      reason: `AV1 codec with reasonable bitrate (${formatBitrate(probe.bitrate)} ≤ 2× target ${formatBitrate(targetBitrate)})`,
    };
  }

  // Rule 5: Skip HEVC + 10-bit if bitrate is reasonable
  if (probe.codec === 'hevc' && probe.is10Bit && probe.bitrate <= bitrateThreshold) {
    return {
      shouldEncode: false,
      reason: `HEVC 10-bit with reasonable bitrate (${formatBitrate(probe.bitrate)} ≤ 2× target ${formatBitrate(targetBitrate)})`,
    };
  }

  // Rule 6: Always re-encode inefficient codecs
  if (REENCODE_CODECS.includes(probe.codec)) {
    return {
      shouldEncode: true,
      reason: `Codec '${probe.codec}' is in the re-encode list`,
      suggestedEncoder: 'hevc_nvenc',
    };
  }

  // Rule 7: Re-encode oversized HEVC
  if (probe.codec === 'hevc' && probe.bitrate > bitrateThreshold) {
    return {
      shouldEncode: true,
      reason: `HEVC is oversized (${formatBitrate(probe.bitrate)} > 2× target ${formatBitrate(targetBitrate)})`,
      suggestedEncoder: 'hevc_nvenc',
    };
  }

  // Rule 8: Anything else — already acceptable
  return {
    shouldEncode: false,
    reason: `Codec '${probe.codec}' at ${formatBitrate(probe.bitrate)} is acceptable`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a bitrate in bps to a human-readable string.
 */
function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  if (bps >= 1_000) {
    return `${(bps / 1_000).toFixed(0)} kbps`;
  }
  return `${bps} bps`;
}

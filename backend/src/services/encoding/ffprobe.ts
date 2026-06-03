/**
 * SchroDrive Media Manager — FFprobe Parser
 *
 * Runs ffprobe via Bun.spawn() to analyse media files and extract
 * codec, resolution, bitrate, HDR, 10-bit, audio/subtitle tracks,
 * chapters, and raw JSON metadata.
 *
 * @module services/encoding/ffprobe
 */

import type { FileProbe } from '@/types';
import type {
  AudioTrackInfo,
  DetailedProbe,
  ResolutionCategory,
  SubtitleTrackInfo,
} from './types';

// ---------------------------------------------------------------------------
// Resolution Classification
// ---------------------------------------------------------------------------

/**
 * Determines the resolution category from width × height dimensions.
 *
 * @param width - Video width in pixels
 * @param height - Video height in pixels
 * @param isHdr - Whether the content is HDR
 * @returns The resolution category for preset selection
 */
export function getResolutionCategory(
  width: number,
  height: number,
  isHdr: boolean,
): ResolutionCategory {
  if (width >= 3840 || height >= 2160) {
    return isHdr ? '4k_hdr' : '4k_sdr';
  }
  if (width >= 1920 || height >= 1080) {
    return '1080p';
  }
  if (width >= 1280 || height >= 720) {
    return '720p';
  }
  return '480p';
}

// ---------------------------------------------------------------------------
// Raw FFprobe Types (internal)
// ---------------------------------------------------------------------------

interface RawFFprobeStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  color_range?: string;
  bit_rate?: string;
  channels?: number;
  channel_layout?: string;
  sample_rate?: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
  side_data_list?: Array<{
    side_data_type?: string;
    green_x?: string;
    green_y?: string;
    blue_x?: string;
    blue_y?: string;
    red_x?: string;
    red_y?: string;
    white_point_x?: string;
    white_point_y?: string;
    min_luminance?: string;
    max_luminance?: string;
    max_content?: number;
    max_average?: number;
  }>;
}

interface RawFFprobeFormat {
  filename: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  format_name?: string;
  tags?: Record<string, string>;
}

interface RawFFprobeChapter {
  id: number;
  start: number;
  end: number;
  tags?: Record<string, string>;
}

interface RawFFprobeOutput {
  streams: RawFFprobeStream[];
  format: RawFFprobeFormat;
  chapters?: RawFFprobeChapter[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a frame rate string like "24000/1001" into a numeric value.
 */
function parseFrameRate(rFrameRate?: string): number | null {
  if (!rFrameRate) return null;
  const parts = rFrameRate.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0) return Math.round((num / den) * 1000) / 1000;
  }
  const parsed = Number(rFrameRate);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Detects HDR from colour transfer and primaries.
 */
function detectHdr(stream: RawFFprobeStream): boolean {
  return (
    stream.color_transfer === 'smpte2084' &&
    stream.color_primaries === 'bt2020'
  );
}

/**
 * Detects 10-bit colour depth from the pixel format string.
 */
function detect10Bit(pixFmt?: string): boolean {
  if (!pixFmt) return false;
  return pixFmt.includes('10le') || pixFmt.includes('10be');
}

/**
 * Extracts master display metadata from side_data_list.
 */
function extractMasterDisplay(stream: RawFFprobeStream): string | undefined {
  const sideData = stream.side_data_list?.find(
    (sd) =>
      sd.side_data_type === 'Mastering display metadata' ||
      sd.side_data_type === 'Mastering Display Metadata',
  );
  if (!sideData) return undefined;

  // Build the standard master-display string
  const g = `G(${sideData.green_x},${sideData.green_y})`;
  const b = `B(${sideData.blue_x},${sideData.blue_y})`;
  const r = `R(${sideData.red_x},${sideData.red_y})`;
  const wp = `WP(${sideData.white_point_x},${sideData.white_point_y})`;
  const l = `L(${sideData.max_luminance},${sideData.min_luminance})`;
  return `${g}${b}${r}${wp}${l}`;
}

/**
 * Extracts max CLL (Content Light Level) from side_data_list.
 */
function extractMaxCll(stream: RawFFprobeStream): string | undefined {
  const sideData = stream.side_data_list?.find(
    (sd) =>
      sd.side_data_type === 'Content light level metadata' ||
      sd.side_data_type === 'Content Light Level Metadata',
  );
  if (!sideData) return undefined;
  return `${sideData.max_content},${sideData.max_average}`;
}

/**
 * Extracts audio tracks from the raw FFprobe stream array.
 */
function extractAudioTracks(streams: RawFFprobeStream[]): AudioTrackInfo[] {
  return streams
    .filter((s) => s.codec_type === 'audio')
    .map((s) => ({
      index: s.index,
      codec: s.codec_name ?? 'unknown',
      channels: s.channels ?? 0,
      language: s.tags?.language ?? 'und',
      bitrate: s.bit_rate ? Number(s.bit_rate) : 0,
    }));
}

/**
 * Extracts subtitle tracks from the raw FFprobe stream array.
 */
function extractSubtitleTracks(
  streams: RawFFprobeStream[],
): SubtitleTrackInfo[] {
  return streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((s) => ({
      index: s.index,
      codec: s.codec_name ?? 'unknown',
      language: s.tags?.language ?? 'und',
      forced: s.disposition?.forced === 1,
    }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs ffprobe on the given file and parses the output into a DetailedProbe.
 *
 * Uses Bun.spawn() to execute the ffprobe binary with JSON output format.
 * Detects codec, resolution, bitrate, HDR, 10-bit, audio tracks, subtitle
 * tracks, chapters, and preserves raw JSON for reference.
 *
 * @param filePath - Absolute path to the media file to probe
 * @returns Detailed probe result with all extracted metadata
 * @throws {Error} If ffprobe fails or the file cannot be read
 */
export async function probeFile(filePath: string): Promise<DetailedProbe> {
  const proc = Bun.spawn(
    [
      'ffprobe',
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      '-of', 'json',
      filePath,
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(
      `ffprobe failed with exit code ${exitCode} for "${filePath}": ${stderrText.trim()}`,
    );
  }

  let raw: RawFFprobeOutput;
  try {
    raw = JSON.parse(stdoutText) as RawFFprobeOutput;
  } catch {
    throw new Error(
      `Failed to parse ffprobe JSON output for "${filePath}": ${stdoutText.slice(0, 200)}`,
    );
  }

  // Find the first video stream
  const videoStream = raw.streams.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new Error(`No video stream found in "${filePath}"`);
  }

  const codec = videoStream.codec_name ?? 'unknown';
  const width = videoStream.width ?? 0;
  const height = videoStream.height ?? 0;
  const pixelFormat = videoStream.pix_fmt ?? 'unknown';
  const isHdr = detectHdr(videoStream);
  const is10Bit = detect10Bit(pixelFormat);
  const resolution = getResolutionCategory(width, height, isHdr);

  // Duration: prefer format.duration, fall back to stream calculation
  const duration = raw.format.duration
    ? parseFloat(raw.format.duration)
    : 0;

  // Bitrate: prefer stream bit_rate → format bit_rate → calculate from size/duration
  let bitrate = 0;
  if (videoStream.bit_rate) {
    bitrate = Number(videoStream.bit_rate);
  } else if (raw.format.bit_rate) {
    bitrate = Number(raw.format.bit_rate);
  } else if (raw.format.size && duration > 0) {
    bitrate = Math.round((Number(raw.format.size) * 8) / duration);
  }

  const audioTracks = extractAudioTracks(raw.streams);
  const subtitleTracks = extractSubtitleTracks(raw.streams);
  const chapterCount = raw.chapters?.length ?? 0;

  return {
    filePath,
    codec,
    codecProfile: videoStream.profile ?? null,
    width,
    height,
    resolution,
    bitrate,
    duration,
    framerate: parseFrameRate(videoStream.r_frame_rate),
    pixelFormat,
    isHdr,
    is10Bit,
    audioTracks,
    subtitleTracks,
    chapterCount,
    masterDisplay: extractMasterDisplay(videoStream),
    maxCll: extractMaxCll(videoStream),
    rawJson: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Converts a DetailedProbe to the shared FileProbe type for database storage.
 *
 * @param probe - The detailed probe result
 * @param mediaSourceId - The ID of the associated media source
 * @returns A FileProbe compatible with the shared types
 */
export function toFileProbe(probe: DetailedProbe, mediaSourceId: string): FileProbe {
  return {
    id: crypto.randomUUID(),
    mediaSourceId,
    codecName: probe.codec,
    codecProfile: probe.codecProfile,
    width: probe.width,
    height: probe.height,
    durationSeconds: probe.duration,
    bitrateBps: probe.bitrate,
    framerate: probe.framerate,
    pixelFormat: probe.pixelFormat,
    colourSpace: null,
    colourTransfer: probe.isHdr ? 'smpte2084' : null,
    colourPrimaries: probe.isHdr ? 'bt2020' : null,
    isHdr: probe.isHdr,
    is10bit: probe.is10Bit,
    audioTracks: probe.audioTracks.length,
    subtitleTracks: probe.subtitleTracks.length,
    chaptersCount: probe.chapterCount,
    rawJson: JSON.stringify(probe.rawJson),
    probedAt: new Date().toISOString(),
  };
}

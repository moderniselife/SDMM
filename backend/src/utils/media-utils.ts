/**
 * SchroDrive Media Manager — Media Utilities
 *
 * Helper functions for parsing media filenames, classifying
 * resolution categories, and identifying media file types.
 *
 * @module utils/media-utils
 */

import { extname } from 'path';

/** Supported media file extensions. */
const MEDIA_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.ts', '.wmv',
  '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
]);

/** Result of parsing a media filename. */
export interface ParsedMediaFilename {
  title: string;
  year: number | null;
  resolution: string | null;
  source: string | null;
  codec: string | null;
  group: string | null;
}

/**
 * Extracts title, year, resolution, and other metadata from a media filename.
 *
 * Handles common naming patterns like:
 * - "Movie.Title.2024.1080p.BluRay.x265.mkv"
 * - "Movie Title (2024) [1080p].mkv"
 * - "TV.Show.S01E03.720p.WEB-DL.mkv"
 *
 * @param filename - The media filename (with or without path).
 * @returns Parsed metadata extracted from the filename.
 */
export function parseMediaFilename(filename: string): ParsedMediaFilename {
  // Strip extension and path
  const baseName = filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '');

  // Year pattern: (2024) or .2024.
  const yearMatch = baseName.match(/[\.\s\-_(\[]+(\d{4})[\.\s\-_)\]]+/);
  const year = yearMatch ? parseInt(yearMatch[1]!, 10) : null;

  // Resolution pattern
  const resolutionMatch = baseName.match(
    /\b(2160p|4k|1080p|720p|480p|576p)\b/i
  );
  const resolution = resolutionMatch ? resolutionMatch[1]!.toLowerCase() : null;

  // Source pattern
  const sourceMatch = baseName.match(
    /\b(BluRay|Blu-Ray|BDRip|BRRip|WEB-DL|WEBRip|WEB|HDTV|DVDRip|REMUX|AMZN|NF|DSNP|HMAX)\b/i
  );
  const source = sourceMatch ? sourceMatch[1]! : null;

  // Codec pattern
  const codecMatch = baseName.match(
    /\b(x264|x265|h264|h265|HEVC|AV1|VP9|XviD|DivX)\b/i
  );
  const codec = codecMatch ? codecMatch[1]! : null;

  // Release group — typically after a hyphen at the end
  const groupMatch = baseName.match(/-([A-Za-z0-9]+)$/);
  const group = groupMatch ? groupMatch[1]! : null;

  // Title: everything before the year (or before resolution/source if no year)
  let title: string;
  if (yearMatch && yearMatch.index !== undefined) {
    title = baseName.slice(0, yearMatch.index);
  } else if (resolutionMatch && resolutionMatch.index !== undefined) {
    title = baseName.slice(0, resolutionMatch.index);
  } else {
    title = baseName;
  }

  // Clean up title: replace dots, underscores with spaces, trim
  title = title
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, year, resolution, source, codec, group };
}

/**
 * Determines the resolution category based on pixel dimensions.
 *
 * @param width - Video width in pixels.
 * @param height - Video height in pixels.
 * @returns Resolution category string.
 */
export function getResolutionCategory(
  width: number,
  height: number
): '4k' | '1080p' | '720p' | '480p' {
  if (width >= 3840 || height >= 2160) return '4k';
  if (width >= 1920 || height >= 1080) return '1080p';
  if (width >= 1280 || height >= 720) return '720p';
  return '480p';
}

/**
 * Checks whether a filename has a recognised media file extension.
 *
 * @param filename - The filename or path to check.
 * @returns True if the file extension matches a known media format.
 */
export function isMediaFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}

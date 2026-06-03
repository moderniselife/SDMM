/**
 * SchroDrive Media Manager — Reconciler Service
 *
 * The scanner → DB bridge. Takes discovered files from scanners
 * and upserts them into the database as media_items + media_sources.
 *
 * Handles filename parsing (movies, series, episodes), fuzzy title
 * matching, and de-duplication via the unique index on
 * (source_type, file_path).
 *
 * IMPORTANT: Cloud sources (realdebrid, torbox) always set
 * do_not_process = 1 — we never auto-process cloud content.
 *
 * @module services/reconciler
 */

import { db } from '@/db/connection';
import { createLogger } from '@/utils/logger';
import { eventBus } from '@/services/events';
import type { SourceType, MediaType } from '@/types';

const log = createLogger('reconciler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed metadata extracted from a media filename. */
export interface ParsedMedia {
  title: string;
  year: number | null;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  resolution?: string;
}

/** Result summary returned by reconcileFiles(). */
export interface ReconcileResult {
  newItems: number;
  updatedItems: number;
  newSourceIds: string[];
  errors: string[];
}

/**
 * Common shape for discovered files from any scanner.
 * All three scanner types (local, RD, TorBox) share this structure.
 */
export interface GenericDiscoveredFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  modifiedAt: Date;
  sourceType: SourceType;
}

// ---------------------------------------------------------------------------
// Resolution Mapping
// ---------------------------------------------------------------------------

/** Maps common resolution tokens to normalised labels. */
const RESOLUTION_MAP: Record<string, string> = {
  '2160p': '4K',
  '4k': '4K',
  'uhd': '4K',
  '1080p': '1080p',
  '1080i': '1080p',
  '720p': '720p',
  '576p': '576p',
  '480p': '480p',
  'sd': '480p',
};

// ---------------------------------------------------------------------------
// Filename Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a media filename into title, year, and resolution.
 *
 * Handles multiple naming conventions:
 * - Movie: `Title.Year.Quality.Codec.mkv`
 * - Movie with brackets: `Title (Year) [Quality].mkv`
 * - Movie with dashes: `Title - Year [Quality].mkv`
 * - TV: `Show.Name.S01E05.Quality.mkv`
 * - TV with dashes: `Show Name - S01E05 - Episode Title.mkv`
 *
 * @example
 * parseMediaFilename('Interstellar.2014.2160p.mkv')
 * // → { title: 'Interstellar', year: 2014, mediaType: 'movie', resolution: '4K' }
 *
 * @example
 * parseMediaFilename('The.Dark.Knight.2008.1080p.BluRay.x265.mkv')
 * // → { title: 'The Dark Knight', year: 2008, mediaType: 'movie', resolution: '1080p' }
 *
 * @example
 * parseMediaFilename('Breaking.Bad.S01E01.720p.mkv')
 * // → { title: 'Breaking Bad', year: null, mediaType: 'episode', season: 1, episode: 1, resolution: '720p' }
 *
 * @param fileName - The media file name (with or without extension)
 */
export function parseMediaFilename(fileName: string): ParsedMedia {
  // Strip file extension
  const baseName = fileName.replace(/\.[^.]+$/, '');

  // Attempt TV series pattern first: S01E05 or S01E05E06
  const tvPattern = /^(.+?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,3})(?:[Ee]\d{1,3})?/;
  const tvMatch = baseName.match(tvPattern);

  if (tvMatch) {
    const rawTitle = tvMatch[1]!;
    const season = parseInt(tvMatch[2]!, 10);
    const episode = parseInt(tvMatch[3]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: null,
      mediaType: 'episode',
      season,
      episode,
      resolution,
    };
  }

  // Try parenthetical year: "Movie (2024)" or "Movie (2024) [1080p]"
  const parenYearPattern = /^(.+?)\s*\((\d{4})\)/;
  const parenYearMatch = baseName.match(parenYearPattern);

  if (parenYearMatch) {
    const rawTitle = parenYearMatch[1]!;
    const year = parseInt(parenYearMatch[2]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: isReasonableYear(year) ? year : null,
      mediaType: 'movie',
      resolution,
    };
  }

  // Try standard year in filename: "Title.2024.1080p" or "Title - 2024 [1080p]"
  const yearPattern = /^(.+?)[.\s_-]+(\d{4})[.\s_\-\[]/;
  const yearMatch = baseName.match(yearPattern);

  if (yearMatch) {
    const rawTitle = yearMatch[1]!;
    const year = parseInt(yearMatch[2]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: isReasonableYear(year) ? year : null,
      mediaType: 'movie',
      resolution,
    };
  }

  // Fallback: year at end of string "Title.2024"
  const yearEndPattern = /^(.+?)[.\s_-]+(\d{4})$/;
  const yearEndMatch = baseName.match(yearEndPattern);

  if (yearEndMatch) {
    const rawTitle = yearEndMatch[1]!;
    const year = parseInt(yearEndMatch[2]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: isReasonableYear(year) ? year : null,
      mediaType: 'movie',
      resolution,
    };
  }

  // Last resort: treat the whole base name as the title
  const resolution = extractResolution(baseName);
  return {
    title: cleanTitle(baseName),
    year: null,
    mediaType: 'other',
    resolution,
  };
}

/**
 * Cleans a raw title by replacing dots, underscores, and excess
 * whitespace with single spaces, then trimming.
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/[._]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the resolution from a filename string, normalised
 * to a standard label (e.g. '4K', '1080p').
 */
function extractResolution(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [token, label] of Object.entries(RESOLUTION_MAP)) {
    if (lower.includes(token)) {
      return label;
    }
  }
  return undefined;
}

/**
 * Checks whether a number looks like a plausible release year.
 */
function isReasonableYear(year: number): boolean {
  return year >= 1888 && year <= new Date().getFullYear() + 2;
}

/**
 * Normalises a title for fuzzy comparison: lowercase, strip
 * articles (the, a, an), collapse whitespace.
 */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

/**
 * Find an existing media_item by title + year, or create a new one.
 * Uses normalised, case-insensitive title matching.
 *
 * @param parsed - Parsed media metadata from filename
 * @returns The media_item ID (existing or newly created)
 */
export async function findOrCreateMediaItem(parsed: ParsedMedia): Promise<string> {
  const normalisedTitle = normaliseTitle(parsed.title);

  // Try to find an existing item with matching normalised title and year
  // We pull all candidates and compare normalised titles in code,
  // since SQLite lacks robust fuzzy matching built-in.
  interface MediaItemRow {
    id: string;
    title: string;
    year: number | null;
  }

  let candidates: MediaItemRow[];

  if (parsed.year !== null) {
    // Match by year first for efficiency, then fuzzy-match title
    candidates = db.prepare(`
      SELECT id, title, year FROM media_items
      WHERE year = ? AND type = ?
    `).all(parsed.year, parsed.mediaType === 'episode' ? 'series' : parsed.mediaType) as MediaItemRow[];
  } else {
    // No year — search by type only
    candidates = db.prepare(`
      SELECT id, title, year FROM media_items
      WHERE type = ?
    `).all(parsed.mediaType === 'episode' ? 'series' : parsed.mediaType) as MediaItemRow[];
  }

  // Check for a fuzzy title match
  for (const candidate of candidates) {
    if (normaliseTitle(candidate.title) === normalisedTitle) {
      log.debug('Found existing media item via fuzzy match', {
        existingId: candidate.id,
        existingTitle: candidate.title,
        parsedTitle: parsed.title,
      });
      return candidate.id;
    }
  }

  // No match found — create a new media_item
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // For episodes, we create a 'series' entry (the parent show)
  const itemType = parsed.mediaType === 'episode' ? 'series' : parsed.mediaType;

  db.prepare(`
    INSERT INTO media_items (id, title, type, year, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, parsed.title, itemType, parsed.year, now, now);

  log.info('Created new media item', {
    id,
    title: parsed.title,
    type: itemType,
    year: parsed.year,
  });

  return id;
}

/**
 * Upsert a media_source record using the unique index on
 * (source_type, file_path).
 *
 * If a record already exists at the same path for the same source type,
 * we update file_size and updated_at if they've changed.
 * Otherwise, we insert a new record linked to the media_item.
 *
 * Cloud sources (realdebrid, torbox) always set do_not_process = 1.
 *
 * @param mediaItemId - The parent media_item ID
 * @param file - The discovered file from a scanner
 * @returns Whether the source is new and its ID
 */
export async function upsertMediaSource(
  mediaItemId: string,
  file: GenericDiscoveredFile,
): Promise<{ isNew: boolean; sourceId: string }> {
  // Check if a source already exists at this path
  interface ExistingSource {
    id: string;
    file_size: number;
  }

  const existing = db.prepare(`
    SELECT id, file_size FROM media_sources
    WHERE source_type = ? AND file_path = ?
  `).get(file.sourceType, file.filePath) as ExistingSource | null;

  if (existing) {
    // Update if file size has changed
    if (existing.file_size !== file.fileSize) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE media_sources
        SET file_size = ?, updated_at = ?
        WHERE id = ?
      `).run(file.fileSize, now, existing.id);

      log.debug('Updated media source file size', {
        sourceId: existing.id,
        oldSize: existing.file_size,
        newSize: file.fileSize,
      });
    }

    return { isNew: false, sourceId: existing.id };
  }

  // Insert new media_source
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isCloud = file.sourceType === 'realdebrid' || file.sourceType === 'torbox';

  db.prepare(`
    INSERT INTO media_sources (
      id, media_item_id, source_type, file_path, file_name,
      file_size, status, is_optimised, do_not_process,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'available', 0, ?, ?, ?)
  `).run(
    id,
    mediaItemId,
    file.sourceType,
    file.filePath,
    file.fileName,
    file.fileSize,
    isCloud ? 1 : 0,
    now,
    now,
  );

  log.info('Created new media source', {
    sourceId: id,
    mediaItemId,
    sourceType: file.sourceType,
    fileName: file.fileName,
    doNotProcess: isCloud,
  });

  return { isNew: true, sourceId: id };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Main reconciliation entry point. Takes discovered files from a scanner
 * run, reconciles them with the database, and returns a summary.
 *
 * For each file:
 * 1. Parse the filename into structured metadata
 * 2. Find or create a matching media_item
 * 3. Upsert the media_source record
 *
 * Emits SSE events for newly discovered items and tracks
 * new vs updated counts.
 *
 * @param files - Array of discovered files from any scanner
 * @param sourceType - The source type being reconciled
 * @returns Reconciliation result summary with counts and new source IDs
 */
export async function reconcileFiles(
  files: GenericDiscoveredFile[],
  sourceType: SourceType,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    newItems: 0,
    updatedItems: 0,
    newSourceIds: [],
    errors: [],
  };

  log.info(`Starting reconciliation for ${files.length} ${sourceType} files`);

  for (const file of files) {
    try {
      // Step 1: Parse the filename
      const parsed = parseMediaFilename(file.fileName);

      if (!parsed.title) {
        result.errors.push(`Could not parse title from: ${file.fileName}`);
        continue;
      }

      // Step 2: Find or create the media_item
      const mediaItemId = await findOrCreateMediaItem(parsed);

      // Step 3: Upsert the media_source
      const { isNew, sourceId } = await upsertMediaSource(mediaItemId, file);

      if (isNew) {
        result.newItems++;
        result.newSourceIds.push(sourceId);
      } else {
        result.updatedItems++;
      }
    } catch (err) {
      const msg = `Failed to reconcile "${file.fileName}": ${err instanceof Error ? err.message : String(err)}`;
      log.error(msg);
      result.errors.push(msg);
    }
  }

  // Emit SSE event for the completed reconciliation
  if (result.newItems > 0) {
    eventBus.emitScanComplete(sourceType, result.newItems);
  }

  log.info('Reconciliation complete', {
    sourceType,
    newItems: result.newItems,
    updatedItems: result.updatedItems,
    errors: result.errors.length,
    newSourceIds: result.newSourceIds.length,
  });

  return result;
}

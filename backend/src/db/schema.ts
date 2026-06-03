/**
 * SchroDrive Media Manager — Database Schema
 *
 * Complete CREATE TABLE statements for all application tables,
 * including indexes for query performance.
 *
 * @module db/schema
 */

/** SQL statements to create all application tables. */
export const SCHEMA_SQL = `
-- =============================================================================
-- Media Items — the core tracked media entries
-- =============================================================================
CREATE TABLE IF NOT EXISTS media_items (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('movie', 'series', 'episode', 'other')),
  year          INTEGER,
  imdb_id       TEXT,
  tmdb_id       TEXT,
  tvdb_id       TEXT,
  poster_url    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- Media Sources — file locations for each media item
-- =============================================================================
CREATE TABLE IF NOT EXISTS media_sources (
  id              TEXT PRIMARY KEY,
  media_item_id   TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL CHECK (source_type IN ('local', 'realdebrid', 'torbox')),
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'encoding', 'downloading', 'optimised', 'failed')),
  is_optimised    INTEGER NOT NULL DEFAULT 0,
  do_not_process  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_sources_type_status
  ON media_sources(source_type, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_sources_type_path
  ON media_sources(source_type, file_path);

-- FK index: used by every media list/detail query to fetch sources for an item
CREATE INDEX IF NOT EXISTS idx_media_sources_media_item_id
  ON media_sources(media_item_id);

-- =============================================================================
-- File Probes — FFprobe analysis results
-- =============================================================================
CREATE TABLE IF NOT EXISTS file_probes (
  id                TEXT PRIMARY KEY,
  media_source_id   TEXT NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
  codec_name        TEXT NOT NULL,
  codec_profile     TEXT,
  width             INTEGER NOT NULL DEFAULT 0,
  height            INTEGER NOT NULL DEFAULT 0,
  duration_seconds  REAL NOT NULL DEFAULT 0,
  bitrate_bps       INTEGER NOT NULL DEFAULT 0,
  framerate         REAL,
  pixel_format      TEXT,
  colour_space      TEXT,
  colour_transfer   TEXT,
  colour_primaries  TEXT,
  is_hdr            INTEGER NOT NULL DEFAULT 0,
  is_10bit          INTEGER NOT NULL DEFAULT 0,
  audio_tracks      INTEGER NOT NULL DEFAULT 0,
  subtitle_tracks   INTEGER NOT NULL DEFAULT 0,
  chapters_count    INTEGER NOT NULL DEFAULT 0,
  raw_json          TEXT,
  probed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FK index: used by media detail to fetch probes for each source
CREATE INDEX IF NOT EXISTS idx_file_probes_media_source_id
  ON file_probes(media_source_id);


-- =============================================================================
-- Encode Jobs — video transcoding tasks
-- =============================================================================
CREATE TABLE IF NOT EXISTS encode_jobs (
  id                TEXT PRIMARY KEY,
  media_source_id   TEXT NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
  encoder           TEXT NOT NULL CHECK (encoder IN ('libx265', 'hevc_nvenc', 'libsvtav1')),
  preset            TEXT NOT NULL,
  crf_or_bitrate    TEXT NOT NULL,
  input_path        TEXT NOT NULL,
  output_path       TEXT NOT NULL,
  input_size        INTEGER,
  output_size       INTEGER,
  progress_percent  REAL NOT NULL DEFAULT 0,
  started_at        TEXT,
  completed_at      TEXT,
  error_message     TEXT,
  ffmpeg_command    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_encode_jobs_status_created
  ON encode_jobs(status, created_at);

-- =============================================================================
-- Download Jobs — torrent/direct download tasks
-- =============================================================================
CREATE TABLE IF NOT EXISTS download_jobs (
  id                TEXT PRIMARY KEY,
  media_item_id     TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  magnet_or_url     TEXT NOT NULL,
  qbt_hash          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'cancelled')),
  progress_percent  REAL NOT NULL DEFAULT 0,
  download_speed    INTEGER NOT NULL DEFAULT 0,
  save_path         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_download_jobs_status
  ON download_jobs(status);

-- =============================================================================
-- Import Jobs — copy/move operations between sources
-- =============================================================================
CREATE TABLE IF NOT EXISTS import_jobs (
  id                TEXT PRIMARY KEY,
  media_source_id   TEXT NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL CHECK (source_type IN ('local', 'realdebrid', 'torbox')),
  action            TEXT NOT NULL CHECK (action IN ('copy', 'copy_and_encode', 'move', 'preserve')),
  source_path       TEXT NOT NULL,
  destination_path  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress_percent  REAL NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- Audit Logs — activity history
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     TEXT,
  source      TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('user', 'system', 'auto'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
  ON audit_logs(timestamp);

-- =============================================================================
-- App Settings — key-value configuration store
-- =============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- Plex Matches — links between media items and Plex library entries
-- =============================================================================
CREATE TABLE IF NOT EXISTS plex_matches (
  id                TEXT PRIMARY KEY,
  media_item_id     TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  plex_rating_key   TEXT NOT NULL,
  plex_section_id   INTEGER NOT NULL,
  plex_title        TEXT NOT NULL,
  matched_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plex_matches_rating_key
  ON plex_matches(plex_rating_key);

-- FK index: used by unmatched media LEFT JOIN and metadata enrichment
CREATE INDEX IF NOT EXISTS idx_plex_matches_media_item_id
  ON plex_matches(media_item_id);


-- =============================================================================
-- Watch Stats — viewing statistics from Tautulli
-- =============================================================================
CREATE TABLE IF NOT EXISTS watch_stats (
  id                      TEXT PRIMARY KEY,
  media_item_id           TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  plex_rating_key         TEXT NOT NULL,
  total_plays             INTEGER NOT NULL DEFAULT 0,
  last_played_at          TEXT,
  total_watch_time_seconds INTEGER NOT NULL DEFAULT 0,
  unique_viewers          INTEGER NOT NULL DEFAULT 0,
  fetched_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_watch_stats_media_item
  ON watch_stats(media_item_id);
`;

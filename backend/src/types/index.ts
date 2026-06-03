/**
 * SchroDrive Media Manager — Type Definitions
 *
 * Core TypeScript interfaces, type unions, and API envelope types
 * used throughout the backend.
 *
 * @module types
 */

// =============================================================================
// Type Unions / Enums
// =============================================================================

/** Source type indicating where a media file resides. */
export type SourceType = 'local' | 'realdebrid' | 'torbox';

/** Current status of a media source file. */
export type MediaStatus = 'available' | 'encoding' | 'downloading' | 'optimised' | 'failed';

/** Status of an encoding job. */
export type EncodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

/** Status of a download job. */
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

/** Supported video encoder backends. */
export type EncoderType = 'libx265' | 'hevc_nvenc' | 'libsvtav1';

/** Classification of media content. */
export type MediaType = 'movie' | 'series' | 'episode' | 'other';

/** Action to perform when importing media. */
export type ImportAction = 'copy' | 'copy_and_encode' | 'move' | 'preserve';

/** Import job status. */
export type ImportStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Source of an audit log entry. */
export type AuditSource = 'user' | 'system' | 'auto';

// =============================================================================
// Model Interfaces
// =============================================================================

/** A media item tracked by SchroDrive (film, series, episode, etc.). */
export interface MediaItem {
  id: string;
  title: string;
  type: MediaType;
  year: number | null;
  imdbId: string | null;
  tmdbId: string | null;
  tvdbId: string | null;
  posterUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A specific file source for a media item. */
export interface MediaSource {
  id: string;
  mediaItemId: string;
  sourceType: SourceType;
  filePath: string;
  fileName: string;
  fileSize: number;
  status: MediaStatus;
  isOptimised: boolean;
  doNotProcess: boolean;
  createdAt: string;
  updatedAt: string;
}

/** FFprobe analysis results for a media source file. */
export interface FileProbe {
  id: string;
  mediaSourceId: string;
  codecName: string;
  codecProfile: string | null;
  width: number;
  height: number;
  durationSeconds: number;
  bitrateBps: number;
  framerate: number | null;
  pixelFormat: string | null;
  colourSpace: string | null;
  colourTransfer: string | null;
  colourPrimaries: string | null;
  isHdr: boolean;
  is10bit: boolean;
  audioTracks: number;
  subtitleTracks: number;
  chaptersCount: number;
  rawJson: string | null;
  probedAt: string;
}

/** An encoding/transcoding job. */
export interface EncodeJob {
  id: string;
  mediaSourceId: string;
  status: EncodeStatus;
  encoder: EncoderType;
  preset: string;
  crfOrBitrate: string;
  inputPath: string;
  outputPath: string;
  inputSize: number | null;
  outputSize: number | null;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  ffmpegCommand: string | null;
  createdAt: string;
}

/** A torrent/direct download job. */
export interface DownloadJob {
  id: string;
  mediaItemId: string;
  source: string;
  magnetOrUrl: string;
  qbtHash: string | null;
  status: DownloadStatus;
  progressPercent: number;
  downloadSpeed: number;
  savePath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An import job for copying/moving media between sources. */
export interface ImportJob {
  id: string;
  mediaSourceId: string;
  sourceType: SourceType;
  action: ImportAction;
  sourcePath: string;
  destinationPath: string;
  status: ImportStatus;
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
}

/** An audit log entry recording system activity. */
export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  source: AuditSource;
}

/** A key-value application setting. */
export interface AppSettings {
  key: string;
  value: string;
  updatedAt: string;
}

/** A matched Plex library entry for a media item. */
export interface PlexMatch {
  id: string;
  mediaItemId: string;
  plexRatingKey: string;
  plexSectionId: number;
  plexTitle: string;
  matchedAt: string;
}

/** Watch statistics from Tautulli for a media item. */
export interface WatchStats {
  id: string;
  mediaItemId: string;
  plexRatingKey: string;
  totalPlays: number;
  lastPlayedAt: string | null;
  totalWatchTimeSeconds: number;
  uniqueViewers: number;
  fetchedAt: string;
}

// =============================================================================
// API Envelope
// =============================================================================

/** Standard API response wrapper used by all endpoints. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/** Paginated response payload. */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =============================================================================
// Dashboard Types
// =============================================================================

/** Dashboard summary statistics. */
export interface DashboardStats {
  totalLocal: number;
  totalRealDebrid: number;
  totalTorBox: number;
  totalOptimised: number;
  storageUsed: number;
  storageFree: number;
  storageTotal: number;
  activeEncodes: number;
  activeDownloads: number;
  recentActivity: AuditLog[];
  preservationSuggestions: unknown[];
}

// =============================================================================
// File Browser Types
// =============================================================================

/** A file or directory entry in the file browser. */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string | null;
  children?: FileEntry[];
}

// =============================================================================
// Media Item with Relations
// =============================================================================

/** A full media item with all related data, used for detail views. */
export interface MediaItemDetail extends MediaItem {
  sources: MediaSource[];
  probes: FileProbe[];
  encodeHistory: EncodeJob[];
  plexMatch: PlexMatch | null;
  watchStats: WatchStats | null;
}

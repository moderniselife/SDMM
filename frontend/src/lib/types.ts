/* ============================================================
 * SchroDrive Media Manager — Frontend Type Definitions
 * Mirrors backend models but remains independently maintained.
 * ============================================================ */

// ── Source types ────────────────────────────────────────────
export type SourceType = 'LOCAL' | 'REALDEBRID' | 'TORBOX';
export type MediaStatus = 'AVAILABLE' | 'ENCODING' | 'DOWNLOADING' | 'OPTIMISED' | 'FAILED' | 'PENDING';
export type Resolution = '4K' | '1080p' | '720p' | '480p' | 'SD' | 'UNKNOWN';
export type Codec = 'HEVC' | 'H.264' | 'AV1' | 'VP9' | 'MPEG4' | 'OTHER';
export type EncoderType = 'ffmpeg' | 'handbrake' | 'av1an';

// ── Media Item ─────────────────────────────────────────────
export interface MediaItem {
  id: string;
  title: string;
  year?: number;
  posterUrl?: string;
  backdropUrl?: string;
  mediaType: 'movie' | 'show' | 'episode';
  resolution: Resolution;
  codec: Codec;
  sources: MediaSource[];
  status: MediaStatus;
  sizeBytes: number;
  addedAt: string;
  updatedAt: string;
}

// ── Media Source ────────────────────────────────────────────
export interface MediaSource {
  id: string;
  mediaId: string;
  sourceType: SourceType;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  resolution: Resolution;
  codec: Codec;
  status: MediaStatus;
  lastAccessed?: string;
  createdAt: string;
}

// ── Encode Job ─────────────────────────────────────────────
export interface EncodeJob {
  id: string;
  mediaId: string;
  sourceId: string;
  inputFile: string;
  outputFile: string;
  encoder: EncoderType;
  preset: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  eta?: number;
  speed?: string;
  inputSize: number;
  outputSize?: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

// ── Download ───────────────────────────────────────────────
export interface Download {
  id: string;
  name: string;
  magnetUri?: string;
  torrentUrl?: string;
  source: 'REALDEBRID' | 'TORBOX' | 'QBITTORRENT';
  status: 'DOWNLOADING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'QUEUED';
  progress: number;
  sizeBytes: number;
  downloadedBytes: number;
  speed?: number;
  eta?: number;
  addedAt: string;
  completedAt?: string;
}

// ── Cloud File (RealDebrid / TorBox) ───────────────────────
export interface CloudFile {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  mimeType?: string;
  parentId?: string;
  children?: CloudFile[];
  sourceType: SourceType;
  createdAt: string;
}

// ── Dashboard ──────────────────────────────────────────────
export interface DashboardStats {
  totalLocalItems: number;
  totalCloudItems: number;
  activeEncodes: number;
  spaceSavedBytes: number;
  storageUsed: number;
  storageTotal: number;
  storageSections: StorageSection[];
}

export interface StorageSection {
  name: string;
  usedBytes: number;
  colour: string;
}

// ── Activity Log ───────────────────────────────────────────
export interface ActivityEntry {
  id: string;
  type: 'encode' | 'download' | 'copy' | 'delete' | 'scan' | 'preserve' | 'refresh';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ── Preservation Suggestion ────────────────────────────────
export interface PreservationSuggestion {
  mediaId: string;
  title: string;
  posterUrl?: string;
  playCount: number;
  sourceType: SourceType;
  reason: string;
}

// ── Settings ───────────────────────────────────────────────
export interface AppSettings {
  encoding: {
    encoder: EncoderType;
    preset: string;
    hwAccel: boolean;
    crf: number;
    maxParallel: number;
  };
  audio: {
    mode: 'preserve_all' | 'single_audio' | 'convert_high_bitrate';
    bitrateThreshold: number;
    targetCodec: string;
  };
  subtitles: {
    mode: 'copy_all' | 'burn_default' | 'strip';
    burnLanguage: string;
  };
  integrations: {
    plexUrl: string;
    plexToken: string;
    tautulliUrl: string;
    tautulliApiKey: string;
    qbittorrentUrl: string;
    qbittorrentUsername: string;
    qbittorrentPassword: string;
    realDebridApiKey: string;
    torBoxApiKey: string;
  };
  scanner: {
    intervalMinutes: number;
    extensions: string[];
    watchDirectories: string[];
  };
  about: {
    version: string;
    uptime: string;
    databaseSize: number;
    totalMediaCount: number;
  };
}

// ── API Response Wrappers ──────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ── SSE Event ──────────────────────────────────────────────
export interface SSEEvent {
  type: 'encode_progress' | 'download_progress' | 'job_complete' | 'job_failed' | 'scan_complete';
  payload: Record<string, unknown>;
}

// ── Filter / Search ────────────────────────────────────────
export interface MediaFilters {
  source: SourceType | 'ALL';
  resolution: Resolution | 'ALL';
  codec: Codec | 'ALL';
  status: MediaStatus | 'ALL';
  sort: 'name' | 'size' | 'date_added' | 'resolution';
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

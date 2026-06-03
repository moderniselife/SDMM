/**
 * SchroDrive Media Manager — API Client
 * Uses `ky` as a lightweight fetch wrapper for type-safe API calls.
 */
import ky from 'ky';
import type {
  ApiResponse,
  AppSettings,
  CloudFile,
  DashboardStats,
  Download,
  EncodeJob,
  MediaFilters,
  MediaItem,
  PaginatedResponse,
  ActivityEntry,
  PreservationSuggestion,
  PlexSearchResult,
} from './types';

/** Pre-configured ky instance pointing at the backend proxy */
const api = ky.create({
  prefix: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Dashboard ──────────────────────────────────────────────

export async function fetchDashboard(): Promise<DashboardStats> {
  const res = await api.get('dashboard').json<ApiResponse<DashboardStats>>();
  return res.data;
}

export async function fetchActivity(limit = 20): Promise<ActivityEntry[]> {
  const res = await api.get('activity', { searchParams: { limit } }).json<ApiResponse<ActivityEntry[]>>();
  return res.data;
}

export async function fetchPreservationSuggestions(): Promise<PreservationSuggestion[]> {
  const res = await api.get('suggestions/preservation').json<ApiResponse<PreservationSuggestion[]>>();
  return res.data;
}

// ── Media ──────────────────────────────────────────────────

export async function fetchMedia(filters: Partial<MediaFilters>): Promise<PaginatedResponse<MediaItem>> {
  const searchParams: Record<string, string> = {};
  if (filters.source && filters.source !== 'ALL') searchParams.source = filters.source;
  if (filters.resolution && filters.resolution !== 'ALL') searchParams.resolution = filters.resolution;
  if (filters.codec && filters.codec !== 'ALL') searchParams.codec = filters.codec;
  if (filters.status && filters.status !== 'ALL') searchParams.status = filters.status;
  if (filters.sort) searchParams.sort = filters.sort;
  if (filters.sortDir) searchParams.sortDir = filters.sortDir;
  if (filters.page) searchParams.page = String(filters.page);
  if (filters.pageSize) searchParams.pageSize = String(filters.pageSize);

  const res = await api.get('media', { searchParams }).json<ApiResponse<PaginatedResponse<MediaItem>>>();
  return res.data;
}

export async function fetchMediaById(id: string): Promise<MediaItem> {
  const res = await api.get(`media/${id}`).json<ApiResponse<MediaItem>>();
  return res.data;
}

export async function searchMedia(query: string): Promise<MediaItem[]> {
  const res = await api.get('media/search', { searchParams: { q: query } }).json<ApiResponse<MediaItem[]>>();
  return res.data;
}

// ── Cloud Sources ──────────────────────────────────────────

export async function fetchCloudFiles(
  sourceType: 'realdebrid' | 'torbox',
  path?: string,
): Promise<CloudFile[]> {
  const searchParams: Record<string, string> = {};
  if (path) searchParams.path = path;
  const res = await api.get(`sources/${sourceType}/files`, { searchParams }).json<ApiResponse<CloudFile[]>>();
  return res.data;
}

export async function copyToLocal(sourceId: string): Promise<void> {
  await api.post(`sources/${sourceId}/copy`);
}

export async function encodeToLocal(sourceId: string): Promise<void> {
  await api.post(`sources/${sourceId}/encode`);
}

export async function preserve(sourceId: string): Promise<void> {
  await api.post(`sources/${sourceId}/preserve`);
}

// ── Downloads ──────────────────────────────────────────────

export async function fetchDownloads(): Promise<Download[]> {
  const res = await api.get('downloads').json<ApiResponse<Download[]>>();
  return res.data;
}

export async function addMagnet(magnetUri: string): Promise<Download> {
  const res = await api.post('downloads/magnet', { json: { magnetUri } }).json<ApiResponse<Download>>();
  return res.data;
}

export async function addTorrentUrl(url: string): Promise<Download> {
  const res = await api.post('downloads/url', { json: { url } }).json<ApiResponse<Download>>();
  return res.data;
}

export async function uploadTorrent(file: File): Promise<Download> {
  const formData = new FormData();
  formData.append('torrent', file);
  const res = await api
    .post('downloads/upload', {
      body: formData,
      headers: { 'Content-Type': undefined as unknown as string }, // Let browser set boundary
    })
    .json<ApiResponse<Download>>();
  return res.data;
}

// ── Encode Queue ───────────────────────────────────────────

export async function fetchEncodeQueue(): Promise<EncodeJob[]> {
  const res = await api.get('encode-queue').json<ApiResponse<EncodeJob[]>>();
  return res.data;
}

export async function cancelEncode(id: string): Promise<void> {
  await api.post(`encode-queue/${id}/cancel`);
}

export async function retryEncode(id: string): Promise<void> {
  await api.post(`encode-queue/${id}/retry`);
}

// ── Plex ───────────────────────────────────────────────────

export async function refreshPlex(sectionId?: string): Promise<void> {
  const searchParams: Record<string, string> = {};
  if (sectionId) searchParams.sectionId = sectionId;
  await api.post('plex/refresh', { searchParams });
}

// ── Settings ───────────────────────────────────────────────

export async function fetchSettings(): Promise<AppSettings> {
  const res = await api.get('settings').json<ApiResponse<AppSettings>>();
  return res.data;
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const res = await api.put('settings', { json: settings }).json<ApiResponse<AppSettings>>();
  return res.data;
}

// ── Unmatched Media ────────────────────────────────────────

export async function fetchUnmatched(): Promise<MediaItem[]> {
  const res = await api.get('media/unmatched').json<ApiResponse<MediaItem[]>>();
  return res.data;
}

export async function matchToPlex(mediaItemId: string, plexRatingKey: string): Promise<void> {
  await api.post(`media/${mediaItemId}/match`, { json: { plexRatingKey } });
}

export async function searchPlexForMatch(query: string): Promise<PlexSearchResult[]> {
  const res = await api.get('plex/search', { searchParams: { q: query } }).json<ApiResponse<PlexSearchResult[]>>();
  return res.data;
}

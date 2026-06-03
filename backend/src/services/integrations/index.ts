/**
 * SchroDrive Media Manager — Integrations Module Index
 *
 * Barrel export for all integration clients.
 *
 * @module services/integrations
 */

export { PlexClient, plexClient } from './plex-client';
export { TautulliClient, tautulliClient } from './tautulli-client';
export { QBittorrentClient, qbittorrentClient } from './qbittorrent-client';
export { TmdbClient, tmdbClient } from './tmdb-client';

// Re-export client types
export type { PlexSection, PlexSearchResult, PlexMetadata } from './plex-client';
export type {
  TautulliTopMedia,
  TautulliWatchStats,
  TautulliHistoryEntry,
  PreservationCandidate,
} from './tautulli-client';
export type { QBitTorrentInfo, TorrentFilter } from './qbittorrent-client';
export type {
  TmdbMovie,
  TmdbTvShow,
  TmdbMovieDetail,
  TmdbTvDetail,
  TmdbPosterSize,
} from './tmdb-client';

# Changelog

All notable changes to SchroDrive Media Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **SchroDrive migration** — replaced PD Zurg + TorBox Media Center with unified SchroDrive:
  - Docker config: FUSE mounts, dual provider (RD+TB), dead scanner, backwards-compatible Plex paths
  - Plex/Jellyfin/Emby watchlist integration with unified poller
  - Dynamic per-endpoint rate limit learning (persisted to JSON)
  - Infringing content blocklist (JSON-backed, UI-ready)
  - Full code documentation overhaul (6 core files)
  - Runtime migrated from Node.js to Bun (latest)
  - SchroDrive version bumped to 0.2.0
- **Plex Library page**: Browse Plex library by section (Movies/TV Shows), navigate show → season → episodes with poster art
- **Plex poster proxy**: `/api/plex/proxy/*` endpoint proxies Plex images server-side (token never exposed to client)
- **Plex preservation**: One-click "Preserve All" to queue entire shows/seasons for cloud → local copy
- **PlexClient methods**: `getChildren(ratingKey)` for season/episode browsing, `getMediaFiles(ratingKey)` for file path resolution
- **Plex Library sidebar nav**: New "Plex Library" item with Tv2 icon between Local Library and RealDebrid
- **Preservation suggestions fallback**: When Tautulli is unavailable, suggests cloud-only items with most episodes or largest files

### Fixed

- **Critical: 48GB memory leak** — `findOrCreateMediaItem` queried ALL media_items for EVERY file (39,877 times). Replaced with in-memory `Map<cacheKey, id>` built from one initial query. Memory usage: ~48GB → ~2MB.
- **Critical: Reconciler event loop blocking** — Wrapped 39,877-file reconciliation in SQLite transactions (batches of 500). Without transactions, each INSERT triggered a separate fsync (~10ms each = ~20 minutes blocking). Now completes in ~5 seconds.
- **Poster enrichment never running** — Enrichment now runs after all scanners complete (deferred 5s), processes 100 items at a time (was unlimited), and yields to the event loop every 10 items
- **API throttle too aggressive** — Reduced TMDB throttle from 500ms to 200ms (their rate limit is 40 req/s)
- **Empty preservation suggestions** — Dashboard now shows database-driven suggestions when Tautulli returns empty


- Light mode and system theme preference support
- ThemeProvider with localStorage persistence and system preference tracking
- Theme toggle dropdown in header with animated sun/moon icon transition
- Anti-FOUC inline script applies theme before React hydrates
- CSS custom properties for both light and dark modes
- Light-mode adapted glassmorphism, skeleton loaders, gradient text, and badge colours
- Reconciler service: scanner→DB bridge with filename parsing, fuzzy title matching, and media_items/media_sources upserting
- Metadata enrichment service: Plex-first, TMDB-fallback strategy with bulk Plex library sync
- Watch stats sync service: Tautulli watch statistics with single-item, bulk, and periodic sync modes
- Worker wiring service: real DB-backed dependency injection callbacks for encode, download, and import workers
- PlexClient: getSectionItems() and getRecentlyAdded() methods for library browsing
- Plex routes: replaced stubs with real PlexClient calls (refresh, sections, search, library sync)
- Dashboard: real filesystem storage stats via statfsSync, Tautulli preservation suggestions
- Scanner→Reconciler bridge: discovered files now auto-upserted into database
- Background metadata enrichment triggered after each scan for newly discovered items
- Startup wiring: all workers, periodic scanner, watch sync, and Plex sync boot on server start
- Graceful shutdown stops all background services before closing DB
- Frontend: all 9 pages now use real API calls via useApi hook (no mock data remains)
- Frontend: loading skeletons and error banners on all pages
- New Unmatched Media page: browse unmatched items, search Plex, manually match with confirm UI
- PlexSearchResult type and API functions for Plex matching workflow
- Backend: GET /api/media/unmatched endpoint for items without a Plex match
- Backend: POST /api/media/:id/match endpoint for manual Plex matching with metadata enrichment
- Frontend: WatchStats, PlexMatch, and MediaItemDetail types
- Frontend: MediaDetail watch stats tab shows real data (plays, last watched, watch time, unique viewers)
- Frontend: MediaDetail encode history tab uses real API data
- Backend: GET /api/activity route for audit log entries
- Backend: GET /api/suggestions/preservation route for Tautulli-based suggestions
- Backend: SSE streaming endpoint GET /api/sources/:type/browse for progressive cloud directory loading
- Frontend: useCloudBrowser hook with EventSource for batched progressive file loading
- Database: indexes on media_sources(media_item_id), plex_matches(media_item_id), file_probes(media_source_id)

### Fixed

- Dashboard storage chart now shows real filesystem usage via statfs instead of 0 B
- Sidebar storage bar fetches real data from dashboard API instead of hardcoded 3.2 TB / 8 TB
- Reconciler filename parser now extracts show names from directory paths for episode files (e.g. "Vikings" from /shows/Vikings/Season 2/S02E10.mkv)
- Frontend MediaItem/MediaSource types aligned with backend response shapes
- MediaBadge case-insensitive lookup (backend returns lowercase source types)
- fetchMedia parameter mapping fixed (source→sourceType, pageSize→limit)
- MediaCard, MediaDetail, SearchBar handle optional resolution/codec/status fields
- Cloud files endpoint URL mismatch (/files suffix removed to match backend routes)
- Cloud files response shape transform (backend FileEntry → frontend CloudFile)

### Performance

- Cloud scanners (RealDebrid, TorBox) no longer call stat() on FUSE mounts — eliminated event loop blocking that caused ALL API endpoints to timeout
- Cloud file browser pages rewritten with SSE streaming — no more timeouts on large directories
- Media list and unmatched endpoints use batch IN() queries instead of N+1 per-item SELECTs
- Unmatched media endpoint now has LIMIT 500 (was unbounded)
- Replaced synchronous statfsSync with async statfs in dashboard route
- Added missing FK indexes to prevent full table scans on JOINs
- Increased frontend API timeout from 30s to 120s as safety net

## [0.1.0] - 2026-06-03

### Added

- Initial project scaffolding with Bun monorepo (backend + frontend)
- Docker multi-stage build with FFmpeg, MKVToolNix, and NVIDIA support
- Docker Compose with schrodrive-media and optional qBittorrent services
- SQLite database with 10 tables (media_items, media_sources, file_probes, encode_jobs, download_jobs, import_jobs, audit_logs, app_settings, plex_matches, watch_stats)
- Hono API server with 15+ route groups
- File scanning for local, RealDebrid, and TorBox sources
- FFprobe media analysis and metadata extraction
- FFmpeg encoding pipeline with CPU (x265) and NVIDIA (hevc_nvenc) support
- HDR10 metadata preservation during encoding
- Encoding decision logic with safety guards for cloud content
- Encoding validation (duration check, size comparison, integrity verification)
- Queue workers for encoding, downloads, and imports
- Plex API integration (library scan, search, metadata)
- Tautulli API integration (watch stats, preservation suggestions)
- qBittorrent Web API integration (add/manage torrents)
- TMDB API integration (poster metadata)
- React 19 + Vite + ShadCN/ui frontend
- Overseerr-inspired dark mode UI
- Dashboard with storage analytics and activity feed
- Local library browser with search and filters
- RealDebrid and TorBox browsers (read-only)
- Torrent download manager
- Encoding queue with real-time progress
- Media detail pages with technical specs
- Settings management UI
- Server-Sent Events for real-time updates
- Full audit logging
- Safety: cloud mounts as read-only, partial file writes, confirmation modals
- Environment-based configuration with .env template

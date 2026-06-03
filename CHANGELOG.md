# Changelog

All notable changes to SchroDrive Media Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

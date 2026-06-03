# Changelog

All notable changes to SchroDrive Media Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

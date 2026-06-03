# SchroDrive Media Manager

> Docker-compatible local media manager for Plex stacks. Manage, encode, and preserve your media library with full control over local and cloud storage.

![License](https://img.shields.io/badge/licence-MIT-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-f472b6)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

## 🎯 What It Does

SchroDrive Media Manager helps you transition from cloud-dependent media (RealDebrid, TorBox) to locally owned and optimised media. It provides:

- **📺 Unified Dashboard** — View local, RealDebrid, and TorBox media in one place
- **🔄 Smart Encoding** — Automatic HEVC/H.265 encoding with CPU (x265) or NVIDIA GPU (NVENC)
- **☁️ Cloud Browsing** — Browse RealDebrid and TorBox mounts (read-only, safe)
- **📥 Torrent Downloads** — Built-in qBittorrent integration
- **🛡️ Safety First** — Cloud content is NEVER automatically modified
- **📊 Storage Analytics** — Track space usage and encoding savings
- **🎬 Plex Integration** — Automatic library refresh after imports
- **📈 Tautulli Integration** — Smart preservation suggestions based on watch history

## ⚠️ Critical Safety Rule

> **Cloud content (RealDebrid / TorBox) is NEVER automatically encoded, copied, moved, or modified.** Cloud items are only processed when you explicitly click a button in the UI.

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- NVIDIA GPU + drivers (for hardware encoding)
- NVIDIA Container Toolkit
- Existing Plex stack
- (Optional) qBittorrent

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/schrodrive-media.git
cd schrodrive-media
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your tokens and API keys
```

Required variables:
| Variable | Description |
|:---------|:------------|
| `PLEX_TOKEN` | Your Plex authentication token |
| `TAUTULLI_API_KEY` | Tautulli API key (Settings → Web Interface → API) |
| `QBITTORRENT_USERNAME` | qBittorrent Web UI username |
| `QBITTORRENT_PASSWORD` | qBittorrent Web UI password |
| `TMDB_API_KEY` | TMDB API key for poster metadata |

### 3. Create Required Directories

```bash
sudo mkdir -p /mnt/media/{downloads/incomplete,downloads/complete,staging,library}
sudo mkdir -p /home/joseph/schrodrive-media/config
sudo chown -R 1000:1000 /mnt/media /home/joseph/schrodrive-media
```

### 4. Build and Start

```bash
# Build the Docker image
docker compose build

# Start the services
docker compose up -d
```

### 5. Access the UI

Open `http://your-server-ip:8686` in your browser.

## 📁 Directory Structure

| Path (Container) | Host Path | Purpose |
|:-----------------|:----------|:--------|
| `/config` | `/home/joseph/schrodrive-media/config` | App config, database, logs |
| `/media/downloads/incomplete` | `/mnt/media/downloads/incomplete` | Active torrent downloads |
| `/media/downloads/complete` | `/mnt/media/downloads/complete` | Completed downloads (auto-encode) |
| `/media/staging` | `/mnt/media/staging` | Files waiting to be processed |
| `/media/library` | `/mnt/media/library` | Optimised media for Plex |
| `/cloud/realdebrid` | `/pd_zurg/mnt/pd_zurg` | RealDebrid mount (**read-only**) |
| `/cloud/torbox` | `/home/joseph/torbox` | TorBox mount (**read-only**) |

## 🎬 Encoding Defaults

### CPU (libx265)

| Resolution | CRF | Preset | Pixel Format |
|:-----------|:----|:-------|:-------------|
| 4K HDR | 19 | slow | yuv420p10le |
| 4K SDR | 21 | slow | yuv420p10le |
| 1080p | 22 | slow | yuv420p10le |
| 720p | 24 | slow | yuv420p10le |
| 480p | 25 | slow | yuv420p10le |

### NVIDIA NVENC (hevc_nvenc)

| Resolution | Target Bitrate | Max Bitrate | Preset |
|:-----------|:---------------|:------------|:-------|
| 4K HDR | 20 Mbps | 24 Mbps | p6 |
| 4K SDR | 15 Mbps | 18 Mbps | p6 |
| 1080p | 6 Mbps | 8 Mbps | p6 |
| 720p | 3 Mbps | 4 Mbps | p6 |
| 480p | 1.5 Mbps | 2 Mbps | p6 |

## 🔌 Integration with Existing Stack

Add the `schrodrive-media` and `qbittorrent` services from `docker-compose.yml` to your existing stack, or run them alongside:

```bash
docker compose -f your-existing-compose.yml -f docker-compose.yml up -d
```

## 🛡️ Safety Checklist

- [x] RealDebrid mount is `:ro` (read-only) in Docker
- [x] TorBox mount is `:ro` (read-only) in Docker
- [x] Cloud content is never auto-encoded
- [x] Cloud actions require explicit user confirmation
- [x] Encode output writes to `.partial.mkv` first (Plex ignores partial files)
- [x] Atomic rename only after successful validation
- [x] Output duration verified within 2 seconds of source
- [x] Output size compared to source (skipped if larger)
- [x] No automatic deletion of original files
- [x] Tokens are never logged
- [x] Environment variables used for all secrets

## 🏗️ Tech Stack

| Component | Technology |
|:----------|:-----------|
| Runtime | Bun |
| Backend | Hono (TypeScript) |
| Frontend | React 19 + Vite + ShadCN/ui |
| Database | SQLite (bun:sqlite) |
| Styling | TailwindCSS v4 |
| Encoding | FFmpeg (x265 / hevc_nvenc) |
| Container | Docker + NVIDIA Runtime |

## 📄 Licence

MIT

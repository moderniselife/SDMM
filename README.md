<p align="center">
  <a href="https://github.com/moderniselife/ContentManager">
    <img src="SchroDrive/assets/logo.png" alt="SchroDrive Logo" height="150">
  </a>
</p>

<h1 align="center">SchroDrive Media Manager</h1>

<p align="center">
  <strong>The local storage companion to SchroDrive.</strong>
  <br />
  <em>Transition debrid-cached media to locally owned, hardware-optimised, and preserved local libraries.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/licence-MIT-7c3aed?style=for-the-badge" alt="Licence">
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6?style=for-the-badge" alt="Runtime">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=for-the-badge" alt="Docker">
  <img src="https://img.shields.io/badge/Tailwind--CSS--v4-38bdf8?style=for-the-badge&logo=tailwind-css" alt="Tailwind CSS">
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-system-architecture">Architecture</a> •
  <a href="#-directory-structure">Directory Structure</a> •
  <a href="#-encoding-defaults">Encoding Defaults</a> •
  <a href="#-safety-checklist">Safety Checklist</a> •
  <a href="#-tech-stack">Tech Stack</a>
</p>

---

## 🎯 What is SchroDrive Media Manager?

While **SchroDrive** mounts debrid-cached torrents directly as virtual FUSE directories for streaming, **SchroDrive Media Manager** is the local media coordinator. It runs alongside your Plex, Jellyfin, and Emby stack to discover media, download files from cloud mounts, compress them using high-speed hardware-accelerated encoding, and organise them into local folders.

It helps you selectively transition cloud-dependent media to permanent, locally stored files with minimal space consumption.

---

## 🏗️ System Architecture

The following diagram illustrates how the SchroDrive stack automates request handling, cloud streaming, watch stats tracking, and local library preservation:

```mermaid
graph TD
    user["User"] -->|Requests Media| overseerr["Overseerr"]
    overseerr -->|Auto-Adds Magnet| sd["SchroDrive (API + FUSE)"]
    sd -->|Mounts FUSE Drives| ms["Plex / Jellyfin / Emby"]
    user -->|Streams Media| ms
    ms -->|Logs Play Activity| tautulli["Tautulli"]
    tautulli -->|Popularity Suggestions| sdmm["SchroDrive Media Manager"]
    sdmm -->|Triggers Download| qbit["qBittorrent"]
    qbit -->|Downloads Cloud Files| sdmm
    sdmm -->|Auto-Encodes (NVENC/x265)| sdmm
    sdmm -->|Moves to Local Storage| local["Local Media Library"]
    local -->|Triggers Refresh| ms
```

---

## ✨ Features

### 📺 Unified Dashboard
- Browse your local library and active cloud mounts (RealDebrid / TorBox) side-by-side.
- Monitor active encoding jobs, CPU/GPU utilisation, and encoding queue tasks in real-time.
- View immediate space-saving statistics (e.g. original size vs encoded size).

### 🔄 Smart Hardware Encoding
- Automatic HEVC/H.265 encoding utilising either **NVIDIA NVENC (hevc_nvenc)** for hardware acceleration or **CPU (libx265)**.
- Full preservation of HDR10 metadata, subtitle tracks, and audio channels during transcodes.
- Automatically compares output files to source files and skips/warns if the transcode is larger than the original.

### 📥 Cloud-to-Local Preservation
- Seamlessly copies debrid files from read-only mounts to local storage.
- Automatically triggers a Plex library refresh upon successful local file import.
- Uses one-click "Preserve" commands in the UI to import files, whole seasons, or entire shows.

### 📈 Tautulli Popularity Sync
- Integrates with Tautulli to monitor user watch history.
- Automatically generates preservation suggestions based on items in your cloud libraries that have high play counts or multiple viewers.
- Minimises host storage space by only keeping popular or frequently watched items locally.

### 🛡️ Safety-First Execution
- Enforces read-only bindings on all debrid mount points to prevent accidental cloud deletions.
- Writes files to `.partial` extensions first so Plex does not index half-finished transcodes.
- Performs atomic renames and compares source/destination durations to ensure file integrity.

---

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed.
- NVIDIA GPU + drivers installed (for hardware-accelerated encoding).
- [NVIDIA Container Toolkit](https://github.com/NVIDIA/nvidia-container-toolkit) configured on host.
- An existing Plex, Jellyfin, or Emby stack.

### 1. Clone the Repository
```bash
git clone https://github.com/moderniselife/ContentManager.git
cd ContentManager
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and customize your credentials
```

Required variables:
| Variable | Description |
|:---|:---|
| `PLEX_TOKEN` | Plex authentication token (required for Plex sync) |
| `TAUTULLI_API_KEY` | Tautulli API key (Settings → Web Interface → API) |
| `QBITTORRENT_USERNAME` | qBittorrent Web UI username |
| `QBITTORRENT_PASSWORD` | qBittorrent Web UI password |
| `TMDB_API_KEY` | TMDB API key for matching movie/show poster art |

### 3. Create Required Folders
Ensure media folders exist on the host with correct permissions:
```bash
sudo mkdir -p /mnt/media/{downloads/incomplete,downloads/complete,staging,library}
sudo mkdir -p /home/joseph/schrodrive-media/config
sudo chown -R 1000:1000 /mnt/media /home/joseph/schrodrive-media
```

### 4. Deploy the Stack
Build and launch the container stack using Docker Compose:
```bash
# Build the Docker image
docker compose build

# Start services in the background
docker compose up -d
```

### 5. Access the Web GUI
Open your browser and navigate to `http://<your-server-ip>:8686`.

---

## 📁 Directory Structure

| Path (Container) | Host Path | Purpose |
|:---|:---|:---|
| `/config` | `/home/joseph/schrodrive-media/config` | SQLite database, logs, and app settings |
| `/media/downloads/incomplete` | `/mnt/media/downloads/incomplete` | Temporary directory for active downloads |
| `/media/downloads/complete` | `/mnt/media/downloads/complete` | Finished torrent downloads waiting for auto-encoding |
| `/media/staging` | `/mnt/media/staging` | Temporary workspace for active transcodes |
| `/media/library` | `/mnt/media/library` | Permanent, optimised local media library folder |
| `/cloud/` | `/home/joseph/schrodrive/` | Root of SchroDrive FUSE mount points (Read-Only) |

---

## 🎬 Encoding Defaults

### CPU Transcoding (`libx265`)
Highly efficient software encoding (slow but achieves maximum compression ratios).

| Resolution | CRF | Preset | Pixel Format |
|:---|:---|:---|:---|
| **4K HDR** | 19 | slow | yuv420p10le |
| **4K SDR** | 21 | slow | yuv420p10le |
| **1080p** | 22 | slow | yuv420p10le |
| **720p** | 24 | slow | yuv420p10le |
| **480p** | 25 | slow | yuv420p10le |

### NVIDIA Transcoding (`hevc_nvenc`)
Hardware-accelerated encoding (extremely fast transcode speeds with low CPU overhead).

| Resolution | Target Bitrate | Max Bitrate | Preset |
|:---|:---|:---|:---|
| **4K HDR** | 20 Mbps | 24 Mbps | p6 |
| **4K SDR** | 15 Mbps | 18 Mbps | p6 |
| **1080p** | 6 Mbps | 8 Mbps | p6 |
| **720p** | 3 Mbps | 4 Mbps | p6 |
| **480p** | 1.5 Mbps | 2 Mbps | p6 |

---

## 🛡️ Safety Checklist

To prevent library corruption or accidental data loss, SchroDrive Media Manager enforces the following safety controls:
- [x] **Read-Only Mounts**: Cloud directories under `/cloud/` are mounted as `:ro` (read-only) inside the container.
- [x] **No Cloud Auto-Processing**: Debrid-cached files are never auto-encoded, moved, or deleted. All cloud preservation flows must be manually initiated in the UI.
- [x] **Partial Writes Protection**: FFmpeg output files are written with a `.partial.mkv` extension so Plex doesn't scan incomplete streams.
- [x] **Atomic Renames**: Once encoding completes successfully, files are renamed atomically to their final names.
- [x] **Duration Matching**: Compares transcode duration to source duration; discards output if they differ by more than 2 seconds.
- [x] **Transcode Size Threshold**: Verifies that the transcode is smaller than the original. If not, the transcode is discarded, and the original file is preserved instead to save space.

---

## 🏗️ Tech Stack

| Component | Technology |
|:---|:---|
| **Runtime** | Bun |
| **Backend** | Hono (TypeScript) |
| **Frontend** | React 19 + Vite + shadcn/ui |
| **Database** | SQLite (`bun:sqlite` with WAL mode) |
| **Styling** | Tailwind CSS v4 |
| **Encoding Engine** | FFmpeg (libx265 / hevc_nvenc) |
| **Containerization** | Docker + NVIDIA Container Runtime |

---

## 📄 Licence

This project is licensed under the terms specified in the [LICENCE](LICENSE) file.

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GradientText from '@/components/ui/GradientText';
import AnimatedSection, { AnimatedChild } from '@/components/ui/AnimatedSection';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import NewsletterSignup from '@/components/ui/NewsletterSignup';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ChangeCategory = 'Added' | 'Changed' | 'Fixed' | 'Performance';

interface ChangeEntry {
  category: ChangeCategory;
  text: string;
}

interface VersionEntry {
  version: string;
  date: string;
  emoji?: string;
  tagline?: string;
  changes: ChangeEntry[];
}

type Product = 'core' | 'media-manager';

/* ------------------------------------------------------------------ */
/*  Changelog Data (from real CHANGELOG.md files)                      */
/* ------------------------------------------------------------------ */

const coreChangelog: VersionEntry[] = [
  {
    version: 'v0.8.0',
    date: '2026-06-07',
    emoji: '🎬',
    tagline: 'Native *arr bridge',
    changes: [
      { category: 'Added', text: 'Native Radarr/Sonarr integration via built-in fake qBittorrent Web API v2 bridge — replaces Decypharr, RDT-Client, and other bridge tools' },
      { category: 'Added', text: 'Zero external containers — full torrent lifecycle: receives magnet → submits to debrid → polls status → detects on mount → creates symlinks → reports completion' },
      { category: 'Added', text: 'Dual pipeline support: Overseerr → SchröDrive (direct) AND Overseerr → Radarr/Sonarr → SchröDrive (bridge) simultaneously' },
      { category: 'Changed', text: 'README: Added comprehensive *arr bridge documentation with architecture diagrams and comparison table' },
    ],
  },
  {
    version: 'v0.7.0',
    date: '2026-06-06',
    emoji: '🚀',
    tagline: '.torrent file support, cloud storage mounts, STRM short-codes',
    changes: [
      { category: 'Added', text: '.torrent file support — indexer results that return .torrent URLs are no longer discarded, implemented across all 4 providers' },
      { category: 'Added', text: 'Cloud storage virtual mounts: Mega, Google Drive, Dropbox, OneDrive via rclone combine backend' },
      { category: 'Added', text: 'STRM short-code service: stable 16-char codes that 302 redirect to ephemeral CDN URLs with 7-day TTL' },
      { category: 'Added', text: 'Error video fallback: 10-second black MP4 served when download URLs are broken, preventing media player hangs' },
      { category: 'Added', text: 'Anime output category: organiser now outputs anime to Anime/ instead of lumping into TV/' },
      { category: 'Added', text: 'Cloud Link Manager: mount public shared folder links (Mega, GDrive, Dropbox) as FUSE directories' },
      { category: 'Added', text: 'HTTP directory listing adapter: mount any open directory (Nginx autoindex, Apache mod_autoindex)' },
      { category: 'Fixed', text: 'TV season packs classified as movies — added season-only pack detection patterns' },
    ],
  },
  {
    version: 'v0.6.0',
    date: '2026-06-06',
    emoji: '🧬',
    tagline: 'Mount stability, persistent deduplication, Zurg-style mounts',
    changes: [
      { category: 'Added', text: 'Zurg-style organised mounts: WebDAV bridge presents virtual __all__/, anime/, shows/, movies/ directories' },
      { category: 'Added', text: 'Jellyseerr support: JELLYSEERR_URL, JELLYSEERR_API_KEY, JELLYSEERR_AUTH as drop-in Overseerr replacements' },
      { category: 'Added', text: 'Persistent Overseerr processed state and known_magnets in SQLite — survives container restarts' },
      { category: 'Fixed', text: 'Mount health monitor: removed 502/503 from fatal error patterns — they are intentional for dead torrents and were causing unnecessary remounts during Plex streams' },
      { category: 'Fixed', text: 'Repeated torrent re-adding: in-memory processed Set lost on restart now persisted to SQLite, plus infohash-based deduplication' },
    ],
  },
  {
    version: 'v0.5.0 – v0.5.3',
    date: '2026-06-06',
    emoji: '🔑',
    tagline: 'Multi-token download rotation + self-healing',
    changes: [
      { category: 'Added', text: 'Multi-token download rotation: provider-agnostic token rotation inspired by Zurg, rotating on HTTP 503 bandwidth limits across all 4 providers' },
      { category: 'Added', text: 'Unified media server stream detection: pauses background loops during active Plex, Jellyfin, and Emby streams' },
      { category: 'Added', text: 'FUSE mount self-healing and port probing: auto-detects stale mounts, scans up to 20 sequential ports if WebDAV port is blocked' },
      { category: 'Added', text: 'Graceful FUSE unmounting on shutdown (SIGTERM/SIGINT) and auto-updater exits — prevents orphaned rclone processes' },
      { category: 'Fixed', text: 'RealDebrid repair robustness: propagation delays and automatic 404 retry loops when re-adding magnets' },
      { category: 'Fixed', text: 'Mount service: EEXIST crash on startup with stale FUSE mount points from previous crashes' },
      { category: 'Fixed', text: 'Rate limiter: recordSuccess() no longer clears active backoffs prematurely' },
    ],
  },
  {
    version: 'v0.4.0',
    date: '2026-06-06',
    emoji: '🗄️',
    tagline: 'SQLite persistence + Stremio addon + 4-provider repair',
    changes: [
      { category: 'Added', text: 'SQLite persistence layer with WAL journalling, 5 tables, graceful degradation, and daily pruning' },
      { category: 'Added', text: 'Stremio addon server: SchröDrive exposes itself as an installable Stremio addon for searching and streaming' },
      { category: 'Added', text: 'Torrent repair on all 4 providers (RealDebrid, TorBox, AllDebrid, Premiumize) with 3-phase repair cycle' },
      { category: 'Changed', text: 'Blacklist auto-migration from /tmp to ./data with SQLite backup and recovery' },
    ],
  },
  {
    version: 'v0.3.0',
    date: '2026-06-06',
    emoji: '🏆',
    tagline: 'Feature parity — zero gaps vs competitors',
    changes: [
      { category: 'Added', text: 'Trakt, Mdblist, and Listrr watchlist integrations — 6 total watchlist sources' },
      { category: 'Added', text: 'Torrentio, Comet, Zilean, and Mediafusion scrapers with shared Stremio helpers' },
      { category: 'Added', text: 'Unified search layer: searchAll() merges indexer + scraper results with deduplication and SCRAPER_MODE config' },
      { category: 'Added', text: '3-phase torrent repair: same-provider → cross-provider → delete + blacklist + replacement search' },
      { category: 'Added', text: 'Pre-emptive repair: detects stalling torrents (stuck >30min) and repairs before they die' },
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-06-06',
    emoji: '🚀',
    tagline: 'Major release — replaces PD Zurg + TorBox Media Center',
    changes: [
      { category: 'Added', text: 'Plex, Jellyfin, and Emby watchlist integration with unified poller and library refresh' },
      { category: 'Added', text: 'Dynamic per-endpoint rate limit learning with adaptive delays, persisted to JSON' },
      { category: 'Added', text: 'Infringing content blocklist with JSON-backed storage, pattern matching, and provider attribution' },
      { category: 'Added', text: 'AllDebrid and Premiumize provider implementations with full DebridProvider interface' },
      { category: 'Added', text: 'Persistent torrent blacklist and dead torrent auto-lifecycle (10 failures → delete → blacklist → replace)' },
      { category: 'Changed', text: 'Runtime migrated from Node.js to Bun — Dockerfile, lockfiles, and all scripts updated' },
      { category: 'Changed', text: 'Full code documentation overhaul with JSDoc across 6 core files' },
    ],
  },
];

const mediaManagerChangelog: VersionEntry[] = [
  {
    version: 'Unreleased',
    date: 'In Development',
    changes: [
      { category: 'Changed', text: 'Repository cleanup: untracked deployment scripts and environment configs to keep local customisations private, purged from git history' },
      { category: 'Fixed', text: 'Container restart loop and FUSE lockups: unmount FUSE paths unconditionally on startup (Phase 0), 3-second delay on shutdown for rclone daemon cleanup' },
      { category: 'Fixed', text: 'Mermaid syntax rendering error in README by quoting edge labels containing parentheses' },
    ],
  },
  {
    version: 'Post-v0.1.0',
    date: '2026-06-03+',
    tagline: 'Rapid iteration after initial release',
    changes: [
      { category: 'Fixed', text: 'Critical: 48GB memory leak — findOrCreateMediaItem queried ALL media_items for EVERY file (39,877 times). Replaced with in-memory Map. Memory usage: ~48GB → ~2MB' },
      { category: 'Fixed', text: 'Critical: Reconciler event loop blocking — wrapped 39,877-file reconciliation in SQLite transactions (batches of 500). Completion: ~20 minutes → ~5 seconds' },
      { category: 'Fixed', text: 'Poster enrichment never running — now deferred 5s, processes 100 items at a time, yields every 10 items' },
      { category: 'Added', text: 'Plex Library page: browse by section, navigate show → season → episodes with poster art and one-click "Preserve All"' },
      { category: 'Added', text: 'Plex poster proxy: server-side image proxying so token is never exposed to client' },
      { category: 'Added', text: 'Light/dark theme support with system preference tracking, localStorage persistence, and anti-FOUC inline script' },
      { category: 'Added', text: 'Cloud SSE streaming browser: progressive file loading with EventSource for large cloud directories' },
      { category: 'Added', text: 'Unmatched Media page: browse unmatched items, search Plex, manually match with confirmation UI' },
      { category: 'Added', text: 'Preservation suggestions fallback: when Tautulli unavailable, suggests cloud-only items with most episodes or largest files' },
      { category: 'Performance', text: 'Cloud scanners no longer call stat() on FUSE mounts — eliminated event loop blocking causing ALL API endpoints to timeout' },
      { category: 'Performance', text: 'Media list and unmatched endpoints use batch IN() queries instead of N+1 per-item SELECTs' },
      { category: 'Performance', text: 'Added missing FK indexes to prevent full table scans on JOINs' },
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-06-03',
    tagline: 'Initial release',
    changes: [
      { category: 'Added', text: 'Initial project scaffolding with Bun monorepo (backend + frontend)' },
      { category: 'Added', text: 'Docker multi-stage build with FFmpeg, MKVToolNix, and NVIDIA support' },
      { category: 'Added', text: 'SQLite database with 10 tables (media_items, media_sources, file_probes, encode_jobs, and more)' },
      { category: 'Added', text: 'Hono API server with 15+ route groups' },
      { category: 'Added', text: 'FFmpeg encoding pipeline with CPU (x265) and NVIDIA (hevc_nvenc) support' },
      { category: 'Added', text: 'HDR10 metadata preservation during encoding' },
      { category: 'Added', text: 'Queue workers for encoding, downloads, and imports' },
      { category: 'Added', text: 'React 19 + Vite + ShadCN/ui frontend with Overseerr-inspired dark mode UI' },
      { category: 'Added', text: 'SSE for real-time updates, full audit logging, and environment-based configuration' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Colour + Category Helpers                                          */
/* ------------------------------------------------------------------ */

const categoryConfig: Record<ChangeCategory, { colour: string; bgColour: string; borderColour: string }> = {
  Added: {
    colour: 'text-emerald-400',
    bgColour: 'bg-emerald-500/10',
    borderColour: 'border-emerald-500/20',
  },
  Changed: {
    colour: 'text-blue-400',
    bgColour: 'bg-blue-500/10',
    borderColour: 'border-blue-500/20',
  },
  Fixed: {
    colour: 'text-amber-400',
    bgColour: 'bg-amber-500/10',
    borderColour: 'border-amber-500/20',
  },
  Performance: {
    colour: 'text-purple-400',
    bgColour: 'bg-purple-500/10',
    borderColour: 'border-purple-500/20',
  },
};

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function CategoryBadge({ category }: { category: ChangeCategory }) {
  const config = categoryConfig[category];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${config.colour} ${config.bgColour} border ${config.borderColour}`}
    >
      {category}
    </span>
  );
}

function TimelineCard({ entry, index }: { entry: VersionEntry; index: number }) {
  return (
    <motion.div
      className="relative pl-8 md:pl-12 pb-12 last:pb-0"
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as const }}
    >
      {/* Timeline dot */}
      <div className="absolute left-0 top-0 flex items-center justify-center">
        <div className="h-3 w-3 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 ring-4 ring-[#030014]" />
      </div>

      {/* Card */}
      <div className="rounded-2xl backdrop-blur-xl bg-white/[0.03] border border-white/10 p-6 hover:bg-white/[0.06] transition-colors duration-300">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-pink-500/20 text-white border border-purple-500/30">
            {entry.emoji && <span>{entry.emoji}</span>}
            {entry.version}
          </span>
          <span className="text-sm text-white/40">{entry.date}</span>
        </div>

        {entry.tagline && (
          <p className="text-sm text-white/50 italic mb-4">{entry.tagline}</p>
        )}

        {/* Changes */}
        <div className="space-y-2.5">
          {entry.changes.map((change, i) => (
            <motion.div
              key={i}
              className="flex gap-3 items-start"
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
            >
              <CategoryBadge category={change.category} />
              <p className="text-sm text-white/60 leading-relaxed flex-1">
                {change.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ChangelogPage() {
  const [activeTab, setActiveTab] = useState<Product>('core');

  const tabs: { key: Product; label: string }[] = [
    { key: 'core', label: 'SchröDrive Core' },
    { key: 'media-manager', label: 'Media Manager' },
  ];

  const activeData = activeTab === 'core' ? coreChangelog : mediaManagerChangelog;

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 px-4 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <AnimatedSection className="mx-auto max-w-3xl relative z-10">
          <AnimatedChild>
            <GradientText as="h1" className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
              Changelog
            </GradientText>
          </AnimatedChild>
          <AnimatedChild>
            <p className="mt-4 text-lg text-white/50 max-w-xl mx-auto">
              Track every improvement, fix, and feature across the Schrödinger&apos;s Copy stack.
            </p>
          </AnimatedChild>
        </AnimatedSection>
      </section>

      {/* Tabs */}
      <section className="px-4 mb-12">
        <div className="mx-auto max-w-3xl flex justify-center">
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                  activeTab === tab.key
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                {activeTab === tab.key && (
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/20"
                    layoutId="activeTab"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-3xl relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[5px] top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/50 via-blue-500/30 to-transparent" />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeData.map((entry, i) => (
                <TimelineCard key={entry.version} entry={entry} index={i} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-xl">
          <NewsletterSignup />
        </div>
      </section>

      <Footer />
    </div>
  );
}

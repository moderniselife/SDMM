/**
 * Dashboard Page — Overview with stats, storage, active jobs, and activity.
 */
import { QuickStats } from '@/components/dashboard/QuickStats';
import { StorageChart } from '@/components/dashboard/StorageChart';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { EncodeProgress } from '@/components/encoding/EncodeProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaBadge } from '@/components/media/MediaBadge';
import { Shield } from 'lucide-react';
import type {
  ActivityEntry,
  DashboardStats,
  EncodeJob,
  PreservationSuggestion,
} from '@/lib/types';

// ── Mock data (will be replaced with API calls) ────────────

const mockStats: DashboardStats = {
  totalLocalItems: 1_247,
  totalCloudItems: 3_892,
  activeEncodes: 2,
  spaceSavedBytes: 842_000_000_000, // ~842 GB
  storageUsed: 3_200_000_000_000,
  storageTotal: 8_000_000_000_000,
  storageSections: [
    { name: 'Movies', usedBytes: 1_800_000_000_000, colour: '#6366f1' },
    { name: 'TV Shows', usedBytes: 950_000_000_000, colour: '#8b5cf6' },
    { name: 'Anime', usedBytes: 320_000_000_000, colour: '#a855f7' },
    { name: 'Other', usedBytes: 130_000_000_000, colour: '#22d3ee' },
  ],
};

const mockEncodeJobs: EncodeJob[] = [
  {
    id: '1',
    mediaId: 'm1',
    sourceId: 's1',
    inputFile: '/media/movies/Interstellar.2014.2160p.mkv',
    outputFile: '/media/optimised/Interstellar.2014.1080p.hevc.mkv',
    encoder: 'ffmpeg',
    preset: 'slow',
    status: 'RUNNING',
    progress: 67.3,
    eta: 2340,
    speed: '1.8x',
    inputSize: 45_000_000_000,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    mediaId: 'm2',
    sourceId: 's2',
    inputFile: '/media/shows/Breaking.Bad.S01E01.mkv',
    outputFile: '/media/optimised/Breaking.Bad.S01E01.hevc.mkv',
    encoder: 'ffmpeg',
    preset: 'medium',
    status: 'RUNNING',
    progress: 23.1,
    eta: 5670,
    speed: '2.1x',
    inputSize: 3_500_000_000,
    createdAt: new Date().toISOString(),
  },
];

const mockActivity: ActivityEntry[] = [
  {
    id: '1',
    type: 'encode',
    description: 'Started encoding Interstellar (2014) to HEVC 1080p',
    timestamp: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: '2',
    type: 'download',
    description: 'Completed download: The Matrix (1999) 4K Remux',
    timestamp: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
  {
    id: '3',
    type: 'copy',
    description: 'Copied Dune: Part Two from RealDebrid to local storage',
    timestamp: new Date(Date.now() - 45 * 60_000).toISOString(),
  },
  {
    id: '4',
    type: 'scan',
    description: 'Library scan completed — 3 new items found',
    timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: '5',
    type: 'preserve',
    description: 'Preserved Blade Runner 2049 locally from TorBox',
    timestamp: new Date(Date.now() - 5 * 3600_000).toISOString(),
  },
  {
    id: '6',
    type: 'refresh',
    description: 'Plex library refresh triggered for Movies section',
    timestamp: new Date(Date.now() - 8 * 3600_000).toISOString(),
  },
  {
    id: '7',
    type: 'encode',
    description: 'Completed encoding The Dark Knight to HEVC — saved 62%',
    timestamp: new Date(Date.now() - 12 * 3600_000).toISOString(),
  },
];

const mockSuggestions: PreservationSuggestion[] = [
  {
    mediaId: 'p1',
    title: 'Oppenheimer',
    posterUrl: 'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    playCount: 12,
    sourceType: 'REALDEBRID',
    reason: 'Played 12 times from cloud — consider preserving locally',
  },
  {
    mediaId: 'p2',
    title: 'Barbie',
    posterUrl: 'https://image.tmdb.org/t/p/w200/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg',
    playCount: 8,
    sourceType: 'TORBOX',
    reason: 'Played 8 times from cloud — consider preserving locally',
  },
  {
    mediaId: 'p3',
    title: 'Everything Everywhere All at Once',
    posterUrl: 'https://image.tmdb.org/t/p/w200/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg',
    playCount: 6,
    sourceType: 'REALDEBRID',
    reason: 'Played 6 times from cloud — consider preserving locally',
  },
];

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Row 1: Quick Stats */}
      <QuickStats stats={mockStats} />

      {/* Row 2: Storage + Active Jobs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StorageChart stats={mockStats} />
        <EncodeProgress jobs={mockEncodeJobs} />
      </div>

      {/* Row 3: Preservation Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            Preservation Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mockSuggestions.map((s) => (
              <div
                key={s.mediaId}
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50 cursor-pointer"
              >
                {s.posterUrl ? (
                  <img
                    src={s.posterUrl}
                    alt={s.title}
                    className="h-12 w-9 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-gradient-to-br from-muted to-muted/60 text-sm font-bold text-muted-foreground">
                    {s.title.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <MediaBadge type={s.sourceType} />
                    <span className="text-xs text-muted-foreground">
                      {s.playCount} plays
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Row 4: Activity Feed */}
      <ActivityFeed entries={mockActivity} />
    </div>
  );
}

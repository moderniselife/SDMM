/**
 * Dashboard Page — Overview with stats, storage, active jobs, and activity.
 */
import { QuickStats } from '@/components/dashboard/QuickStats';
import { StorageChart } from '@/components/dashboard/StorageChart';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { EncodeProgress } from '@/components/encoding/EncodeProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaBadge } from '@/components/media/MediaBadge';
import { Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import {
  fetchDashboard,
  fetchActivity,
  fetchPreservationSuggestions,
  fetchEncodeQueue,
} from '@/lib/api';
import type {
  ActivityEntry,
  DashboardStats,
  PreservationSuggestion,
} from '@/lib/types';

// ── Backend → Frontend Transformers ────────────────────────

interface BackendDashboardStats {
  totalLocal: number;
  totalRealDebrid: number;
  totalTorBox: number;
  totalOptimised: number;
  storageUsed: number;
  storageFree: number;
  storageTotal: number;
  activeEncodes: number;
  activeDownloads: number;
  recentActivity: unknown[];
  preservationSuggestions: unknown[];
}

interface BackendAuditLog {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  source: string;
}

function transformDashboardStats(raw: BackendDashboardStats): DashboardStats {
  return {
    totalLocalItems: raw.totalLocal,
    totalCloudItems: raw.totalRealDebrid + raw.totalTorBox,
    activeEncodes: raw.activeEncodes,
    spaceSavedBytes: 0, // Calculated once encodes complete
    storageUsed: raw.storageUsed,
    storageTotal: raw.storageTotal || (raw.storageUsed + raw.storageFree),
    storageSections: [
      { name: 'Used', usedBytes: raw.storageUsed, colour: '#6366f1' },
    ],
  };
}

const ACTION_TYPE_MAP: Record<string, ActivityEntry['type']> = {
  encode: 'encode',
  encode_start: 'encode',
  encode_complete: 'encode',
  download: 'download',
  download_complete: 'download',
  copy: 'copy',
  copy_complete: 'copy',
  scan: 'scan',
  scan_complete: 'scan',
  preserve: 'preserve',
  preserve_complete: 'preserve',
  refresh: 'refresh',
  plex_refresh: 'refresh',
};

function transformAuditLogs(logs: BackendAuditLog[]): ActivityEntry[] {
  return logs.map((log) => ({
    id: log.id,
    type: ACTION_TYPE_MAP[log.action] ?? 'scan',
    description: log.details || log.action,
    timestamp: log.timestamp,
  }));
}

// ── Skeleton Components ────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function Dashboard() {
  const { data: rawStats, loading: statsLoading, error: statsError } = useApi(
    fetchDashboard,
  );
  const { data: rawActivity, loading: activityLoading } = useApi(
    () => fetchActivity(10),
  );
  const { data: suggestions, loading: suggestionsLoading } = useApi(
    fetchPreservationSuggestions,
  );
  const { data: encodeJobs, loading: encodesLoading } = useApi(
    fetchEncodeQueue,
  );

  // Transform backend responses to frontend types
  const stats = rawStats
    ? transformDashboardStats(rawStats as unknown as BackendDashboardStats)
    : null;
  const activity = rawActivity
    ? transformAuditLogs(rawActivity as unknown as BackendAuditLog[])
    : null;

  return (
    <div className="space-y-6">
      {/* Row 1: Quick Stats */}
      {statsError && <ErrorBanner message={statsError} />}
      {statsLoading || !stats ? <StatsSkeleton /> : <QuickStats stats={stats} />}

      {/* Row 2: Storage + Active Jobs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {statsLoading || !stats ? <CardSkeleton /> : <StorageChart stats={stats} />}
        {encodesLoading ? (
          <CardSkeleton />
        ) : (
          <EncodeProgress jobs={encodeJobs ?? []} />
        )}
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
          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !suggestions || suggestions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No preservation suggestions at the moment.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s: PreservationSuggestion) => (
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
                        {s.playCount != null ? `${s.playCount} plays` : ''}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 4: Activity Feed */}
      {activityLoading ? (
        <CardSkeleton />
      ) : (
        <ActivityFeed entries={activity ?? []} />
      )}
    </div>
  );
}

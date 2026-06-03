/**
 * QuickStats — Row of 4 stat cards with glassmorphism and hover lift.
 */
import { HardDrive, Cloud, Cpu, TrendingDown } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import type { DashboardStats } from '@/lib/types';

interface QuickStatsProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconColour: string;
  pulse?: boolean;
}

function StatCard({ icon, label, value, iconColour, pulse }: StatCardProps) {
  return (
    <div className="glass-card hover-lift rounded-xl p-5">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            iconColour,
            pulse && 'badge-pulse',
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 rounded-lg skeleton" />
        <div className="space-y-2">
          <div className="h-7 w-16 skeleton" />
          <div className="h-4 w-24 skeleton" />
        </div>
      </div>
    </div>
  );
}

export function QuickStats({ stats, loading }: QuickStatsProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<HardDrive className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
        label="Total Local Items"
        value={stats.totalLocalItems.toLocaleString()}
        iconColour="bg-emerald-500/15"
      />
      <StatCard
        icon={<Cloud className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        label="Cloud Items"
        value={stats.totalCloudItems.toLocaleString()}
        iconColour="bg-amber-500/15"
      />
      <StatCard
        icon={<Cpu className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
        label="Active Encodes"
        value={stats.activeEncodes.toLocaleString()}
        iconColour="bg-purple-500/15"
        pulse={stats.activeEncodes > 0}
      />
      <StatCard
        icon={<TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />}
        label="Space Saved"
        value={formatBytes(stats.spaceSavedBytes)}
        iconColour="bg-green-500/15"
      />
    </div>
  );
}

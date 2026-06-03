/**
 * MediaBadge — Colour-coded pill badges for source type, status, and resolution.
 */
import { cn } from '@/lib/utils';
import type { MediaStatus, Resolution, SourceType } from '@/lib/types';

type BadgeType = SourceType | MediaStatus | Resolution;

const badgeConfig: Record<string, { bg: string; text: string; pulse?: boolean }> = {
  // Source badges
  LOCAL: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  REALDEBRID: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  TORBOX: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },

  // Status badges
  ENCODING: { bg: 'bg-purple-500/20', text: 'text-purple-400', pulse: true },
  DOWNLOADING: { bg: 'bg-blue-500/20', text: 'text-blue-400', pulse: true },
  OPTIMISED: { bg: 'bg-green-500/20', text: 'text-green-400' },
  AVAILABLE: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400' },
  PENDING: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },

  // Resolution badges
  '4K': { bg: 'bg-slate-600/30', text: 'text-slate-300' },
  '1080p': { bg: 'bg-slate-600/30', text: 'text-slate-300' },
  '720p': { bg: 'bg-slate-600/30', text: 'text-slate-300' },
  '480p': { bg: 'bg-slate-600/30', text: 'text-slate-400' },
  SD: { bg: 'bg-slate-600/30', text: 'text-slate-400' },
  UNKNOWN: { bg: 'bg-slate-600/30', text: 'text-slate-500' },
};

interface MediaBadgeProps {
  type: BadgeType;
  label?: string;
  className?: string;
}

export function MediaBadge({ type, label, className }: MediaBadgeProps) {
  const config = badgeConfig[type] ?? { bg: 'bg-slate-600/30', text: 'text-slate-400' };
  const displayLabel = label ?? type;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        config.bg,
        config.text,
        config.pulse && 'badge-pulse',
        className,
      )}
    >
      {displayLabel}
    </span>
  );
}

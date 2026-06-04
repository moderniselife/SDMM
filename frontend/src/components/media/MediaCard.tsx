/**
 * MediaCard — Poster card showing media item with badges and hover overlay.
 */
import { useNavigate } from 'react-router-dom';
import { Play, Copy, Zap, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaBadge } from './MediaBadge';
import { Button } from '@/components/ui/button';
import type { MediaItem } from '@/lib/types';

interface MediaCardProps {
  item: MediaItem;
  className?: string;
}

export function MediaCard({ item, className }: MediaCardProps) {
  const navigate = useNavigate();
  // Pick the most relevant source badge:
  // - If any source is local, show LOCAL
  // - Otherwise show the first cloud source type (REALDEBRID, TORBOX)
  // - Only fall back to UNKNOWN if sources array is truly empty
  const primarySource = (() => {
    if (!item.sources || item.sources.length === 0) return 'UNKNOWN';
    const local = item.sources.find((s) => s.sourceType.toLowerCase() === 'local');
    if (local) return 'LOCAL';
    return (item.sources[0]?.sourceType ?? 'UNKNOWN').toUpperCase();
  })();

  return (
    <div
      className={cn(
        'media-card group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:scale-[1.03] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
        className,
      )}
      onClick={() => navigate(`/media/${item.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/media/${item.id}`);
        }
      }}
      aria-label={`View details for ${item.title}`}
    >
      {/* Poster Image */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={`${item.title} poster`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <span className="text-4xl font-bold text-muted-foreground">
              {item.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Badges — top right */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <MediaBadge type={primarySource} />
          {item.status && item.status !== 'AVAILABLE' && <MediaBadge type={item.status} />}
        </div>

        {/* Hover overlay with action buttons */}
        <div className="media-card-overlay rounded-xl">
          <Button
            size="icon"
            variant="secondary"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: play action
            }}
            aria-label={`Play ${item.title}`}
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: copy action
            }}
            aria-label={`Quick actions for ${item.title}`}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: encode action
            }}
            aria-label={`Encode ${item.title}`}
          >
            <Zap className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: more actions
            }}
            aria-label={`More options for ${item.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Title & info */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2">
            {item.year && <span className="text-xs text-slate-400">{item.year}</span>}
            {item.resolution && <MediaBadge type={item.resolution} />}
          </div>
        </div>
      </div>
    </div>
  );
}

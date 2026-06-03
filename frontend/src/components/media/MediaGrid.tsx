/**
 * MediaGrid — Responsive CSS grid for media cards.
 * 1 col mobile → 2 sm → 3 md → 4 lg → 5 xl → 6 2xl
 */
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/lib/types';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
  loading?: boolean;
  className?: string;
}

/** Skeleton placeholder for loading state */
function MediaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[2/3] w-full skeleton" />
    </div>
  );
}

export function MediaGrid({ items, loading, className }: MediaGridProps) {
  if (loading) {
    return (
      <div
        className={cn(
          'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
          className,
        )}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center">
          <span className="text-3xl">🎬</span>
        </div>
        <h3 className="text-lg font-semibold text-foreground">No media found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your filters or adding new content.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        className,
      )}
    >
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}

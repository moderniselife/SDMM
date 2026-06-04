/**
 * CloudLibrary Page — Browse cloud-stored media (RealDebrid + TorBox) with filters and pagination.
 */
import { FilterBar } from '@/components/common/FilterBar';
import { MediaGrid } from '@/components/media/MediaGrid';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, AlertCircle, Cloud } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { fetchMedia } from '@/lib/api';
import { useMediaStore } from '@/stores/media';

// ── Skeleton Grid ──────────────────────────────────────────

function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function CloudLibrary() {
  const { resolution, codec, status, sort, sortDir, currentPage, pageSize } =
    useMediaStore();
  const setPage = useMediaStore((s) => s.setPage);

  // Fetch cloud items — we query twice (RD + TorBox) via the 'ALL' source
  // but use a custom approach: fetch without source filter, then the backend
  // shows everything. Instead, we use a special approach.
  // Actually, the backend doesn't have a 'cloud' filter, so we'll fetch
  // items that have RD or TorBox sources but NOT local.
  // For now, use source filter — we can show RD and TB separately or together.
  // Let's just not filter by source and let the badge show what's what.
  // Actually the simplest approach: fetch all, but we need a 'cloud' filter.
  // Let me use the existing API — items with realdebrid OR torbox sources.
  // The backend only supports one sourceType at a time, so we'll fetch both
  // and merge, OR we add a 'cloud' virtual filter.
  
  // Simpler: fetch all items and let the user see everything that's on cloud.
  // We'll do two sequential calls or use 'ALL' and filter client-side.
  // Best: just show all non-local by fetching without source filter and noting
  // that local-only items won't appear since they have no cloud sources.
  
  // Simplest correct solution: fetch realdebrid items (they're the bulk)
  // and show both RD and TB. We need to update the backend to support
  // a 'cloud' composite filter, OR fetch without filtering.

  // For now: don't filter by source — show everything. The badge correctly
  // identifies source type. The "Cloud Library" title makes it clear.
  // Items that are ONLY local won't have cloud badges.
  const { data, loading, error } = useApi(
    () =>
      fetchMedia({
        resolution,
        codec,
        status,
        sort,
        sortDir,
        page: currentPage,
        pageSize,
      }),
    [resolution, codec, status, sort, sortDir, currentPage, pageSize],
  );

  // Client-side filter: only show items that have at least one cloud source
  const allItems = data?.items ?? [];
  const items = allItems.filter((item) =>
    item.sources?.some((s) =>
      s.sourceType.toLowerCase() === 'realdebrid' || s.sourceType.toLowerCase() === 'torbox',
    ),
  );
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Cloud className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Cloud Library</h1>
          <p className="text-xs text-muted-foreground">
            Media stored on RealDebrid &amp; TorBox
          </p>
        </div>
      </div>

      <FilterBar />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <MediaGridSkeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Cloud className="mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm">No cloud media items found matching your filters.</p>
        </div>
      ) : (
        <MediaGrid items={items} />
      )}

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1 || loading}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <span className="px-4 text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages || loading}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

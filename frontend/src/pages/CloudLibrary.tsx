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

  // Use 'CLOUD' as a virtual source filter — backend maps this to
  // IN ('realdebrid', 'torbox') so we get proper server-side filtering
  // and correct pagination counts.
  const { data, loading, error } = useApi(
    () =>
      fetchMedia({
        source: 'CLOUD' as any, // Virtual composite filter
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

  const items = data?.items ?? [];
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

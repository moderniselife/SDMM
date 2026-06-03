/**
 * PlexLibrary Page — Browse the Plex library by section.
 * Browse shows → seasons → episodes with Plex posters.
 * Preserve whole shows/seasons/movies with one click.
 */
import { useState, useCallback } from 'react';
import {
  Tv2,
  Film,
  ChevronRight,
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import {
  fetchPlexSections,
  fetchPlexSectionItems,
  fetchPlexChildren,
  preservePlexItem,
  type PlexSection,
  type PlexSectionItem,
  type PreserveResult,
} from '@/lib/api';

// ── Helpers ────────────────────────────────────────────────

/**
 * Build a proxied Plex poster URL.
 * Plex thumb paths look like: /library/metadata/12345/thumb/1234567
 * We proxy through the backend to avoid exposing the token to the client.
 */
function plexPosterUrl(thumb: string | null): string | null {
  if (!thumb) return null;
  // Use the Plex API proxy: the backend already handles token injection
  return `/api/plex/proxy${thumb}`;
}

// ── Skeleton ───────────────────────────────────────────────

function PlexGridSkeleton() {
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

// ── Plex Card ──────────────────────────────────────────────

interface PlexCardProps {
  item: PlexSectionItem;
  onClick: () => void;
  onPreserve?: () => void;
  preserving?: boolean;
}

function PlexCard({ item, onClick, onPreserve, preserving }: PlexCardProps) {
  const posterSrc = plexPosterUrl(item.thumb);
  const typeIcon = item.type === 'movie' ? Film : item.type === 'show' ? Tv2 : FolderOpen;
  const TypeIcon = typeIcon;

  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-border',
        'bg-card transition-all duration-200 hover:scale-[1.03] hover:border-primary/30',
        'hover:shadow-lg hover:shadow-primary/5',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`View ${item.title}`}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={`${item.title} poster`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <TypeIcon className="mb-2 h-10 w-10 text-muted-foreground/50" />
            <span className="text-2xl font-bold text-muted-foreground">
              {item.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Type badge */}
        <div className="absolute left-2 top-2">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            'bg-purple-500/90 text-white',
          )}>
            <Play className="h-2.5 w-2.5" />
            PLEX
          </span>
        </div>

        {/* Hover overlay with preserve button */}
        {onPreserve && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              disabled={preserving}
              onClick={(e) => {
                e.stopPropagation();
                onPreserve();
              }}
            >
              {preserving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Preserve Locally
            </Button>
          </div>
        )}

        {/* Title & info */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2">
            {item.year && <span className="text-xs text-slate-400">{item.year}</span>}
            <span className="text-xs capitalize text-slate-500">{item.type}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Breadcrumb Trail ───────────────────────────────────────

interface BreadcrumbItem {
  label: string;
  sectionId?: string;
  ratingKey?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

function Breadcrumbs({ items, onNavigate }: BreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {i < items.length - 1 ? (
            <button
              onClick={() => onNavigate(i)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </button>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export function PlexLibrary() {
  // Navigation state
  const [selectedSection, setSelectedSection] = useState<PlexSection | null>(null);
  const [selectedItem, setSelectedItem] = useState<PlexSectionItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<PlexSectionItem | null>(null);

  // Preservation state
  const [preservingKeys, setPreservingKeys] = useState<Set<string>>(new Set());
  const [preserveResults, setPreserveResults] = useState<PreserveResult[]>([]);

  // Data fetching
  const { data: sections, loading: sectionsLoading, error: sectionsError } = useApi(fetchPlexSections);

  const { data: sectionItems, loading: itemsLoading } = useApi(
    () => (selectedSection ? fetchPlexSectionItems(selectedSection.key) : Promise.resolve([])),
    [selectedSection?.key],
  );

  const { data: children, loading: childrenLoading } = useApi(
    () => (selectedItem ? fetchPlexChildren(selectedItem.ratingKey) : Promise.resolve([])),
    [selectedItem?.ratingKey],
  );

  const { data: episodes, loading: episodesLoading } = useApi(
    () => (selectedSeason ? fetchPlexChildren(selectedSeason.ratingKey) : Promise.resolve([])),
    [selectedSeason?.ratingKey],
  );

  // Build breadcrumbs
  const breadcrumbs: BreadcrumbItem[] = [{ label: 'Plex Library' }];
  if (selectedSection) breadcrumbs.push({ label: selectedSection.title, sectionId: selectedSection.key });
  if (selectedItem) breadcrumbs.push({ label: selectedItem.title, ratingKey: selectedItem.ratingKey });
  if (selectedSeason) breadcrumbs.push({ label: selectedSeason.title, ratingKey: selectedSeason.ratingKey });

  const handleBreadcrumbNavigate = useCallback((index: number) => {
    if (index === 0) {
      setSelectedSection(null);
      setSelectedItem(null);
      setSelectedSeason(null);
    } else if (index === 1) {
      setSelectedItem(null);
      setSelectedSeason(null);
    } else if (index === 2) {
      setSelectedSeason(null);
    }
  }, []);

  const handlePreserve = useCallback(async (ratingKey: string) => {
    setPreservingKeys((prev) => new Set(prev).add(ratingKey));
    try {
      const result = await preservePlexItem(ratingKey);
      setPreserveResults((prev) => [...prev, result]);
    } catch (err) {
      console.error('Preservation failed:', err);
    } finally {
      setPreservingKeys((prev) => {
        const next = new Set(prev);
        next.delete(ratingKey);
        return next;
      });
    }
  }, []);

  const loading = sectionsLoading || itemsLoading || childrenLoading || episodesLoading;

  // Determine which items to display
  let displayItems: PlexSectionItem[] = [];
  let viewLevel: 'sections' | 'items' | 'children' | 'episodes' = 'sections';

  if (selectedSeason && episodes) {
    displayItems = episodes;
    viewLevel = 'episodes';
  } else if (selectedItem && children) {
    displayItems = children;
    viewLevel = 'children';
  } else if (selectedSection && sectionItems) {
    displayItems = sectionItems;
    viewLevel = 'items';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tv2 className="h-6 w-6 text-purple-500" />
          <h1 className="text-2xl font-bold">Plex Library</h1>
          {loading && (
            <span className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </span>
          )}
        </div>
        {(selectedSection || selectedItem || selectedSeason) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBreadcrumbNavigate(breadcrumbs.length - 2)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        )}
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 1 && (
        <Breadcrumbs items={breadcrumbs} onNavigate={handleBreadcrumbNavigate} />
      )}

      {/* Preservation results banner */}
      {preserveResults.length > 0 && (
        <div className="space-y-2">
          {preserveResults.map((result, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                <strong>{result.title}</strong> — {result.jobsCreated} files queued for preservation
                {result.alreadyLocal > 0 && ` (${result.alreadyLocal} already local)`}
                {result.errors.length > 0 && ` (${result.errors.length} errors)`}
              </span>
              <button
                onClick={() => setPreserveResults((prev) => prev.filter((_, j) => j !== i))}
                className="ml-auto text-xs opacity-60 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {sectionsError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to connect to Plex. Check PLEX_URL and PLEX_TOKEN are configured.
        </div>
      )}

      {/* Section selector */}
      {viewLevel === 'sections' && !sectionsLoading && sections && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {sections
            .filter((s) => s.type === 'movie' || s.type === 'show')
            .map((section) => (
              <button
                key={section.key}
                onClick={() => setSelectedSection(section)}
                className={cn(
                  'group flex items-center gap-4 rounded-xl border border-border bg-card p-6',
                  'transition-all duration-200 hover:border-purple-500/40 hover:bg-purple-500/5',
                  'hover:shadow-lg hover:shadow-purple-500/5 text-left',
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
                  {section.type === 'movie' ? (
                    <Film className="h-6 w-6 text-purple-500" />
                  ) : (
                    <Tv2 className="h-6 w-6 text-purple-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{section.title}</h3>
                  <p className="text-xs capitalize text-muted-foreground">{section.type}s</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </button>
            ))}
        </div>
      )}

      {/* Content grid */}
      {viewLevel !== 'sections' && (
        <>
          {/* Preserve all button for shows/seasons */}
          {(viewLevel === 'items' || viewLevel === 'children') && displayItems.length > 0 && selectedItem && (
            <div className="flex items-center gap-3">
              <Button
                variant="default"
                size="sm"
                className="gap-2 bg-purple-600 hover:bg-purple-700"
                disabled={preservingKeys.has(selectedItem.ratingKey)}
                onClick={() => handlePreserve(selectedItem.ratingKey)}
              >
                {preservingKeys.has(selectedItem.ratingKey) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Preserve All Locally
              </Button>
              <span className="text-xs text-muted-foreground">
                {displayItems.length} items
              </span>
            </div>
          )}

          {loading ? (
            <PlexGridSkeleton />
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen className="mb-3 h-8 w-8" />
              <p className="text-sm">No items found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {displayItems.map((item) => (
                <PlexCard
                  key={item.ratingKey}
                  item={item}
                  onClick={() => {
                    if (item.type === 'show') {
                      setSelectedItem(item);
                    } else if (item.type === 'season') {
                      setSelectedSeason(item);
                    }
                    // Movies and episodes just show preserve option via hover
                  }}
                  onPreserve={() => handlePreserve(item.ratingKey)}
                  preserving={preservingKeys.has(item.ratingKey)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Loading skeleton for initial section load */}
      {sectionsLoading && <PlexGridSkeleton />}
    </div>
  );
}

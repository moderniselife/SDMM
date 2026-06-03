/**
 * UnmatchedMedia Page — Shows media items without a Plex match.
 * Allows searching Plex for matches and linking items.
 */
import { useState } from 'react';
import { Search, Link, X, AlertCircle, Loader2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/useApi';
import { fetchUnmatched, searchPlexForMatch, matchToPlex } from '@/lib/api';
import type { MediaItem, PlexSearchResult } from '@/lib/types';

function UnmatchedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
          <div className="h-16 w-11 animate-pulse rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function UnmatchedMedia() {
  const { data: unmatchedItems, loading, error, refetch } = useApi(fetchUnmatched);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlexSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [matchingItemId, setMatchingItemId] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchPlexForMatch(searchQuery.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleMatch = async (mediaItemId: string, ratingKey: string) => {
    setMatchLoading(true);
    try {
      await matchToPlex(mediaItemId, ratingKey);
      setMatchingItemId(null);
      setSearchResults([]);
      setSearchQuery('');
      refetch();
    } catch {
      // Could add error toast
    } finally {
      setMatchLoading(false);
    }
  };

  const items = unmatchedItems ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-amber-400" />
          Unmatched Media
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Media items that haven&apos;t been matched to a Plex library entry. Match them manually or mark as intentionally unmatched.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Plex Search (shown when matching) */}
      {matchingItemId && (
        <Card className="border-primary/30">
          <CardHeader className="py-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search Plex for a Match
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setMatchingItemId(null);
                  setSearchResults([]);
                  setSearchQuery('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                aria-label="Search Plex"
              />
              <Button onClick={handleSearch} disabled={!searchQuery.trim() || searching}>
                {searching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                Search
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <div
                    key={result.ratingKey}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    {result.thumb ? (
                      <img
                        src={result.thumb}
                        alt={result.title}
                        className="h-12 w-8 shrink-0 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground">
                        {result.title.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{result.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {result.year} • {result.type}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleMatch(matchingItemId, result.ratingKey)}
                      disabled={matchLoading}
                    >
                      {matchLoading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Match
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {searching && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Unmatched Items List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Unmatched Items</span>
            {items.length > 0 && (
              <Badge variant="secondary">{items.length} items</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <UnmatchedSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <HelpCircle className="mb-3 h-10 w-10 text-emerald-400" />
              <p className="text-sm font-medium">All media items are matched!</p>
              <p className="mt-1 text-xs">There are no unmatched items in your library.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item: MediaItem) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="h-16 w-11 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-gradient-to-br from-muted to-muted/60 text-sm font-bold text-muted-foreground">
                      {item.title.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {item.year && (
                        <span className="text-xs text-muted-foreground">{item.year}</span>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {item.mediaType}
                      </Badge>
                      {item.sources.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {item.sources[0].sourceType}
                        </Badge>
                      )}
                    </div>
                    {item.sources.length > 0 && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.sources[0].fileName}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMatchingItemId(item.id);
                        setSearchQuery(item.title);
                        setSearchResults([]);
                      }}
                    >
                      <Search className="mr-1.5 h-3.5 w-3.5" />
                      Match
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

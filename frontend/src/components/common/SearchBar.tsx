/**
 * SearchBar — Global search with debounce and grouped results dropdown.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MediaBadge } from '@/components/media/MediaBadge';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { MediaItem } from '@/lib/types';
import { searchMedia } from '@/lib/api';

interface SearchBarProps {
  className?: string;
}

export function SearchBar({ className }: SearchBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await searchMedia(q);
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 300);
  };

  const handleSelect = (item: MediaItem) => {
    setOpen(false);
    setQuery('');
    navigate(`/media/${item.id}`);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Group results by source type
  const grouped = results.reduce<Record<string, MediaItem[]>>((acc, item) => {
    const key = item.sources[0]?.sourceType ?? 'LOCAL';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search all sources…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          className="pl-9 pr-9 bg-muted/50"
          aria-label="Search all media sources"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {query && !loading && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
          {Object.entries(grouped).map(([source, items]) => (
            <div key={source}>
              <div className="sticky top-0 bg-popover px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {source}
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted cursor-pointer"
                  onClick={() => handleSelect(item)}
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt=""
                      className="h-10 w-7 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-7 items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground">
                      {item.title.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.year && (
                      <p className="text-xs text-muted-foreground">{item.year}</p>
                    )}
                  </div>
                  {item.resolution && <MediaBadge type={item.resolution} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-popover p-4 text-center text-sm text-muted-foreground shadow-xl">
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

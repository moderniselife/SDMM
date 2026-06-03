/**
 * Header — Top bar with page title, global search, theme toggle, and notification bell.
 */
import { useLocation } from 'react-router-dom';
import { Bell, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { useMediaStore } from '@/stores/media';
import { useState, useEffect, useRef, useCallback } from 'react';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/library': 'Local Library',
  '/realdebrid': 'RealDebrid',
  '/torbox': 'TorBox',
  '/downloads': 'Downloads',
  '/encode-queue': 'Encode Queue',
  '/settings': 'Settings',
};

interface HeaderProps {
  onMenuToggle: () => void;
  activeJobs?: number;
}

export function Header({ onMenuToggle, activeJobs = 0 }: HeaderProps) {
  const location = useLocation();
  const setSearch = useMediaStore((s) => s.setSearch);
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive page title from current route
  const pageTitle =
    pageTitles[location.pathname] ??
    (location.pathname.startsWith('/media/') ? 'Media Details' : 'SchroDrive');

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearch(value);
      }, 300);
    },
    [setSearch],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Page title */}
      <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Global search */}
      <div className="relative hidden sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search media…"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-64 pl-9 bg-muted/50"
          aria-label="Search all media"
        />
      </div>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Notification bell */}
      <Button variant="ghost" size="icon" className="relative" aria-label="View notifications">
        <Bell className="h-5 w-5" />
        {activeJobs > 0 && (
          <Badge
            className={cn(
              'absolute -right-1 -top-1 h-5 min-w-[20px] justify-center rounded-full px-1 text-[10px] font-bold',
              'bg-primary text-primary-foreground badge-pulse',
            )}
          >
            {activeJobs}
          </Badge>
        )}
      </Button>
    </header>
  );
}

/**
 * Sidebar — Primary navigation with Lucide icons.
 * Collapsible from 280px to 72px. Shows storage summary at bottom.
 */
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  HardDrive,
  Cloud,
  Package,
  Download,
  Cpu,
  HelpCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Tv2,
} from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { fetchDashboard } from '@/lib/api';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/library', label: 'Local Library', icon: HardDrive },
  { to: '/plex', label: 'Plex Library', icon: Tv2 },
  { to: '/realdebrid', label: 'RealDebrid', icon: Cloud },
  { to: '/torbox', label: 'TorBox', icon: Package },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/encode-queue', label: 'Encode Queue', icon: Cpu },
  { to: '/unmatched', label: 'Unmatched Media', icon: HelpCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  // Fetch real storage stats from the dashboard API
  const { data: dashData } = useApi(fetchDashboard);
  const rawStats = dashData as Record<string, unknown> | null;
  const storageUsedBytes = (rawStats?.storageUsed as number) ?? 0;
  const storageTotalBytes = (rawStats?.storageTotal as number) ?? ((rawStats?.storageUsed as number ?? 0) + (rawStats?.storageFree as number ?? 0));
  const storagePercent = storageTotalBytes > 0 ? (storageUsedBytes / storageTotalBytes) * 100 : 0;
  const storageUsedLabel = formatBytes(storageUsedBytes);
  const storageTotalLabel = formatBytes(storageTotalBytes);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[280px]',
      )}
    >
      {/* Logo / Title */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
          <Disc3 className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-bold text-foreground">SchroDrive</span>
            <span className="truncate text-[10px] text-muted-foreground">Media Manager</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

          const link = (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/15 text-primary sidebar-active-glow'
                  : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={to} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      {/* Storage Summary */}
      <div className={cn('border-t border-border p-4', collapsed && 'px-3')}>
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Storage</span>
              <span>
                {storageUsedLabel} / {storageTotalLabel}
              </span>
            </div>
            <Progress value={storagePercent} className="h-1.5" />
          </div>
        ) : (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <div className="h-2 w-8 overflow-hidden rounded-full bg-primary/20">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {storageUsedLabel} / {storageTotalLabel}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="w-full"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}

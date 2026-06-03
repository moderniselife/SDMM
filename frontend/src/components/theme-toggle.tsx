/**
 * ThemeToggle — Dropdown button to switch between system, light, and dark themes.
 * Shows the current resolved theme icon with a smooth rotation transition.
 */
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from '@/components/theme-provider';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        aria-label="Change theme"
        aria-expanded={open}
        className="relative"
      >
        <Sun className={cn(
          'h-5 w-5 transition-all duration-300',
          resolvedTheme === 'dark' ? 'rotate-90 scale-0' : 'rotate-0 scale-100',
        )} />
        <Moon className={cn(
          'absolute h-5 w-5 transition-all duration-300',
          resolvedTheme === 'dark' ? 'rotate-0 scale-100' : '-rotate-90 scale-0',
        )} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-36 rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colours',
                theme === value
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-popover-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

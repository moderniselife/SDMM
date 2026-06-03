/**
 * ActivityFeed — Scrollable list of recent audit log entries.
 */
import {
  Cpu,
  Download,
  Copy,
  Trash2,
  ScanSearch,
  Shield,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { timeAgo } from '@/lib/utils';
import type { ActivityEntry } from '@/lib/types';

interface ActivityFeedProps {
  entries: ActivityEntry[];
  loading?: boolean;
}

const typeIcons: Record<string, React.ReactNode> = {
  encode: <Cpu className="h-4 w-4 text-purple-400" />,
  download: <Download className="h-4 w-4 text-blue-400" />,
  copy: <Copy className="h-4 w-4 text-cyan-400" />,
  delete: <Trash2 className="h-4 w-4 text-red-400" />,
  scan: <ScanSearch className="h-4 w-4 text-amber-400" />,
  preserve: <Shield className="h-4 w-4 text-emerald-400" />,
  refresh: <RefreshCw className="h-4 w-4 text-indigo-400" />,
};

export function ActivityFeed({ entries, loading }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] pr-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg skeleton" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-3/4 skeleton" />
                    <div className="h-3 w-20 skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recent activity to display.
            </p>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {typeIcons[entry.type] ?? <Activity className="h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(entry.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

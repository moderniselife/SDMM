/**
 * StorageChart — Doughnut chart showing storage breakdown with Recharts.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { DashboardStats } from '@/lib/types';

interface StorageChartProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

const COLOURS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#22d3ee', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
];
const FREE_COLOUR = '#1e293b'; // slate-800

export function StorageChart({ stats, loading }: StorageChartProps) {
  if (loading || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[240px] items-center justify-center">
            <div className="h-40 w-40 rounded-full skeleton" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const freeBytes = stats.storageTotal - stats.storageUsed;
  const chartData = [
    ...stats.storageSections.map((s) => ({ name: s.name, value: s.usedBytes })),
    { name: 'Free Space', value: freeBytes },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={
                      index === chartData.length - 1
                        ? FREE_COLOUR
                        : COLOURS[index % COLOURS.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(222 47% 11%)',
                  border: '1px solid hsl(217 33% 25% / 0.5)',
                  borderRadius: '0.5rem',
                  color: 'hsl(210 40% 98%)',
                  fontSize: '0.75rem',
                }}
                formatter={(value) => formatBytes(Number(value))}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-lg font-bold text-foreground">{formatBytes(stats.storageUsed)}</p>
            <p className="text-xs text-muted-foreground">
              of {formatBytes(stats.storageTotal)}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {stats.storageSections.map((section, i) => (
            <div key={section.name} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLOURS[i % COLOURS.length] }}
              />
              <span className="truncate text-xs text-muted-foreground">{section.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: FREE_COLOUR }} />
            <span className="text-xs text-muted-foreground">Free Space</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

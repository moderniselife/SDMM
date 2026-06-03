/**
 * Downloads Page — Add torrents and view download progress.
 */
import { useState } from 'react';
import { Upload, Link2, Globe, Download as DownloadIcon, CheckCircle2, XCircle, Pause, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatDuration } from '@/lib/utils';
import type { Download } from '@/lib/types';

// ── Mock data ──────────────────────────────────────────────

const mockDownloads: Download[] = [
  {
    id: 'd1',
    name: 'The.Matrix.1999.2160p.UHD.BluRay.Remux.mkv',
    source: 'REALDEBRID',
    status: 'DOWNLOADING',
    progress: 73.5,
    sizeBytes: 72_000_000_000,
    downloadedBytes: 52_920_000_000,
    speed: 45_000_000,
    eta: 423,
    addedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: 'd2',
    name: 'Inception.2010.1080p.BluRay.x264.mkv',
    source: 'TORBOX',
    status: 'DOWNLOADING',
    progress: 31.2,
    sizeBytes: 12_000_000_000,
    downloadedBytes: 3_744_000_000,
    speed: 28_000_000,
    eta: 296,
    addedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  },
  {
    id: 'd3',
    name: 'Parasite.2019.1080p.BluRay.mkv',
    source: 'REALDEBRID',
    status: 'COMPLETED',
    progress: 100,
    sizeBytes: 8_500_000_000,
    downloadedBytes: 8_500_000_000,
    addedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    completedAt: new Date(Date.now() - 1.5 * 3600_000).toISOString(),
  },
  {
    id: 'd4',
    name: 'Fight.Club.1999.720p.BluRay.mkv',
    source: 'QBITTORRENT',
    status: 'FAILED',
    progress: 45,
    sizeBytes: 4_200_000_000,
    downloadedBytes: 1_890_000_000,
    addedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
  },
  {
    id: 'd5',
    name: 'Spirited.Away.2001.2160p.mkv',
    source: 'TORBOX',
    status: 'QUEUED',
    progress: 0,
    sizeBytes: 38_000_000_000,
    downloadedBytes: 0,
    addedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
];

const statusIcons: Record<string, React.ReactNode> = {
  DOWNLOADING: <DownloadIcon className="h-4 w-4 text-blue-400 badge-pulse" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
  PAUSED: <Pause className="h-4 w-4 text-yellow-400" />,
  QUEUED: <Clock className="h-4 w-4 text-slate-400" />,
};

export function Downloads() {
  const [magnetInput, setMagnetInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  return (
    <div className="space-y-6">
      {/* Add Torrent */}
      <Card>
        <CardHeader>
          <CardTitle>Add Download</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="magnet">
            <TabsList>
              <TabsTrigger value="magnet">
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
                Magnet Link
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload .torrent
              </TabsTrigger>
              <TabsTrigger value="url">
                <Globe className="mr-1.5 h-3.5 w-3.5" />
                Torrent URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="magnet" className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="magnet:?xt=urn:btih:..."
                  value={magnetInput}
                  onChange={(e) => setMagnetInput(e.target.value)}
                  className="flex-1"
                  aria-label="Magnet link"
                />
                <Button disabled={!magnetInput.trim()}>
                  <DownloadIcon className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Drag and drop a .torrent file here, or click to browse
                  </p>
                  <Input type="file" accept=".torrent" className="mt-3" aria-label="Upload torrent file" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="url" className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/file.torrent"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1"
                  aria-label="Torrent URL"
                />
                <Button disabled={!urlInput.trim()}>
                  <DownloadIcon className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Downloads Table */}
      <Card>
        <CardHeader>
          <CardTitle>Downloads</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Source</TableHead>
                <TableHead className="w-32">Progress</TableHead>
                <TableHead className="w-24 text-right">Size</TableHead>
                <TableHead className="w-24 text-right">Speed</TableHead>
                <TableHead className="w-20 text-right">ETA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDownloads.map((dl) => (
                <TableRow key={dl.id}>
                  <TableCell>{statusIcons[dl.status]}</TableCell>
                  <TableCell>
                    <p className="truncate max-w-[300px] text-sm font-medium">{dl.name}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {dl.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={dl.progress} className="h-1.5" />
                      <span className="text-xs text-muted-foreground">
                        {dl.progress.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatBytes(dl.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {dl.speed ? `${formatBytes(dl.speed)}/s` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {dl.eta ? formatDuration(dl.eta) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

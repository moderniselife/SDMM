/**
 * Downloads Page — Add torrents and view download progress.
 */
import { useState } from 'react';
import { Upload, Link2, Globe, Download as DownloadIcon, CheckCircle2, XCircle, Pause, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatDuration } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { fetchDownloads, addMagnet, addTorrentUrl, uploadTorrent } from '@/lib/api';
import type { Download } from '@/lib/types';

const statusIcons: Record<string, React.ReactNode> = {
  DOWNLOADING: <DownloadIcon className="h-4 w-4 text-blue-400 badge-pulse" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
  PAUSED: <Pause className="h-4 w-4 text-yellow-400" />,
  QUEUED: <Clock className="h-4 w-4 text-slate-400" />,
};

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-1.5 w-32 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function Downloads() {
  const [magnetInput, setMagnetInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: downloads, loading, error, refetch } = useApi(fetchDownloads);

  const handleAddMagnet = async () => {
    if (!magnetInput.trim()) return;
    setSubmitting(true);
    try {
      await addMagnet(magnetInput.trim());
      setMagnetInput('');
      refetch();
    } catch {
      // Could add error toast here
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;
    setSubmitting(true);
    try {
      await addTorrentUrl(urlInput.trim());
      setUrlInput('');
      refetch();
    } catch {
      // Could add error toast here
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      await uploadTorrent(file);
      refetch();
    } catch {
      // Could add error toast here
    } finally {
      setSubmitting(false);
    }
  };

  const downloadList = downloads ?? [];

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
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMagnet()}
                />
                <Button disabled={!magnetInput.trim() || submitting} onClick={handleAddMagnet}>
                  {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <DownloadIcon className="mr-1.5 h-4 w-4" />}
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
                  <Input
                    type="file"
                    accept=".torrent"
                    className="mt-3"
                    aria-label="Upload torrent file"
                    onChange={handleUploadFile}
                    disabled={submitting}
                  />
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
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                />
                <Button disabled={!urlInput.trim() || submitting} onClick={handleAddUrl}>
                  {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <DownloadIcon className="mr-1.5 h-4 w-4" />}
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
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {loading ? (
            <TableSkeleton />
          ) : downloadList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No downloads yet. Add a magnet link or torrent to get started.
            </p>
          ) : (
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
                {downloadList.map((dl: Download) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

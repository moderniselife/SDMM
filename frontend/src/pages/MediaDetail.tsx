/**
 * MediaDetail Page — Full detail view with hero, tabs for sources, encode history, and stats.
 */
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Copy, Zap, Shield, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { MediaBadge } from '@/components/media/MediaBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatBytes, timeAgo } from '@/lib/utils';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { fetchMediaById, copyToLocal, encodeToLocal, preserve } from '@/lib/api';
import type { MediaSource, EncodeJob } from '@/lib/types';

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-16 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="h-72 w-48 shrink-0 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-4">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-px w-full bg-muted" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                <div className="h-6 w-10 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceRow({ source, onAction }: { source: MediaSource; onAction: (action: string, source: MediaSource) => void }) {
  return (
    <TableRow>
      <TableCell>
        <MediaBadge type={source.sourceType} />
      </TableCell>
      <TableCell>
        <div>
          <p className="truncate max-w-[300px] text-sm font-medium">{source.fileName}</p>
          <p className="truncate max-w-[300px] text-xs text-muted-foreground">{source.filePath}</p>
        </div>
      </TableCell>
      <TableCell>
        <MediaBadge type={source.resolution} />
      </TableCell>
      <TableCell className="text-sm">{source.codec}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatBytes(source.sizeBytes)}</TableCell>
      <TableCell>
        <MediaBadge type={source.status} />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {source.sourceType !== 'LOCAL' && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAction('copy', source)} aria-label="Copy to local">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAction('encode', source)} aria-label="Encode">
                <Zap className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAction('preserve', source)} aria-label="Preserve">
                <Shield className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onAction('delete', source)} aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function MediaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: media, loading, error } = useApi(
    () => fetchMediaById(id!),
    [id],
  );
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    title: string;
    desc: string;
    variant: 'default' | 'destructive';
    sourceId?: string;
    action?: string;
  }>({ open: false, title: '', desc: '', variant: 'default' });

  const handleAction = (action: string, source: MediaSource) => {
    const labels: Record<string, string> = {
      copy: 'Copy to Local',
      encode: 'Copy & Encode',
      preserve: 'Preserve Locally',
      delete: 'Delete Source',
    };
    setConfirmAction({
      open: true,
      title: labels[action] ?? action,
      desc: `Are you sure you want to ${(labels[action] ?? action).toLowerCase()} "${source.fileName}"?`,
      variant: action === 'delete' ? 'destructive' : 'default',
      sourceId: source.id,
      action,
    });
  };

  const handleConfirm = async () => {
    if (!confirmAction.sourceId || !confirmAction.action) return;
    try {
      switch (confirmAction.action) {
        case 'copy':
          await copyToLocal(confirmAction.sourceId);
          break;
        case 'encode':
          await encodeToLocal(confirmAction.sourceId);
          break;
        case 'preserve':
          await preserve(confirmAction.sourceId);
          break;
      }
    } catch {
      // Error handling could be improved with toast notifications
    }
  };

  if (loading) return <DetailSkeleton />;

  if (error || !media) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error ?? 'Media item not found.'}
        </div>
      </div>
    );
  }

  const encodeHistory: EncodeJob[] = [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back
      </Button>

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="w-full md:w-48 shrink-0">
          {media.posterUrl ? (
            <img src={media.posterUrl} alt={media.title} className="w-full rounded-xl shadow-lg" />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/60 shadow-lg">
              <span className="text-6xl font-bold text-muted-foreground">{media.title.charAt(0)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{media.title}</h1>
            {media.year && <p className="text-lg text-muted-foreground">{media.year}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <MediaBadge type={media.resolution} />
            <span className="inline-flex items-center rounded-md bg-slate-600/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">{media.codec}</span>
            <MediaBadge type={media.status} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Sources</p>
              <p className="text-lg font-semibold">{media.sources.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Primary Size</p>
              <p className="text-lg font-semibold">{formatBytes(media.sizeBytes)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Added</p>
              <p className="text-lg font-semibold">{timeAgo(media.addedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="text-lg font-semibold capitalize">{media.mediaType}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button>
              <Play className="mr-1.5 h-4 w-4" />
              Play in Plex
            </Button>
            <Button variant="outline">
              <Zap className="mr-1.5 h-4 w-4" />
              Encode
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="encode-history">Encode History</TabsTrigger>
          <TabsTrigger value="watch-stats">Watch Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Source</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="w-20">Resolution</TableHead>
                    <TableHead className="w-16">Codec</TableHead>
                    <TableHead className="w-20">Size</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {media.sources.map((source) => (
                    <SourceRow key={source.id} source={source} onAction={handleAction} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encode-history">
          <Card>
            <CardContent className="pt-6">
              {encodeHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No encode history for this media item.
                </p>
              ) : (
                <div className="space-y-4">
                  {encodeHistory.map((job) => (
                    <div key={job.id} className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{job.inputFile} → {job.outputFile}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {job.encoder} ({job.preset}) • {job.completedAt ? timeAgo(job.completedAt) : 'In progress'}
                          </p>
                        </div>
                        <MediaBadge type={job.status === 'COMPLETED' ? 'OPTIMISED' : 'ENCODING'} label={job.status} />
                      </div>
                      {job.inputSize && job.outputSize && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatBytes(job.inputSize)} → {formatBytes(job.outputSize)} (
                          {Math.round((1 - job.outputSize / job.inputSize) * 100)}% reduction)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watch-stats">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">—</p>
                  <p className="text-sm text-muted-foreground">Total Plays</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">—</p>
                  <p className="text-sm text-muted-foreground">Last Watched</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">—</p>
                  <p className="text-sm text-muted-foreground">Total Watch Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmModal
        open={confirmAction.open}
        onOpenChange={(open) => setConfirmAction((prev) => ({ ...prev, open }))}
        title={confirmAction.title}
        description={confirmAction.desc}
        confirmLabel={confirmAction.title}
        variant={confirmAction.variant}
        requireTyped={confirmAction.variant === 'destructive' ? 'DELETE' : undefined}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

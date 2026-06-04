/**
 * EncodeQueuePage — Table of encode jobs with status, progress, and actions.
 * Connects to SSE for live progress updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, CheckCircle2, XCircle, Clock, Loader2, RotateCcw, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDuration } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { fetchEncodeQueue, cancelEncode, retryEncode } from '@/lib/api';
import type { EncodeJob } from '@/lib/types';

const statusIcons: Record<string, React.ReactNode> = {
  RUNNING: <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />,
  PENDING: <Clock className="h-4 w-4 text-yellow-400" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
  CANCELLED: <X className="h-4 w-4 text-slate-400" />,
};

const statusOrder = ['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];

function QueueSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-1.5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function EncodeQueuePage() {
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  /** Live progress overrides from SSE — keyed by jobId. */
  const [liveProgress, setLiveProgress] = useState<Record<string, number>>({});

  const { data: jobs, loading, error, refetch } = useApi(fetchEncodeQueue);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // SSE connection for live progress updates
  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL ?? '';
    const url = `${baseUrl}/api/events`;
    const es = new EventSource(url);

    es.addEventListener('encode_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.jobId && typeof data.percent === 'number') {
          // Update progress for running encode
          setLiveProgress((prev) => ({ ...prev, [data.jobId]: data.percent }));
        }
        // On completion, refetch the whole queue to get final status
        if (data._eventType === 'encode:complete') {
          setLiveProgress((prev) => {
            const next = { ...prev };
            delete next[data.jobId];
            return next;
          });
          setTimeout(() => refetchRef.current(), 500);
        }
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('import_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.jobId && typeof data.percent === 'number') {
          setLiveProgress((prev) => ({ ...prev, [data.jobId]: data.percent }));
        }
        if (data._eventType === 'import:complete') {
          setLiveProgress((prev) => {
            const next = { ...prev };
            delete next[data.jobId];
            return next;
          });
          setTimeout(() => refetchRef.current(), 500);
        }
      } catch { /* ignore */ }
    });

    // Clean up on unmount
    return () => es.close();
  }, []);

  // Also poll every 15s as fallback
  useEffect(() => {
    const interval = setInterval(() => refetchRef.current(), 15_000);
    return () => clearInterval(interval);
  }, []);

  const jobList = jobs ?? [];
  const sortedJobs = [...jobList].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
  );

  const handleCancel = async () => {
    if (!confirmCancel) return;
    try {
      await cancelEncode(confirmCancel);
      refetch();
    } catch {
      // Could add error toast
    }
    setConfirmCancel(null);
  };

  const handleRetry = async (id: string) => {
    try {
      await retryEncode(id);
      refetch();
    } catch {
      // Could add error toast
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-purple-400" />
          {jobList.filter((j) => j.status === 'RUNNING').length} running
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <Clock className="h-3.5 w-3.5 text-yellow-400" />
          {jobList.filter((j) => j.status === 'PENDING').length} pending
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          {jobList.filter((j) => j.status === 'COMPLETED').length} completed
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-red-400" />
          {jobList.filter((j) => j.status === 'FAILED').length} failed
        </Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-400" />
            Encode Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <QueueSkeleton />
          ) : sortedJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No encode jobs in the queue.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Status</TableHead>
                  <TableHead>Input File</TableHead>
                  <TableHead className="w-28">Encoder</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead className="w-20 text-right">ETA</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedJobs.map((job: EncodeJob) => {
                  const inputName = job.inputFile.split('/').pop() ?? job.inputFile;
                  return (
                    <TableRow key={job.id}>
                      <TableCell>{statusIcons[job.status]}</TableCell>
                      <TableCell>
                        <div>
                          <p className="truncate max-w-[300px] text-sm font-medium">{inputName}</p>
                          <p className="truncate max-w-[300px] text-xs text-muted-foreground">
                            → {job.outputFile.split('/').pop()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">{job.encoder}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({job.preset})</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const progress = liveProgress[job.id] ?? job.progress;
                          if (job.status === 'RUNNING' || liveProgress[job.id] !== undefined) {
                            return (
                              <div className="space-y-1">
                                <Progress value={progress} className="h-1.5" />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>{progress.toFixed(1)}%</span>
                                  {job.speed && <span>{job.speed}</span>}
                                </div>
                              </div>
                            );
                          }
                          if (job.status === 'COMPLETED') {
                            return <span className="text-xs text-emerald-400">100% — Complete</span>;
                          }
                          if (job.status === 'FAILED') {
                            return <span className="truncate text-xs text-red-400">{job.errorMessage}</span>;
                          }
                          return <span className="text-xs text-muted-foreground">Waiting…</span>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {job.eta ? formatDuration(job.eta) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(job.status === 'RUNNING' || job.status === 'PENDING') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setConfirmCancel(job.id)}
                              aria-label="Cancel encode"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {job.status === 'FAILED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRetry(job.id)}
                              aria-label="Retry encode"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cancel Confirmation */}
      <ConfirmModal
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
        title="Cancel Encode"
        description="Are you sure you want to cancel this encode job? Any progress will be lost."
        confirmLabel="Cancel Encode"
        variant="destructive"
        onConfirm={handleCancel}
      />
    </div>
  );
}

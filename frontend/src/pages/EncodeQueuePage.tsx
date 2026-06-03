/**
 * EncodeQueuePage — Table of encode jobs with status, progress, and actions.
 */
import { useState } from 'react';
import { Cpu, CheckCircle2, XCircle, Clock, Loader2, RotateCcw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDuration } from '@/lib/utils';
import type { EncodeJob } from '@/lib/types';

// ── Mock data ──────────────────────────────────────────────

const mockJobs: EncodeJob[] = [
  {
    id: 'e1', mediaId: 'm1', sourceId: 's1',
    inputFile: '/media/movies/Interstellar.2014.2160p.mkv',
    outputFile: '/media/optimised/Interstellar.2014.1080p.hevc.mkv',
    encoder: 'ffmpeg', preset: 'slow', status: 'RUNNING',
    progress: 67.3, eta: 2340, speed: '1.8x',
    inputSize: 45_000_000_000, outputSize: 12_000_000_000,
    startedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 50 * 60_000).toISOString(),
  },
  {
    id: 'e2', mediaId: 'm2', sourceId: 's2',
    inputFile: '/media/movies/Blade.Runner.2049.4K.mkv',
    outputFile: '/media/optimised/Blade.Runner.2049.1080p.hevc.mkv',
    encoder: 'ffmpeg', preset: 'medium', status: 'RUNNING',
    progress: 23.1, eta: 5670, speed: '2.1x',
    inputSize: 62_000_000_000,
    startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 25 * 60_000).toISOString(),
  },
  {
    id: 'e3', mediaId: 'm3', sourceId: 's3',
    inputFile: '/media/movies/Oppenheimer.2023.2160p.mkv',
    outputFile: '/media/optimised/Oppenheimer.2023.1080p.hevc.mkv',
    encoder: 'ffmpeg', preset: 'slow', status: 'PENDING',
    progress: 0, inputSize: 52_000_000_000,
    createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  },
  {
    id: 'e4', mediaId: 'm4', sourceId: 's4',
    inputFile: '/media/movies/The.Dark.Knight.2008.1080p.mkv',
    outputFile: '/media/optimised/The.Dark.Knight.2008.1080p.hevc.mkv',
    encoder: 'ffmpeg', preset: 'medium', status: 'COMPLETED',
    progress: 100, inputSize: 15_000_000_000, outputSize: 5_200_000_000,
    startedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    createdAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
  {
    id: 'e5', mediaId: 'm5', sourceId: 's5',
    inputFile: '/media/movies/Avatar.2009.2160p.mkv',
    outputFile: '/media/optimised/Avatar.2009.1080p.hevc.mkv',
    encoder: 'ffmpeg', preset: 'slow', status: 'FAILED',
    progress: 34, inputSize: 48_000_000_000,
    errorMessage: 'FFmpeg exited with code 1: Unsupported codec configuration',
    startedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 3600_000).toISOString(),
  },
];

const statusIcons: Record<string, React.ReactNode> = {
  RUNNING: <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />,
  PENDING: <Clock className="h-4 w-4 text-yellow-400" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
  CANCELLED: <X className="h-4 w-4 text-slate-400" />,
};

const statusOrder = ['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];

export function EncodeQueuePage() {
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const sortedJobs = [...mockJobs].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-purple-400" />
          {mockJobs.filter((j) => j.status === 'RUNNING').length} running
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <Clock className="h-3.5 w-3.5 text-yellow-400" />
          {mockJobs.filter((j) => j.status === 'PENDING').length} pending
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          {mockJobs.filter((j) => j.status === 'COMPLETED').length} completed
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-red-400" />
          {mockJobs.filter((j) => j.status === 'FAILED').length} failed
        </Badge>
      </div>

      {/* Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-400" />
            Encode Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
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
              {sortedJobs.map((job) => {
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
                      {job.status === 'RUNNING' ? (
                        <div className="space-y-1">
                          <Progress value={job.progress} className="h-1.5" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{job.progress.toFixed(1)}%</span>
                            {job.speed && <span>{job.speed}</span>}
                          </div>
                        </div>
                      ) : job.status === 'COMPLETED' ? (
                        <span className="text-xs text-emerald-400">100% — Complete</span>
                      ) : job.status === 'FAILED' ? (
                        <span className="truncate text-xs text-red-400">{job.errorMessage}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Waiting…</span>
                      )}
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
        onConfirm={() => {
          // TODO: call cancelEncode API
          setConfirmCancel(null);
        }}
      />
    </div>
  );
}

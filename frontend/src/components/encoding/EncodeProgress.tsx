/**
 * EncodeProgress — Progress bar for active encode jobs.
 */
import { Cpu, Clock, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDuration } from '@/lib/utils';
import type { EncodeJob } from '@/lib/types';

interface EncodeProgressProps {
  jobs: EncodeJob[];
  loading?: boolean;
}

function EncodeJobRow({ job }: { job: EncodeJob }) {
  const fileName = job.inputFile.split('/').pop() ?? job.inputFile;

  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
        <span className="text-sm font-bold text-primary">{Math.round(job.progress)}%</span>
      </div>
      <Progress value={job.progress} className="h-1.5" />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {job.eta != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(job.eta)} remaining
          </span>
        )}
        {job.speed && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {job.speed}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          {job.encoder}
        </span>
      </div>
    </div>
  );
}

export function EncodeProgress({ jobs, loading }: EncodeProgressProps) {
  const activeJobs = jobs.filter((j) => j.status === 'RUNNING');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-purple-400" />
          Active Jobs
          {activeJobs.length > 0 && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {activeJobs.length} running
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-muted/30 p-3">
                <div className="h-4 w-2/3 skeleton" />
                <div className="h-1.5 w-full skeleton" />
                <div className="h-3 w-1/2 skeleton" />
              </div>
            ))}
          </div>
        ) : activeJobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No active encode jobs. The queue is empty.
          </p>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <EncodeJobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

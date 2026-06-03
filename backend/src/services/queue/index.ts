/**
 * SchroDrive Media Manager — Queue Workers Module Index
 *
 * Barrel export for all background queue workers.
 *
 * @module services/queue
 */

export {
  startEncodeWorker,
  stopEncodeWorker,
  isEncodeWorkerRunning,
  getCurrentEncodeJobId,
} from './encode-worker';

export {
  startDownloadWorker,
  stopDownloadWorker,
  isDownloadWorkerRunning,
  resetCompletedTracker,
} from './download-worker';

export {
  startImportWorker,
  stopImportWorker,
  isImportWorkerRunning,
} from './import-worker';

// Re-export types
export type {
  PendingEncodeJob,
  FetchNextJobFn,
  UpdateJobStatusFn,
  AuditLogFn,
} from './encode-worker';

export type {
  TrackedDownload,
  OnDownloadCompleteFn,
  UpdateDownloadStatusFn,
} from './download-worker';

export type {
  PendingImportJob,
  FetchNextImportFn,
  UpdateImportStatusFn,
  QueueEncodeFn,
  ImportAuditLogFn,
} from './import-worker';

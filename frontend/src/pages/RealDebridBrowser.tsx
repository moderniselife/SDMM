/**
 * RealDebridBrowser — Two-panel layout: folder tree + file grid.
 *
 * Uses SSE streaming to progressively load directory contents from
 * FUSE-mounted RealDebrid storage, avoiding timeouts.
 */
import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen, FileVideo, Copy, Zap, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaBadge } from '@/components/media/MediaBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatBytes } from '@/lib/utils';
import { useCloudBrowser } from '@/hooks/useCloudBrowser';
import { copyToLocal, encodeToLocal, preserve } from '@/lib/api';
import type { CloudFile } from '@/lib/types';

function FileListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-3">
          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
          <div className="flex-1 space-y-1">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RealDebridBrowser() {
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    title: string;
    desc: string;
    action: string;
    fileId?: string;
  }>({ open: false, title: '', desc: '', action: '' });

  const { files, loading, error, totalFound, statusMessage } = useCloudBrowser('realdebrid', currentPath);

  const folders = files.filter((f) => f.isDirectory);
  const fileList = files.filter((f) => !f.isDirectory);

  const handleFolderClick = (path: string) => {
    setCurrentPath(path);
  };

  const handleAction = (action: string, file: CloudFile) => {
    const labels: Record<string, string> = {
      copy: 'Copy to Local',
      encode: 'Copy & Encode',
      preserve: 'Preserve Locally',
    };
    setConfirmAction({
      open: true,
      title: labels[action] ?? action,
      desc: `Are you sure you want to ${(labels[action] ?? action).toLowerCase()} "${file.name}"? This will download the file from RealDebrid.`,
      action,
      fileId: file.id,
    });
  };

  const handleConfirm = async () => {
    if (!confirmAction.fileId) return;
    try {
      switch (confirmAction.action) {
        case 'copy':
          await copyToLocal(confirmAction.fileId);
          break;
        case 'encode':
          await encodeToLocal(confirmAction.fileId);
          break;
        case 'preserve':
          await preserve(confirmAction.fileId);
          break;
      }
    } catch {
      // Error handling — could add toast
    }
  };

  // Breadcrumb parts for current path
  const pathParts = currentPath?.split('/').filter(Boolean) ?? [];

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-1 text-sm">
        <button
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={() => setCurrentPath(undefined)}
        >
          RealDebrid
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
            >
              {part}
            </button>
          </span>
        ))}
        {loading && (
          <span className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {statusMessage ?? (totalFound > 0 ? `${totalFound} found…` : 'Loading…')}
          </span>
        )}
      </div>

      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Folder Tree */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MediaBadge type="REALDEBRID" label="RealDebrid" />
              Folders
              {folders.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{folders.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-18rem)]">
              <div className="p-2 space-y-0.5">
                {loading && folders.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : folders.length === 0 && !loading ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No subfolders</p>
                ) : (
                  folders.map((folder) => (
                    <button
                      key={folder.id}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted cursor-pointer ${
                        currentPath === folder.path ? 'bg-primary/10 text-primary' : 'text-foreground'
                      }`}
                      onClick={() => handleFolderClick(folder.path)}
                    >
                      {currentPath === folder.path ? (
                        <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                      )}
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* File List */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              Files
              {fileList.length > 0 && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">({fileList.length})</span>
              )}
              {loading && fileList.length > 0 && (
                <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-18rem)]">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              {loading && fileList.length === 0 && !error ? (
                <FileListSkeleton />
              ) : fileList.length === 0 && !loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {currentPath ? 'No files in this folder.' : 'Select a folder to browse.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {fileList.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                    >
                      <FileVideo className="h-8 w-8 shrink-0 text-amber-400" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        {file.sizeBytes > 0 && (
                          <p className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAction('copy', file)} aria-label="Copy to local">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAction('encode', file)} aria-label="Copy and encode">
                          <Zap className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAction('preserve', file)} aria-label="Preserve locally">
                          <Shield className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <ConfirmModal
          open={confirmAction.open}
          onOpenChange={(open) => setConfirmAction((prev) => ({ ...prev, open }))}
          title={confirmAction.title}
          description={confirmAction.desc}
          confirmLabel={confirmAction.title}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}

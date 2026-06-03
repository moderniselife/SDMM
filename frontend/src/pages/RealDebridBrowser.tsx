/**
 * RealDebridBrowser — Two-panel layout: folder tree + file grid.
 */
import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FileVideo, Copy, Zap, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaBadge } from '@/components/media/MediaBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatBytes } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { fetchCloudFiles, copyToLocal, encodeToLocal, preserve } from '@/lib/api';
import type { CloudFile } from '@/lib/types';

interface TreeNodeProps {
  node: CloudFile;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}

function TreeNode({ node, depth, selected, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selected === node.path;

  return (
    <div>
      <button
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted cursor-pointer ${
          isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.children?.length) setExpanded(!expanded);
          onSelect(node.path);
        }}
      >
        {node.children?.length ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <Folder className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

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

  const { data: files, loading, error } = useApi(
    () => fetchCloudFiles('realdebrid', currentPath),
    [currentPath],
  );

  const folders = files?.filter((f) => f.isDirectory) ?? [];
  const fileList = files?.filter((f) => !f.isDirectory) ?? [];

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

  return (
    <div className="grid h-[calc(100vh-10rem)] grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      {/* Folder Tree */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MediaBadge type="REALDEBRID" label="RealDebrid" />
            Folders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="p-2">
              {loading && folders.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                folders.map((folder) => (
                  <TreeNode
                    key={folder.id}
                    node={folder}
                    depth={0}
                    selected={currentPath ?? null}
                    onSelect={setCurrentPath}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* File List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Files</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-16rem)]">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 mb-4">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {loading ? (
              <FileListSkeleton />
            ) : fileList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No files found. Select a folder to browse.
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
                      <p className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
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
  );
}

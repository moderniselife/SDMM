/**
 * RealDebridBrowser — Two-panel layout: folder tree + file grid.
 */
import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FileVideo, Copy, Zap, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaBadge } from '@/components/media/MediaBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatBytes } from '@/lib/utils';
import type { CloudFile } from '@/lib/types';

// ── Mock data ──────────────────────────────────────────────

const mockFolders: CloudFile[] = [
  {
    id: 'f1', name: 'Movies', path: '/Movies', isDirectory: true, sizeBytes: 0,
    sourceType: 'REALDEBRID', createdAt: '',
    children: [
      { id: 'f1a', name: '4K Remuxes', path: '/Movies/4K Remuxes', isDirectory: true, sizeBytes: 0, sourceType: 'REALDEBRID', createdAt: '' },
      { id: 'f1b', name: '1080p', path: '/Movies/1080p', isDirectory: true, sizeBytes: 0, sourceType: 'REALDEBRID', createdAt: '' },
    ],
  },
  {
    id: 'f2', name: 'TV Shows', path: '/TV Shows', isDirectory: true, sizeBytes: 0,
    sourceType: 'REALDEBRID', createdAt: '',
    children: [
      { id: 'f2a', name: 'Breaking Bad', path: '/TV Shows/Breaking Bad', isDirectory: true, sizeBytes: 0, sourceType: 'REALDEBRID', createdAt: '' },
    ],
  },
];

const mockFiles: CloudFile[] = [
  { id: 'rd1', name: 'The.Matrix.1999.2160p.Remux.mkv', path: '/Movies/4K Remuxes/The.Matrix.1999.2160p.Remux.mkv', isDirectory: false, sizeBytes: 72_000_000_000, mimeType: 'video/x-matroska', sourceType: 'REALDEBRID', createdAt: '2026-01-10T08:00:00Z' },
  { id: 'rd2', name: 'Inception.2010.2160p.Remux.mkv', path: '/Movies/4K Remuxes/Inception.2010.2160p.Remux.mkv', isDirectory: false, sizeBytes: 58_000_000_000, mimeType: 'video/x-matroska', sourceType: 'REALDEBRID', createdAt: '2026-02-05T12:00:00Z' },
  { id: 'rd3', name: 'Parasite.2019.1080p.BluRay.mkv', path: '/Movies/1080p/Parasite.2019.1080p.BluRay.mkv', isDirectory: false, sizeBytes: 12_000_000_000, mimeType: 'video/x-matroska', sourceType: 'REALDEBRID', createdAt: '2026-03-20T16:00:00Z' },
];

interface TreeNodeProps {
  node: CloudFile;
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
}

function TreeNode({ node, depth, selected, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selected === node.id;

  return (
    <div>
      <button
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted cursor-pointer ${
          isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.children?.length) setExpanded(!expanded);
          onSelect(node.id);
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

export function RealDebridBrowser() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>('f1a');
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    title: string;
    desc: string;
    action: string;
  }>({ open: false, title: '', desc: '', action: '' });

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
    });
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
              {mockFolders.map((folder) => (
                <TreeNode
                  key={folder.id}
                  node={folder}
                  depth={0}
                  selected={selectedFolder}
                  onSelect={setSelectedFolder}
                />
              ))}
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
            <div className="space-y-2">
              {mockFiles.map((file) => (
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleAction('copy', file)}
                      aria-label="Copy to local"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleAction('encode', file)}
                      aria-label="Copy and encode"
                    >
                      <Zap className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleAction('preserve', file)}
                      aria-label="Preserve locally"
                    >
                      <Shield className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmAction.open}
        onOpenChange={(open) => setConfirmAction((prev) => ({ ...prev, open }))}
        title={confirmAction.title}
        description={confirmAction.desc}
        confirmLabel={confirmAction.title}
        onConfirm={() => {
          // TODO: call API
        }}
      />
    </div>
  );
}

/**
 * LocalLibrary Page — Browse locally stored media with filters and pagination.
 */
import { useState } from 'react';
import { FilterBar } from '@/components/common/FilterBar';
import { MediaGrid } from '@/components/media/MediaGrid';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '@/lib/types';

// ── Mock data ──────────────────────────────────────────────

const mockItems: MediaItem[] = [
  {
    id: '1',
    title: 'Interstellar',
    year: 2014,
    mediaType: 'movie',
    resolution: '4K',
    codec: 'HEVC',
    sources: [{ id: 's1', mediaId: '1', sourceType: 'LOCAL', filePath: '/movies/Interstellar', fileName: 'Interstellar.2014.2160p.mkv', sizeBytes: 45_000_000_000, resolution: '4K', codec: 'HEVC', status: 'AVAILABLE', createdAt: '' }],
    status: 'AVAILABLE',
    sizeBytes: 45_000_000_000,
    addedAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: '2',
    title: 'The Dark Knight',
    year: 2008,
    mediaType: 'movie',
    resolution: '1080p',
    codec: 'HEVC',
    sources: [{ id: 's2', mediaId: '2', sourceType: 'LOCAL', filePath: '/movies/Dark Knight', fileName: 'The.Dark.Knight.2008.1080p.mkv', sizeBytes: 5_200_000_000, resolution: '1080p', codec: 'HEVC', status: 'OPTIMISED', createdAt: '' }],
    status: 'OPTIMISED',
    sizeBytes: 5_200_000_000,
    addedAt: '2026-02-01T12:00:00Z',
    updatedAt: '2026-02-01T12:00:00Z',
  },
  {
    id: '3',
    title: 'Blade Runner 2049',
    year: 2017,
    mediaType: 'movie',
    resolution: '4K',
    codec: 'H.264',
    sources: [{ id: 's3', mediaId: '3', sourceType: 'LOCAL', filePath: '/movies/Blade Runner', fileName: 'Blade.Runner.2049.4K.mkv', sizeBytes: 62_000_000_000, resolution: '4K', codec: 'H.264', status: 'ENCODING', createdAt: '' }],
    status: 'ENCODING',
    sizeBytes: 62_000_000_000,
    addedAt: '2026-03-10T08:00:00Z',
    updatedAt: '2026-03-10T08:00:00Z',
  },
  {
    id: '4',
    title: 'Dune: Part Two',
    year: 2024,
    mediaType: 'movie',
    resolution: '1080p',
    codec: 'HEVC',
    sources: [{ id: 's4', mediaId: '4', sourceType: 'LOCAL', filePath: '/movies/Dune2', fileName: 'Dune.Part.Two.1080p.mkv', sizeBytes: 7_800_000_000, resolution: '1080p', codec: 'HEVC', status: 'AVAILABLE', createdAt: '' }],
    status: 'AVAILABLE',
    sizeBytes: 7_800_000_000,
    addedAt: '2026-04-20T14:00:00Z',
    updatedAt: '2026-04-20T14:00:00Z',
  },
  {
    id: '5',
    title: 'Oppenheimer',
    year: 2023,
    mediaType: 'movie',
    resolution: '4K',
    codec: 'HEVC',
    sources: [{ id: 's5', mediaId: '5', sourceType: 'LOCAL', filePath: '/movies/Oppenheimer', fileName: 'Oppenheimer.2023.2160p.mkv', sizeBytes: 52_000_000_000, resolution: '4K', codec: 'HEVC', status: 'AVAILABLE', createdAt: '' }],
    status: 'AVAILABLE',
    sizeBytes: 52_000_000_000,
    addedAt: '2026-05-01T16:00:00Z',
    updatedAt: '2026-05-01T16:00:00Z',
  },
  {
    id: '6',
    title: 'Everything Everywhere All at Once',
    year: 2022,
    mediaType: 'movie',
    resolution: '1080p',
    codec: 'AV1',
    sources: [{ id: 's6', mediaId: '6', sourceType: 'LOCAL', filePath: '/movies/EEAAO', fileName: 'EEAAO.1080p.mkv', sizeBytes: 3_100_000_000, resolution: '1080p', codec: 'AV1', status: 'OPTIMISED', createdAt: '' }],
    status: 'OPTIMISED',
    sizeBytes: 3_100_000_000,
    addedAt: '2026-05-15T10:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  },
];

export function LocalLibrary() {
  const [page, setPage] = useState(1);
  const totalPages = 5; // Mock

  return (
    <div className="space-y-6">
      <FilterBar />
      <MediaGrid items={mockItems} />

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <span className="px-4 text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

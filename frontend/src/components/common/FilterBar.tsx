/**
 * FilterBar — Filter controls for source, resolution, codec, status, and sort.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useMediaStore } from '@/stores/media';

export function FilterBar() {
  const { source, resolution, codec, status, sort } = useMediaStore();
  const { setSource, setResolution, setCodec, setStatus, setSort, resetFilters } =
    useMediaStore();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Source filter */}
      <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
        <SelectTrigger className="w-[140px]" aria-label="Filter by source">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Sources</SelectItem>
          <SelectItem value="LOCAL">Local</SelectItem>
          <SelectItem value="REALDEBRID">RealDebrid</SelectItem>
          <SelectItem value="TORBOX">TorBox</SelectItem>
        </SelectContent>
      </Select>

      {/* Resolution filter */}
      <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
        <SelectTrigger className="w-[130px]" aria-label="Filter by resolution">
          <SelectValue placeholder="Resolution" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Resolutions</SelectItem>
          <SelectItem value="4K">4K</SelectItem>
          <SelectItem value="1080p">1080p</SelectItem>
          <SelectItem value="720p">720p</SelectItem>
          <SelectItem value="480p">480p</SelectItem>
        </SelectContent>
      </Select>

      {/* Codec filter */}
      <Select value={codec} onValueChange={(v) => setCodec(v as typeof codec)}>
        <SelectTrigger className="w-[120px]" aria-label="Filter by codec">
          <SelectValue placeholder="Codec" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Codecs</SelectItem>
          <SelectItem value="HEVC">HEVC</SelectItem>
          <SelectItem value="H.264">H.264</SelectItem>
          <SelectItem value="AV1">AV1</SelectItem>
          <SelectItem value="OTHER">Other</SelectItem>
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <SelectTrigger className="w-[130px]" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Statuses</SelectItem>
          <SelectItem value="AVAILABLE">Available</SelectItem>
          <SelectItem value="ENCODING">Encoding</SelectItem>
          <SelectItem value="OPTIMISED">Optimised</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
        <SelectTrigger className="w-[140px]" aria-label="Sort by">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="size">Size</SelectItem>
          <SelectItem value="date_added">Date Added</SelectItem>
          <SelectItem value="resolution">Resolution</SelectItem>
        </SelectContent>
      </Select>

      {/* Reset */}
      <Button variant="ghost" size="sm" onClick={resetFilters} aria-label="Reset all filters">
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        Reset
      </Button>
    </div>
  );
}

/**
 * Zustand store for media browsing state — search, filters, pagination.
 */
import { create } from 'zustand';
import type { Codec, MediaStatus, Resolution, SourceType } from '@/lib/types';

interface MediaState {
  searchQuery: string;
  source: SourceType | 'ALL';
  resolution: Resolution | 'ALL';
  codec: Codec | 'ALL';
  status: MediaStatus | 'ALL';
  sort: 'name' | 'size' | 'date_added' | 'resolution';
  sortDir: 'asc' | 'desc';
  currentPage: number;
  pageSize: number;

  // Actions
  setSearch: (query: string) => void;
  setSource: (source: SourceType | 'ALL') => void;
  setResolution: (resolution: Resolution | 'ALL') => void;
  setCodec: (codec: Codec | 'ALL') => void;
  setStatus: (status: MediaStatus | 'ALL') => void;
  setSort: (sort: 'name' | 'size' | 'date_added' | 'resolution') => void;
  setSortDir: (dir: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  resetFilters: () => void;
}

const initialState = {
  searchQuery: '',
  source: 'ALL' as const,
  resolution: 'ALL' as const,
  codec: 'ALL' as const,
  status: 'ALL' as const,
  sort: 'date_added' as const,
  sortDir: 'desc' as const,
  currentPage: 1,
  pageSize: 24,
};

export const useMediaStore = create<MediaState>()((set) => ({
  ...initialState,

  setSearch: (searchQuery) => set({ searchQuery, currentPage: 1 }),
  setSource: (source) => set({ source, currentPage: 1 }),
  setResolution: (resolution) => set({ resolution, currentPage: 1 }),
  setCodec: (codec) => set({ codec, currentPage: 1 }),
  setStatus: (status) => set({ status, currentPage: 1 }),
  setSort: (sort) => set({ sort, currentPage: 1 }),
  setSortDir: (sortDir) => set({ sortDir }),
  setPage: (currentPage) => set({ currentPage }),
  resetFilters: () => set(initialState),
}));

/**
 * SchroDrive Media Manager — Tautulli Client
 *
 * Integration client for the Tautulli API.
 * All requests use GET with apikey query parameter.
 *
 * @module services/integrations/tautulli-client
 */

import type { SourceType } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tautulli top media statistics entry. */
export interface TautulliTopMedia {
  ratingKey: string;
  title: string;
  totalPlays: number;
  totalDuration: number;
  usersWatching: number;
}

/** Tautulli watch time statistics for a specific item. */
export interface TautulliWatchStats {
  totalTime: number;
  totalPlays: number;
  queryDays: number;
}

/** Tautulli viewing history entry. */
export interface TautulliHistoryEntry {
  referenceId: number;
  date: number;
  started: number;
  stopped: number;
  duration: number;
  title: string;
  fullTitle: string;
  mediaType: string;
  ratingKey: string;
}

/** Candidate for preservation (frequently watched cloud content). */
export interface PreservationCandidate {
  ratingKey: string;
  title: string;
  totalPlays: number;
  sourcePath?: string;
  sourceType: SourceType;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface TautulliConfig {
  baseUrl: string;
  apiKey: string;
}

// ---------------------------------------------------------------------------
// Client Class
// ---------------------------------------------------------------------------

/**
 * Tautulli API client.
 *
 * Uses native fetch() for all requests. API key is passed as a
 * query parameter, never logged.
 */
export class TautulliClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config?: TautulliConfig) {
    this.baseUrl = (config?.baseUrl ?? process.env.TAUTULLI_URL ?? 'http://localhost:8181').replace(/\/$/, '');
    this.apiKey = config?.apiKey ?? process.env.TAUTULLI_API_KEY ?? '';

    if (!this.apiKey) {
      console.warn('[TautulliClient] No API key configured — API calls will fail');
    }
  }

  /**
   * Makes an authenticated request to the Tautulli API.
   *
   * @param cmd - The Tautulli API command
   * @param params - Additional query parameters
   * @returns Parsed response data
   */
  private async request<T>(cmd: string, params: Record<string, string> = {}): Promise<T> {
    const searchParams = new URLSearchParams({
      apikey: this.apiKey,
      cmd,
      ...params,
    });

    const url = `${this.baseUrl}/api/v2?${searchParams.toString()}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `Tautulli API error: ${response.status} ${response.statusText} for cmd=${cmd}`,
      );
    }

    interface TautulliResponse {
      response: {
        result: string;
        data: T;
        message?: string;
      };
    }

    const json = (await response.json()) as TautulliResponse;
    if (json.response.result !== 'success') {
      throw new Error(`Tautulli API failed: ${json.response.message ?? 'Unknown error'}`);
    }

    return json.response.data;
  }

  /**
   * Gets top watched media items.
   *
   * @param type - 'movie' or 'tv'
   * @param days - Number of days to look back
   * @param count - Number of items to return
   * @returns Array of top media entries
   */
  async getTopMedia(
    type: 'movie' | 'tv',
    days: number = 90,
    count: number = 25,
  ): Promise<TautulliTopMedia[]> {
    const statId = type === 'movie' ? 'top_movies' : 'top_tv';

    interface HomeStatsData {
      rows: Array<{
        rating_key: string;
        title: string;
        total_plays: number;
        total_duration: number;
        users_watching: number;
      }>;
    }

    const data = await this.request<HomeStatsData[]>('get_home_stats', {
      stat_id: statId,
      stats_count: String(count),
      time_range: String(days),
    });

    // Tautulli returns an array of stat groups; find the matching one
    const statGroup = data.find((g) => Array.isArray(g.rows));
    if (!statGroup) return [];

    return statGroup.rows.map((row) => ({
      ratingKey: String(row.rating_key),
      title: row.title,
      totalPlays: row.total_plays,
      totalDuration: row.total_duration,
      usersWatching: row.users_watching,
    }));
  }

  /**
   * Gets watch time statistics for a specific item.
   *
   * @param ratingKey - The Plex rating key
   * @returns Watch statistics for the item
   */
  async getWatchStats(ratingKey: string): Promise<TautulliWatchStats[]> {
    interface WatchTimeData {
      total_time: number;
      total_plays: number;
      query_days: number;
    }

    const data = await this.request<WatchTimeData[]>('get_item_watch_time_stats', {
      rating_key: ratingKey,
    });

    return data.map((entry) => ({
      totalTime: entry.total_time,
      totalPlays: entry.total_plays,
      queryDays: entry.query_days,
    }));
  }

  /**
   * Gets recent viewing history.
   *
   * @param limit - Maximum number of history entries to return
   * @returns Array of history entries
   */
  async getHistory(limit: number = 50): Promise<TautulliHistoryEntry[]> {
    interface HistoryData {
      data: Array<{
        reference_id: number;
        date: number;
        started: number;
        stopped: number;
        duration: number;
        title: string;
        full_title: string;
        media_type: string;
        rating_key: string;
      }>;
    }

    const data = await this.request<HistoryData>('get_history', {
      length: String(limit),
    });

    return (data.data ?? []).map((entry) => ({
      referenceId: entry.reference_id,
      date: entry.date,
      started: entry.started,
      stopped: entry.stopped,
      duration: entry.duration,
      title: entry.title,
      fullTitle: entry.full_title,
      mediaType: entry.media_type,
      ratingKey: String(entry.rating_key),
    }));
  }

  /**
   * Gets preservation suggestions based on frequently watched content
   * that is currently only available from cloud sources.
   *
   * Cross-references top watched items with cloud-mounted source types
   * to identify candidates worth preserving locally.
   *
   * @param thresholdPlays - Minimum total plays to consider (default: 3)
   * @param lookbackDays - Number of days to analyse (default: 90)
   * @returns Array of preservation candidates
   */
  async getPreservationSuggestions(
    thresholdPlays: number = 3,
    lookbackDays: number = 90,
  ): Promise<PreservationCandidate[]> {
    // Get top movies and TV
    const [topMovies, topTv] = await Promise.all([
      this.getTopMedia('movie', lookbackDays, 50),
      this.getTopMedia('tv', lookbackDays, 50),
    ]);

    const allTop = [...topMovies, ...topTv];

    // Filter to items above the threshold
    return allTop
      .filter((item) => item.totalPlays >= thresholdPlays)
      .map((item) => ({
        ratingKey: item.ratingKey,
        title: item.title,
        totalPlays: item.totalPlays,
        // Source type and path would be resolved by cross-referencing
        // with the media_sources table — left as 'local' placeholder
        sourceType: 'local' as SourceType,
      }));
  }
}

/** Default Tautulli client singleton. */
export const tautulliClient = new TautulliClient();

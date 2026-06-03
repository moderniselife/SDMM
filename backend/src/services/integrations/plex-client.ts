/**
 * SchroDrive Media Manager — Plex Client
 *
 * Integration client for the Plex Media Server API.
 * All requests use native fetch() with X-Plex-Token header
 * and Accept: application/json.
 *
 * @module services/integrations/plex-client
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Plex library section metadata. */
export interface PlexSection {
  key: string;
  title: string;
  type: string;
  agent: string;
  scanner: string;
  uuid: string;
}

/** Plex search hub result. */
export interface PlexSearchResult {
  ratingKey: string;
  title: string;
  year?: number;
  type: string;
  thumb?: string;
}

/** Plex metadata item (movie, show, episode, etc.). */
export interface PlexMetadata {
  ratingKey: string;
  title: string;
  year?: number;
  type: string;
  summary?: string;
  thumb?: string;
  art?: string;
  duration?: number;
  addedAt?: number;
}

/** Plex library section item (returned by section browsing and recently added). */
export interface PlexSectionItem {
  ratingKey: string;
  title: string;
  year: number | null;
  type: string;
  thumb: string | null;
  addedAt: number;
  duration: number | null;
}

/** File path information from a Plex media item. */
export interface PlexMediaFile {
  ratingKey: string;
  title: string;
  filePath: string;
  fileSize: number;
  duration: number;
  videoResolution: string | null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface PlexConfig {
  baseUrl: string;
  token: string;
}

// ---------------------------------------------------------------------------
// Client Class
// ---------------------------------------------------------------------------

/**
 * Plex Media Server API client.
 *
 * Uses native fetch() for all requests. Never logs the Plex token.
 */
export class PlexClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config?: PlexConfig) {
    this.baseUrl = (config?.baseUrl ?? process.env.PLEX_URL ?? 'http://localhost:32400').replace(/\/$/, '');
    this.token = config?.token ?? process.env.PLEX_TOKEN ?? '';

    if (!this.token) {
      console.warn('[PlexClient] No Plex token configured — API calls will fail');
    }
  }

  /**
   * Makes an authenticated request to the Plex API.
   *
   * @param endpoint - API endpoint path (e.g. '/library/sections')
   * @param options - Additional fetch options
   * @returns Parsed JSON response
   */
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Plex-Token': this.token,
      ...((options?.headers as Record<string, string>) ?? {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Plex API error: ${response.status} ${response.statusText} for ${endpoint}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Gets all library sections.
   *
   * @returns Array of Plex library sections
   */
  async getSections(): Promise<PlexSection[]> {
    interface SectionsResponse {
      MediaContainer: {
        Directory: Array<{
          key: string;
          title: string;
          type: string;
          agent: string;
          scanner: string;
          uuid: string;
        }>;
      };
    }

    const data = await this.request<SectionsResponse>('/library/sections');
    return (data.MediaContainer?.Directory ?? []).map((d) => ({
      key: d.key,
      title: d.title,
      type: d.type,
      agent: d.agent,
      scanner: d.scanner,
      uuid: d.uuid,
    }));
  }

  /**
   * Refreshes a specific library section.
   *
   * @param sectionId - The section key/ID to refresh
   */
  async refreshSection(sectionId: string): Promise<void> {
    await this.request(`/library/sections/${sectionId}/refresh`);
    console.log(`[PlexClient] Refreshed section ${sectionId}`);
  }

  /**
   * Refreshes all library sections.
   */
  async refreshAll(): Promise<void> {
    await this.request('/library/sections/all/refresh');
    console.log('[PlexClient] Refreshed all sections');
  }

  /**
   * Searches the Plex library.
   *
   * @param query - Search query string
   * @returns Array of search results
   */
  async search(query: string): Promise<PlexSearchResult[]> {
    interface SearchResponse {
      MediaContainer: {
        Hub?: Array<{
          Metadata?: Array<{
            ratingKey: string;
            title: string;
            year?: number;
            type: string;
            thumb?: string;
          }>;
        }>;
      };
    }

    const encoded = encodeURIComponent(query);
    const data = await this.request<SearchResponse>(
      `/hubs/search?query=${encoded}`,
    );

    const results: PlexSearchResult[] = [];
    for (const hub of data.MediaContainer?.Hub ?? []) {
      for (const item of hub.Metadata ?? []) {
        results.push({
          ratingKey: item.ratingKey,
          title: item.title,
          year: item.year,
          type: item.type,
          thumb: item.thumb,
        });
      }
    }

    return results;
  }

  /**
   * Gets all items in a Plex library section.
   *
   * Calls GET /library/sections/{sectionId}/all and returns an array
   * of items with their key metadata fields.
   *
   * @param sectionId - The section key/ID to browse
   * @returns Array of items in the section
   */
  async getSectionItems(sectionId: string): Promise<PlexSectionItem[]> {
    interface SectionItemsResponse {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          title: string;
          year?: number;
          type: string;
          thumb?: string;
          addedAt?: number;
          duration?: number;
        }>;
      };
    }

    const data = await this.request<SectionItemsResponse>(
      `/library/sections/${sectionId}/all`,
    );

    return (data.MediaContainer?.Metadata ?? []).map((item) => ({
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year ?? null,
      type: item.type,
      thumb: item.thumb ?? null,
      addedAt: item.addedAt ?? 0,
      duration: item.duration ?? null,
    }));
  }

  /**
   * Gets recently added items across all libraries.
   *
   * Calls GET /library/recentlyAdded with configurable result count.
   *
   * @param count - Maximum number of recently added items to return (default: 50)
   * @returns Array of recently added items
   */
  async getRecentlyAdded(count: number = 50): Promise<PlexSectionItem[]> {
    interface RecentlyAddedResponse {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          title: string;
          year?: number;
          type: string;
          thumb?: string;
          addedAt?: number;
          duration?: number;
        }>;
      };
    }

    const data = await this.request<RecentlyAddedResponse>(
      `/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=${count}`,
    );

    return (data.MediaContainer?.Metadata ?? []).map((item) => ({
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year ?? null,
      type: item.type,
      thumb: item.thumb ?? null,
      addedAt: item.addedAt ?? 0,
      duration: item.duration ?? null,
    }));
  }

  /**
   * Gets metadata for a specific item by rating key.
   *
   * @param ratingKey - The Plex rating key
   * @returns Metadata for the item
   */
  async getMetadata(ratingKey: string): Promise<PlexMetadata | null> {
    interface MetadataResponse {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          title: string;
          year?: number;
          type: string;
          summary?: string;
          thumb?: string;
          art?: string;
          duration?: number;
          addedAt?: number;
        }>;
      };
    }

    try {
      const data = await this.request<MetadataResponse>(
        `/library/metadata/${ratingKey}`,
      );
      const item = data.MediaContainer?.Metadata?.[0];
      if (!item) return null;

      return {
        ratingKey: item.ratingKey,
        title: item.title,
        year: item.year,
        type: item.type,
        summary: item.summary,
        thumb: item.thumb,
        art: item.art,
        duration: item.duration,
        addedAt: item.addedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Gets children of a Plex item (seasons of a show, episodes of a season).
   *
   * @param ratingKey - The parent item's rating key
   * @returns Array of child items
   */
  async getChildren(ratingKey: string): Promise<PlexSectionItem[]> {
    interface ChildrenResponse {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          title: string;
          year?: number;
          type: string;
          thumb?: string;
          addedAt?: number;
          duration?: number;
          index?: number;
          parentTitle?: string;
        }>;
      };
    }

    const data = await this.request<ChildrenResponse>(
      `/library/metadata/${ratingKey}/children`,
    );

    return (data.MediaContainer?.Metadata ?? []).map((item) => ({
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year ?? null,
      type: item.type,
      thumb: item.thumb ?? null,
      addedAt: item.addedAt ?? 0,
      duration: item.duration ?? null,
    }));
  }

  /**
   * Gets the actual media file paths for a Plex item.
   * Parses the Media[].Part[] structure from Plex metadata.
   *
   * @param ratingKey - The item's rating key
   * @returns Array of file path details
   */
  async getMediaFiles(ratingKey: string): Promise<PlexMediaFile[]> {
    interface MediaFilesResponse {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          title: string;
          Media?: Array<{
            videoResolution?: string;
            duration?: number;
            Part?: Array<{
              file?: string;
              size?: number;
            }>;
          }>;
        }>;
      };
    }

    const data = await this.request<MediaFilesResponse>(
      `/library/metadata/${ratingKey}`,
    );

    const files: PlexMediaFile[] = [];
    for (const item of data.MediaContainer?.Metadata ?? []) {
      for (const media of item.Media ?? []) {
        for (const part of media.Part ?? []) {
          if (part.file) {
            files.push({
              ratingKey: item.ratingKey,
              title: item.title,
              filePath: part.file,
              fileSize: part.size ?? 0,
              duration: media.duration ?? 0,
              videoResolution: media.videoResolution ?? null,
            });
          }
        }
      }
    }

    return files;
  }
}

/** Default Plex client singleton. */
export const plexClient = new PlexClient();

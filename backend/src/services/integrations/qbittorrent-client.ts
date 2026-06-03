/**
 * SchroDrive Media Manager — qBittorrent Client
 *
 * Integration client for the qBittorrent Web API v2.
 * Uses cookie-based authentication with automatic re-login on 403.
 * All requests include a Referer header for CSRF compliance.
 *
 * @module services/integrations/qbittorrent-client
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** qBittorrent torrent info. */
export interface QBitTorrentInfo {
  hash: string;
  name: string;
  savePath: string;
  progress: number;
  state: string;
  size: number;
  downloaded: number;
  uploaded: number;
  eta: number;
  category: string;
  tags: string;
  ratio: number;
  dlspeed: number;
  upspeed: number;
  addedOn: number;
  completionOn: number;
}

/** Filter for listing torrents. */
export type TorrentFilter =
  | 'all'
  | 'downloading'
  | 'seeding'
  | 'completed'
  | 'paused'
  | 'active'
  | 'inactive'
  | 'resumed'
  | 'stalled'
  | 'errored';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface QBitConfig {
  baseUrl: string;
  username: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Client Class
// ---------------------------------------------------------------------------

/**
 * qBittorrent Web API v2 client.
 *
 * Uses cookie-based authentication with automatic re-login.
 * Referer header is always included for CSRF compliance.
 * Never logs credentials.
 */
export class QBittorrentClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private cookie: string | null = null;

  constructor(config?: QBitConfig) {
    this.baseUrl = (config?.baseUrl ?? process.env.QBITTORRENT_URL ?? 'http://localhost:8080').replace(/\/$/, '');
    this.username = config?.username ?? process.env.QBITTORRENT_USERNAME ?? 'admin';
    this.password = config?.password ?? process.env.QBITTORRENT_PASSWORD ?? '';
  }

  /**
   * Authenticates with qBittorrent and stores the session cookie.
   *
   * @throws {Error} If login fails
   */
  async login(): Promise<void> {
    const formData = new URLSearchParams({
      username: this.username,
      password: this.password,
    });

    const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': this.baseUrl,
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`qBittorrent login failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.text();
    if (body.trim() !== 'Ok.') {
      throw new Error('qBittorrent login failed: invalid credentials');
    }

    // Extract SID cookie
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const sidMatch = setCookie.match(/SID=([^;]+)/);
      if (sidMatch) {
        this.cookie = `SID=${sidMatch[1]}`;
      }
    }

    console.log('[QBitClient] Successfully authenticated');
  }

  /**
   * Makes an authenticated request with auto-relogin on 403.
   *
   * @param endpoint - API endpoint path
   * @param options - Fetch options
   * @param isRetry - Whether this is a retry after re-login
   * @returns Response object
   */
  private async request(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false,
  ): Promise<Response> {
    if (!this.cookie) {
      await this.login();
    }

    const headers: Record<string, string> = {
      'Referer': this.baseUrl,
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // Auto re-login on 403
    if (response.status === 403 && !isRetry) {
      console.log('[QBitClient] Session expired, re-authenticating...');
      this.cookie = null;
      await this.login();
      return this.request(endpoint, options, true);
    }

    if (!response.ok) {
      throw new Error(
        `qBittorrent API error: ${response.status} ${response.statusText} for ${endpoint}`,
      );
    }

    return response;
  }

  /**
   * Adds a magnet link to qBittorrent.
   *
   * @param magnet - The magnet URI
   * @param savePath - Download save path
   * @param category - Optional torrent category
   */
  async addMagnet(magnet: string, savePath?: string, category?: string): Promise<void> {
    const formData = new URLSearchParams({ urls: magnet });
    if (savePath) formData.set('savepath', savePath);
    if (category) formData.set('category', category);

    await this.request('/api/v2/torrents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    console.log('[QBitClient] Added magnet link');
  }

  /**
   * Adds a .torrent file to qBittorrent.
   *
   * @param file - Torrent file as Blob/Buffer
   * @param fileName - Name of the torrent file
   * @param savePath - Download save path
   * @param category - Optional torrent category
   */
  async addTorrentFile(
    file: Blob,
    fileName: string,
    savePath?: string,
    category?: string,
  ): Promise<void> {
    const formData = new FormData();
    formData.append('torrents', file, fileName);
    if (savePath) formData.append('savepath', savePath);
    if (category) formData.append('category', category);

    await this.request('/api/v2/torrents/add', {
      method: 'POST',
      body: formData,
    });

    console.log(`[QBitClient] Added torrent file: ${fileName}`);
  }

  /**
   * Gets a list of torrents, optionally filtered.
   *
   * @param filter - Optional filter string
   * @param category - Optional category filter
   * @returns Array of torrent info objects
   */
  async getTorrents(
    filter?: TorrentFilter,
    category?: string,
  ): Promise<QBitTorrentInfo[]> {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (category) params.set('category', category);

    const queryStr = params.toString();
    const endpoint = `/api/v2/torrents/info${queryStr ? `?${queryStr}` : ''}`;

    const response = await this.request(endpoint);

    interface RawTorrent {
      hash: string;
      name: string;
      save_path: string;
      progress: number;
      state: string;
      size: number;
      downloaded: number;
      uploaded: number;
      eta: number;
      category: string;
      tags: string;
      ratio: number;
      dlspeed: number;
      upspeed: number;
      added_on: number;
      completion_on: number;
    }

    const rawTorrents = (await response.json()) as RawTorrent[];

    return rawTorrents.map((t) => ({
      hash: t.hash,
      name: t.name,
      savePath: t.save_path,
      progress: t.progress,
      state: t.state,
      size: t.size,
      downloaded: t.downloaded,
      uploaded: t.uploaded,
      eta: t.eta,
      category: t.category,
      tags: t.tags,
      ratio: t.ratio,
      dlspeed: t.dlspeed,
      upspeed: t.upspeed,
      addedOn: t.added_on,
      completionOn: t.completion_on,
    }));
  }

  /**
   * Gets all completed torrents.
   *
   * @returns Array of completed torrent info objects
   */
  async getCompleted(): Promise<QBitTorrentInfo[]> {
    return this.getTorrents('completed');
  }

  /**
   * Deletes a torrent.
   *
   * @param hash - Torrent hash
   * @param deleteFiles - Whether to delete downloaded files
   */
  async deleteTorrent(hash: string, deleteFiles: boolean = false): Promise<void> {
    const formData = new URLSearchParams({
      hashes: hash,
      deleteFiles: String(deleteFiles),
    });

    await this.request('/api/v2/torrents/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    console.log(`[QBitClient] Deleted torrent ${hash.slice(0, 8)}...`);
  }

  /**
   * Pauses (stops) a torrent.
   *
   * @param hash - Torrent hash
   */
  async pauseTorrent(hash: string): Promise<void> {
    const formData = new URLSearchParams({ hashes: hash });

    await this.request('/api/v2/torrents/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
  }

  /**
   * Resumes (starts) a torrent.
   *
   * @param hash - Torrent hash
   */
  async resumeTorrent(hash: string): Promise<void> {
    const formData = new URLSearchParams({ hashes: hash });

    await this.request('/api/v2/torrents/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
  }
}

/** Default qBittorrent client singleton. */
export const qbittorrentClient = new QBittorrentClient();

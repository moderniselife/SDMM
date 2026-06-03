/**
 * SchroDrive Media Manager — TMDB Client
 *
 * Integration client for The Movie Database (TMDB) API v3.
 * Used for movie/TV metadata lookup and poster URL generation.
 * All requests include api_key query parameter.
 *
 * @module services/integrations/tmdb-client
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** TMDB movie search/detail result. */
export interface TmdbMovie {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
}

/** TMDB TV show search/detail result. */
export interface TmdbTvShow {
  id: number;
  name: string;
  originalName: string;
  overview: string;
  firstAirDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
}

/** TMDB movie detail (extended). */
export interface TmdbMovieDetail extends TmdbMovie {
  runtime: number | null;
  imdbId: string | null;
  genres: Array<{ id: number; name: string }>;
  status: string;
  tagline: string;
}

/** TMDB TV show detail (extended). */
export interface TmdbTvDetail extends TmdbTvShow {
  numberOfSeasons: number;
  numberOfEpisodes: number;
  genres: Array<{ id: number; name: string }>;
  status: string;
  tagline: string;
  externalIds?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
}

/** TMDB poster size options. */
export type TmdbPosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface TmdbConfig {
  apiKey: string;
  baseUrl?: string;
  imageBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// Client Class
// ---------------------------------------------------------------------------

/**
 * TMDB API v3 client.
 *
 * Uses native fetch() for all requests. API key is passed as a
 * query parameter, never logged.
 */
export class TmdbClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;

  constructor(config?: TmdbConfig) {
    this.apiKey = config?.apiKey ?? process.env.TMDB_API_KEY ?? '';
    this.baseUrl = (config?.baseUrl ?? 'https://api.themoviedb.org/3').replace(/\/$/, '');
    this.imageBaseUrl = (config?.imageBaseUrl ?? 'https://image.tmdb.org/t/p').replace(/\/$/, '');

    if (!this.apiKey) {
      console.warn('[TmdbClient] No API key configured — API calls will fail');
    }
  }

  /**
   * Makes a request to the TMDB API.
   *
   * @param endpoint - API endpoint path
   * @param params - Additional query parameters
   * @returns Parsed JSON response
   */
  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const searchParams = new URLSearchParams({
      api_key: this.apiKey,
      ...params,
    });

    const url = `${this.baseUrl}${endpoint}?${searchParams.toString()}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText} for ${endpoint}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Searches for movies by title.
   *
   * @param query - Search query string
   * @param year - Optional release year filter
   * @returns Array of movie results
   */
  async searchMovie(query: string, year?: number): Promise<TmdbMovie[]> {
    interface SearchResponse {
      results: Array<{
        id: number;
        title: string;
        original_title: string;
        overview: string;
        release_date: string;
        poster_path: string | null;
        backdrop_path: string | null;
        vote_average: number;
        vote_count: number;
        genre_ids: number[];
      }>;
    }

    const params: Record<string, string> = { query };
    if (year) params.year = String(year);

    const data = await this.request<SearchResponse>('/search/movie', params);

    return data.results.map((m) => ({
      id: m.id,
      title: m.title,
      originalTitle: m.original_title,
      overview: m.overview,
      releaseDate: m.release_date,
      posterPath: m.poster_path,
      backdropPath: m.backdrop_path,
      voteAverage: m.vote_average,
      voteCount: m.vote_count,
      genreIds: m.genre_ids,
    }));
  }

  /**
   * Searches for TV shows by title.
   *
   * @param query - Search query string
   * @param year - Optional first air date year filter
   * @returns Array of TV show results
   */
  async searchTv(query: string, year?: number): Promise<TmdbTvShow[]> {
    interface SearchResponse {
      results: Array<{
        id: number;
        name: string;
        original_name: string;
        overview: string;
        first_air_date: string;
        poster_path: string | null;
        backdrop_path: string | null;
        vote_average: number;
        vote_count: number;
        genre_ids: number[];
      }>;
    }

    const params: Record<string, string> = { query };
    if (year) params.first_air_date_year = String(year);

    const data = await this.request<SearchResponse>('/search/tv', params);

    return data.results.map((t) => ({
      id: t.id,
      name: t.name,
      originalName: t.original_name,
      overview: t.overview,
      firstAirDate: t.first_air_date,
      posterPath: t.poster_path,
      backdropPath: t.backdrop_path,
      voteAverage: t.vote_average,
      voteCount: t.vote_count,
      genreIds: t.genre_ids,
    }));
  }

  /**
   * Gets detailed movie information by TMDB ID.
   *
   * @param id - TMDB movie ID
   * @returns Movie detail or null if not found
   */
  async getMovieDetails(id: number): Promise<TmdbMovieDetail | null> {
    interface RawDetail {
      id: number;
      title: string;
      original_title: string;
      overview: string;
      release_date: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
      vote_count: number;
      genre_ids: number[];
      runtime: number | null;
      imdb_id: string | null;
      genres: Array<{ id: number; name: string }>;
      status: string;
      tagline: string;
    }

    try {
      const data = await this.request<RawDetail>(`/movie/${id}`);
      return {
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        overview: data.overview,
        releaseDate: data.release_date,
        posterPath: data.poster_path,
        backdropPath: data.backdrop_path,
        voteAverage: data.vote_average,
        voteCount: data.vote_count,
        genreIds: data.genre_ids ?? [],
        runtime: data.runtime,
        imdbId: data.imdb_id,
        genres: data.genres,
        status: data.status,
        tagline: data.tagline,
      };
    } catch {
      return null;
    }
  }

  /**
   * Gets detailed TV show information by TMDB ID.
   *
   * @param id - TMDB TV show ID
   * @returns TV show detail or null if not found
   */
  async getTvDetails(id: number): Promise<TmdbTvDetail | null> {
    interface RawDetail {
      id: number;
      name: string;
      original_name: string;
      overview: string;
      first_air_date: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
      vote_count: number;
      genre_ids: number[];
      number_of_seasons: number;
      number_of_episodes: number;
      genres: Array<{ id: number; name: string }>;
      status: string;
      tagline: string;
      external_ids?: {
        imdb_id?: string;
        tvdb_id?: number;
      };
    }

    try {
      const data = await this.request<RawDetail>(`/tv/${id}`, {
        append_to_response: 'external_ids',
      });
      return {
        id: data.id,
        name: data.name,
        originalName: data.original_name,
        overview: data.overview,
        firstAirDate: data.first_air_date,
        posterPath: data.poster_path,
        backdropPath: data.backdrop_path,
        voteAverage: data.vote_average,
        voteCount: data.vote_count,
        genreIds: data.genre_ids ?? [],
        numberOfSeasons: data.number_of_seasons,
        numberOfEpisodes: data.number_of_episodes,
        genres: data.genres,
        status: data.status,
        tagline: data.tagline,
        externalIds: data.external_ids,
      };
    } catch {
      return null;
    }
  }

  /**
   * Builds a full poster URL from a TMDB poster path.
   *
   * @param posterPath - The poster_path from TMDB (e.g. '/abc123.jpg')
   * @param size - Poster size variant (default: 'w500')
   * @returns Full poster URL, or null if posterPath is null
   */
  getPosterUrl(posterPath: string | null, size: TmdbPosterSize = 'w500'): string | null {
    if (!posterPath) return null;
    return `${this.imageBaseUrl}/${size}${posterPath}`;
  }
}

/** Default TMDB client singleton. */
export const tmdbClient = new TmdbClient();

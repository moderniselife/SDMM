/**
 * SchroDrive Media Manager — Configuration
 *
 * Loads configuration from environment variables with fallback to
 * `/config/config.json`. Validated using Zod schemas.
 *
 * IMPORTANT: Token values are NEVER stored in the exported config object.
 * They are loaded directly from process.env when needed by services.
 *
 * @module config
 */

import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { createLogger } from './utils/logger';

const log = createLogger('config');

// =============================================================================
// Zod Schemas
// =============================================================================

const serverSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8686),
  host: z.string().default('0.0.0.0'),
});

const pathsSchema = z.object({
  mediaRoot: z.string().default('/media'),
  downloads: z.string().default('/media/downloads'),
  downloadsIncomplete: z.string().default('/media/downloads/incomplete'),
  downloadsComplete: z.string().default('/media/downloads/complete'),
  staging: z.string().default('/media/staging'),
  library: z.string().default('/media/library'),
  cloudRealDebrid: z.string().default('/cloud/realdebrid'),
  cloudTorBox: z.string().default('/cloud/torbox'),
  config: z.string().default('/config'),
});

const scannerSchema = z.object({
  intervalMinutes: z.number().int().min(1).default(15),
  mediaExtensions: z
    .array(z.string())
    .default([
      '.mkv', '.mp4', '.avi', '.ts', '.wmv',
      '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
    ]),
  minFileSizeBytes: z.number().int().min(0).default(104857600),
});

const encodingPresetSchema = z.object({
  crf: z.number().optional(),
  bitrate: z.string().optional(),
  maxrate: z.string().optional(),
  preset: z.string(),
  pixFmt: z.string(),
});

const encodingPresetsGroupSchema = z.record(z.string(), encodingPresetSchema);

const encodingSchema = z.object({
  defaultEncoder: z.string().default('nvenc'),
  defaultContainer: z.string().default('mkv'),
  maxConcurrentJobs: z.number().int().min(1).default(1),
  autoEncodeLocalDownloads: z.boolean().default(true),
  autoEncodeLocalImports: z.boolean().default(true),
  neverAutoEncodePaths: z.array(z.string()).default([
    '/cloud/realdebrid',
    '/cloud/torbox',
  ]),
  presets: z.record(z.string(), encodingPresetsGroupSchema).default({}),
  skipCodecs: z.array(z.string()).default(['av1']),
  reencodeCodecs: z
    .array(z.string())
    .default(['h264', 'mpeg2video', 'vc1', 'msmpeg4v3', 'mpeg4', 'vp8']),
  durationToleranceSeconds: z.number().default(2),
  minSavingPercent: z.number().default(10),
});

const audioSchema = z.object({
  preserveAllTracks: z.boolean().default(true),
  copyCodecs: z.array(z.string()).default(['aac', 'ac3', 'eac3', 'dts', 'truehd']),
  convertHighBitrateToEac3: z.boolean().default(false),
  singleAudioMode: z.boolean().default(false),
});

const subtitlesSchema = z.object({
  copyAllSupported: z.boolean().default(true),
  burnSubtitles: z.boolean().default(false),
});

const plexIntegrationSchema = z.object({
  url: z.string().url().default('http://172.17.0.1:32400'),
  autoRefreshOnImport: z.boolean().default(true),
});

const tautulliIntegrationSchema = z.object({
  url: z.string().url().default('http://172.17.0.1:8181'),
  preservationThresholdPlays: z.number().int().min(1).default(3),
  preservationLookbackDays: z.number().int().min(1).default(90),
});

const qbittorrentIntegrationSchema = z.object({
  url: z.string().url().default('http://qbittorrent:8080'),
  pollIntervalSeconds: z.number().int().min(1).default(10),
  downloadCategory: z.string().default('schrodrive'),
});

const tmdbIntegrationSchema = z.object({
  baseUrl: z.string().url().default('https://api.themoviedb.org/3'),
  imageBaseUrl: z.string().url().default('https://image.tmdb.org/t/p'),
});

const integrationsSchema = z.object({
  plex: plexIntegrationSchema.default({}),
  tautulli: tautulliIntegrationSchema.default({}),
  qbittorrent: qbittorrentIntegrationSchema.default({}),
  tmdb: tmdbIntegrationSchema.default({}),
});

const configSchema = z.object({
  server: serverSchema.default({}),
  paths: pathsSchema.default({}),
  scanner: scannerSchema.default({}),
  encoding: encodingSchema.default({}),
  audio: audioSchema.default({}),
  subtitles: subtitlesSchema.default({}),
  integrations: integrationsSchema.default({}),
});

export type AppConfig = z.infer<typeof configSchema>;

// =============================================================================
// Config Loading
// =============================================================================

/**
 * Attempts to load and parse the config JSON file.
 *
 * @param configPath - Absolute path to the config JSON file.
 * @returns Parsed JSON object, or an empty object if the file is not found.
 */
function loadConfigFile(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    log.info(`Config file not found at ${configPath}, using environment/defaults`);
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    log.warn(`Failed to parse config file at ${configPath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Builds the configuration object by merging environment variables
 * over the config file values (env takes precedence).
 *
 * @returns Validated AppConfig singleton.
 */
function buildConfig(): AppConfig {
  const configDir = process.env['CONFIG_DIR'] || '/config';
  const configPath = `${configDir}/config.json`;
  const fileConfig = loadConfigFile(configPath);

  // Environment variable overrides
  const envOverrides: Record<string, unknown> = {};

  // Server overrides
  if (process.env['PORT']) {
    envOverrides.server = {
      ...(fileConfig.server as Record<string, unknown> || {}),
      port: parseInt(process.env['PORT'], 10),
    };
  }

  // Path overrides
  const pathEnvMap: Record<string, string> = {
    MEDIA_ROOT: 'mediaRoot',
    CLOUD_REALDEBRID: 'cloudRealDebrid',
    CLOUD_TORBOX: 'cloudTorBox',
    CONFIG_DIR: 'config',
  };

  const pathOverrides: Record<string, string> = {};
  for (const [envKey, configKey] of Object.entries(pathEnvMap)) {
    const val = process.env[envKey];
    if (val) pathOverrides[configKey] = val;
  }

  if (Object.keys(pathOverrides).length > 0) {
    envOverrides.paths = {
      ...(fileConfig.paths as Record<string, unknown> || {}),
      ...pathOverrides,
    };
  }

  // Integration URL overrides
  if (process.env['PLEX_URL']) {
    const existing = (fileConfig.integrations as Record<string, unknown> || {});
    const existingPlex = (existing.plex as Record<string, unknown> || {});
    envOverrides.integrations = {
      ...existing,
      plex: { ...existingPlex, url: process.env['PLEX_URL'] },
    };
  }

  if (process.env['TAUTULLI_URL']) {
    const base = (envOverrides.integrations || fileConfig.integrations || {}) as Record<string, unknown>;
    const existingTautulli = (base.tautulli as Record<string, unknown> || {});
    envOverrides.integrations = {
      ...base,
      tautulli: { ...existingTautulli, url: process.env['TAUTULLI_URL'] },
    };
  }

  if (process.env['QBITTORRENT_URL']) {
    const base = (envOverrides.integrations || fileConfig.integrations || {}) as Record<string, unknown>;
    const existingQbt = (base.qbittorrent as Record<string, unknown> || {});
    envOverrides.integrations = {
      ...base,
      qbittorrent: { ...existingQbt, url: process.env['QBITTORRENT_URL'] },
    };
  }

  // Encoder override
  if (process.env['ENCODER_DEFAULT']) {
    const existingEncoding = (fileConfig.encoding as Record<string, unknown> || {});
    envOverrides.encoding = {
      ...existingEncoding,
      defaultEncoder: process.env['ENCODER_DEFAULT'],
    };
  }

  // Log level override
  if (process.env['LOG_LEVEL']) {
    // Log level is handled by the logger directly, not stored in config
  }

  // Merge file config with env overrides
  const merged = { ...fileConfig, ...envOverrides };

  // Validate with Zod
  const result = configSchema.safeParse(merged);

  if (!result.success) {
    log.error('Configuration validation failed', {
      errors: result.error.format(),
    });
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  log.info('Configuration loaded successfully', {
    port: result.data.server.port,
    mediaRoot: result.data.paths.mediaRoot,
    encoder: result.data.encoding.defaultEncoder,
  });

  return result.data;
}

/**
 * The validated, singleton application configuration.
 *
 * Token values (PLEX_TOKEN, TMDB_API_KEY, etc.) are intentionally excluded.
 * Access them via `process.env` directly in the services that need them.
 */
export const config: AppConfig = buildConfig();

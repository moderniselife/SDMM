import {
  Shield,
  Zap,
  Cloud,
  HardDrive,
  Monitor,
  Settings,
  Download,
  Search,
  RefreshCw,
  Eye,
  Layers,
  Radio,
  Server,
  Globe,
  Lock,
  Cpu,
  Database,
  Film,
  type LucideIcon,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface Provider {
  name: string;
  status: 'stable' | 'beta' | 'planned';
  features: string[];
}

export interface EnvVar {
  name: string;
  default: string;
  required: boolean;
  description: string;
}

export interface EnvVarCategory {
  title: string;
  description: string;
  variables: EnvVar[];
}

export interface Integration {
  name: string;
  description: string;
  icon: LucideIcon;
  category: 'media-server' | 'indexer' | 'request-manager' | 'debrid';
}

export interface ServiceToggle {
  envName: string;
  label: string;
  description: string;
  defaultValue: boolean;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterLinkGroup {
  title: string;
  links: NavLink[];
}

export interface Stat {
  label: string;
  value: string;
  suffix?: string;
}

// ─────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────

export const FEATURES: Feature[] = [
  {
    icon: Cloud,
    title: 'Multi-Debrid Orchestration',
    description:
      'Seamlessly manage RealDebrid, TorBox, AllDebrid, and Premiumize from a single interface. Automatic failover between providers.',
  },
  {
    icon: Search,
    title: 'Intelligent Content Discovery',
    description:
      'Integrates with Prowlarr and Jackett to automatically search and resolve content from your preferred indexers.',
  },
  {
    icon: Monitor,
    title: 'Media Server Integration',
    description:
      'Native support for Plex, Jellyfin, and Emby. Automatically organises and serves your content library.',
  },
  {
    icon: HardDrive,
    title: 'rclone FUSE Mounts',
    description:
      'Mount your debrid cloud storage as local drives. Stream content directly without downloading first.',
  },
  {
    icon: RefreshCw,
    title: 'Automatic Content Management',
    description:
      'Dead link scanning, content re-acquisition, and library organisation — all running automatically in the background.',
  },
  {
    icon: Shield,
    title: 'Zero External Dependencies',
    description:
      'Single container deployment with no external databases required. Everything self-contained and portable.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast Setup',
    description:
      'From zero to streaming in under 5 minutes. Docker Compose generator builds your perfect configuration.',
  },
  {
    icon: Layers,
    title: '*arr Bridge Compatibility',
    description:
      'Drop-in replacement for traditional download clients. Works with Sonarr, Radarr, and the entire *arr ecosystem.',
  },
  {
    icon: Eye,
    title: 'Web GUI Dashboard',
    description:
      'Beautiful web interface for monitoring, configuration, and manual content management. Real-time status updates.',
  },
];

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

export const PROVIDERS: Provider[] = [
  {
    name: 'RealDebrid',
    status: 'stable',
    features: ['Torrents', 'Cached content', 'WebDAV bridge', 'FUSE mounts'],
  },
  {
    name: 'TorBox',
    status: 'stable',
    features: ['Torrents', 'Usenet', 'Web downloads', 'WebDAV bridge', 'FUSE mounts'],
  },
  {
    name: 'AllDebrid',
    status: 'stable',
    features: ['Torrents', 'Cached content', 'WebDAV bridge', 'FUSE mounts'],
  },
  {
    name: 'Premiumize',
    status: 'stable',
    features: ['Torrents', 'Usenet', 'WebDAV bridge', 'FUSE mounts'],
  },
];

// ─────────────────────────────────────────────
// Environment Variables (grouped by category)
// ─────────────────────────────────────────────

export const ENV_VARS: Record<string, EnvVarCategory> = {
  core: {
    title: 'Core Settings',
    description: 'Essential configuration for SchröDrive operation.',
    variables: [
      {
        name: 'PORT',
        default: '3000',
        required: false,
        description: 'Port for the web GUI and API server.',
      },
      {
        name: 'PROVIDERS',
        default: 'torbox',
        required: true,
        description:
          'Comma-separated list of enabled debrid providers (torbox, realdebrid, alldebrid, premiumize).',
      },
      {
        name: 'ADD_STRATEGY',
        default: 'fastest',
        required: false,
        description:
          'Strategy for adding content: "fastest" (first available), "cheapest" (least expensive provider), or "redundant" (add to all providers).',
      },
      {
        name: 'TZ',
        default: 'Australia/Sydney',
        required: false,
        description: 'Timezone for scheduled operations and logging.',
      },
      {
        name: 'LOG_LEVEL',
        default: 'info',
        required: false,
        description: 'Logging verbosity: debug, info, warn, error.',
      },
    ],
  },
  debrid: {
    title: 'Debrid Providers',
    description: 'API keys and tokens for your debrid service accounts.',
    variables: [
      {
        name: 'TORBOX_API_KEY',
        default: '',
        required: false,
        description: 'API key for TorBox. Required if TorBox is in PROVIDERS list.',
      },
      {
        name: 'RD_ACCESS_TOKEN',
        default: '',
        required: false,
        description: 'Access token for RealDebrid. Required if realdebrid is in PROVIDERS list.',
      },
      {
        name: 'AD_API_KEY',
        default: '',
        required: false,
        description: 'API key for AllDebrid. Required if alldebrid is in PROVIDERS list.',
      },
      {
        name: 'PM_API_KEY',
        default: '',
        required: false,
        description: 'API key for Premiumize. Required if premiumize is in PROVIDERS list.',
      },
    ],
  },
  indexers: {
    title: 'Indexers',
    description: 'Configuration for content indexer integrations.',
    variables: [
      {
        name: 'PROWLARR_URL',
        default: '',
        required: false,
        description: 'URL for Prowlarr instance (e.g. http://localhost:9696).',
      },
      {
        name: 'PROWLARR_API_KEY',
        default: '',
        required: false,
        description: 'API key for Prowlarr.',
      },
      {
        name: 'JACKETT_URL',
        default: '',
        required: false,
        description: 'URL for Jackett instance (e.g. http://localhost:9117).',
      },
      {
        name: 'JACKETT_API_KEY',
        default: '',
        required: false,
        description: 'API key for Jackett.',
      },
    ],
  },
  overseerr: {
    title: 'Overseerr / Jellyseerr',
    description: 'Request management integration for media requests.',
    variables: [
      {
        name: 'OVERSEERR_URL',
        default: '',
        required: false,
        description: 'URL for Overseerr or Jellyseerr instance.',
      },
      {
        name: 'OVERSEERR_API_KEY',
        default: '',
        required: false,
        description: 'API key for Overseerr or Jellyseerr.',
      },
    ],
  },
  mediaServers: {
    title: 'Media Servers',
    description: 'Configuration for Plex, Jellyfin, and Emby integration.',
    variables: [
      {
        name: 'PLEX_URL',
        default: '',
        required: false,
        description: 'URL for your Plex server (e.g. http://localhost:32400).',
      },
      {
        name: 'PLEX_TOKEN',
        default: '',
        required: false,
        description: 'Authentication token for Plex.',
      },
      {
        name: 'JELLYFIN_URL',
        default: '',
        required: false,
        description: 'URL for your Jellyfin server.',
      },
      {
        name: 'JELLYFIN_API_KEY',
        default: '',
        required: false,
        description: 'API key for Jellyfin.',
      },
      {
        name: 'EMBY_URL',
        default: '',
        required: false,
        description: 'URL for your Emby server.',
      },
      {
        name: 'EMBY_API_KEY',
        default: '',
        required: false,
        description: 'API key for Emby.',
      },
    ],
  },
  mount: {
    title: 'Mount & WebDAV Bridge',
    description: 'Settings for rclone FUSE mounts and WebDAV bridge configuration.',
    variables: [
      {
        name: 'MOUNT_BASE_DIR',
        default: '/mnt/schrodrive',
        required: false,
        description: 'Base directory for FUSE mount points.',
      },
      {
        name: 'WEBDAV_BRIDGE_ENABLED',
        default: 'false',
        required: false,
        description: 'Enable the WebDAV bridge for remote file access.',
      },
      {
        name: 'WEBDAV_PORT',
        default: '8080',
        required: false,
        description: 'Port for the WebDAV bridge server.',
      },
    ],
  },
  services: {
    title: 'Service Toggles',
    description: 'Enable or disable individual SchröDrive services.',
    variables: [
      {
        name: 'RUN_MOUNT',
        default: 'true',
        required: false,
        description: 'Enable rclone FUSE mounts for cloud storage.',
      },
      {
        name: 'RUN_WEBHOOK',
        default: 'true',
        required: false,
        description: 'Enable Overseerr webhook listener for incoming requests.',
      },
      {
        name: 'RUN_POLLER',
        default: 'true',
        required: false,
        description: 'Enable API poller for periodic content checks.',
      },
      {
        name: 'RUN_WATCHLIST_POLLER',
        default: 'false',
        required: false,
        description: 'Enable Plex watchlist polling for automatic requests.',
      },
      {
        name: 'RUN_DEAD_SCANNER_WATCH',
        default: 'true',
        required: false,
        description: 'Enable dead link scanner to detect and replace broken content.',
      },
      {
        name: 'RUN_ORGANIZER_WATCH',
        default: 'true',
        required: false,
        description: 'Enable media organiser for automatic library structure.',
      },
      {
        name: 'RUN_WEB_GUI',
        default: 'true',
        required: false,
        description: 'Enable the web-based management GUI.',
      },
    ],
  },
  arrBridge: {
    title: '*arr Bridge',
    description: 'Configuration for Sonarr/Radarr download client emulation.',
    variables: [
      {
        name: 'ARR_BRIDGE_ENABLED',
        default: 'false',
        required: false,
        description: 'Enable the *arr bridge to act as a download client for Sonarr/Radarr.',
      },
      {
        name: 'ARR_BRIDGE_PORT',
        default: '8787',
        required: false,
        description: 'Port for the *arr bridge API.',
      },
      {
        name: 'ARR_BRIDGE_API_KEY',
        default: '',
        required: false,
        description: 'API key for *arr bridge authentication.',
      },
    ],
  },
  downloadTokens: {
    title: 'Download Tokens',
    description: 'Token-based authentication for direct download endpoints.',
    variables: [
      {
        name: 'DOWNLOAD_TOKEN_SECRET',
        default: '',
        required: false,
        description: 'Secret key for generating download tokens. Auto-generated if empty.',
      },
      {
        name: 'DOWNLOAD_TOKEN_EXPIRY',
        default: '3600',
        required: false,
        description: 'Token expiry time in seconds.',
      },
      {
        name: 'AUTO_UPDATE_ENABLED',
        default: 'false',
        required: false,
        description: 'Enable automatic updates of SchröDrive container.',
      },
    ],
  },
};

// ─────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────

export const INTEGRATIONS: Integration[] = [
  {
    name: 'Plex',
    description: 'Stream your media library with Plex.',
    icon: Monitor,
    category: 'media-server',
  },
  {
    name: 'Jellyfin',
    description: 'Free and open-source media system.',
    icon: Film,
    category: 'media-server',
  },
  {
    name: 'Emby',
    description: 'Personal media server.',
    icon: Monitor,
    category: 'media-server',
  },
  {
    name: 'Prowlarr',
    description: 'Indexer manager for the *arr stack.',
    icon: Search,
    category: 'indexer',
  },
  {
    name: 'Jackett',
    description: 'API bridge for torrent indexers.',
    icon: Search,
    category: 'indexer',
  },
  {
    name: 'Overseerr',
    description: 'Media request and discovery tool.',
    icon: Globe,
    category: 'request-manager',
  },
  {
    name: 'Jellyseerr',
    description: 'Fork of Overseerr for Jellyfin.',
    icon: Globe,
    category: 'request-manager',
  },
  {
    name: 'RealDebrid',
    description: 'Unrestricted downloader.',
    icon: Cloud,
    category: 'debrid',
  },
  {
    name: 'TorBox',
    description: 'All-in-one debrid service.',
    icon: Cloud,
    category: 'debrid',
  },
  {
    name: 'AllDebrid',
    description: 'Multi-hoster and torrent downloader.',
    icon: Cloud,
    category: 'debrid',
  },
  {
    name: 'Premiumize',
    description: 'Cloud downloader and VPN service.',
    icon: Cloud,
    category: 'debrid',
  },
];

// ─────────────────────────────────────────────
// Service Toggles (for Docker Compose generator)
// ─────────────────────────────────────────────

export const SERVICES: ServiceToggle[] = [
  {
    envName: 'RUN_MOUNT',
    label: 'rclone FUSE Mounts',
    description: 'Mount debrid cloud storage as local directories via FUSE.',
    defaultValue: true,
  },
  {
    envName: 'RUN_WEBHOOK',
    label: 'Overseerr Webhook',
    description: 'Listen for incoming media requests from Overseerr/Jellyseerr.',
    defaultValue: true,
  },
  {
    envName: 'RUN_POLLER',
    label: 'API Poller',
    description: 'Periodically poll for new content and status updates.',
    defaultValue: true,
  },
  {
    envName: 'RUN_WATCHLIST_POLLER',
    label: 'Watchlist Poller',
    description: 'Poll Plex watchlists for automatic media requests.',
    defaultValue: false,
  },
  {
    envName: 'RUN_DEAD_SCANNER_WATCH',
    label: 'Dead Scanner',
    description: 'Detect and replace broken or expired content links.',
    defaultValue: true,
  },
  {
    envName: 'RUN_ORGANIZER_WATCH',
    label: 'Media Organiser',
    description: 'Automatically organise media into structured library folders.',
    defaultValue: true,
  },
  {
    envName: 'ARR_BRIDGE_ENABLED',
    label: '*arr Bridge',
    description: 'Emulate a download client for Sonarr/Radarr integration.',
    defaultValue: false,
  },
  {
    envName: 'AUTO_UPDATE_ENABLED',
    label: 'Auto-Update',
    description: 'Automatically pull and restart with the latest SchröDrive version.',
    defaultValue: false,
  },
  {
    envName: 'RUN_WEB_GUI',
    label: 'Web GUI',
    description: 'Enable the browser-based management dashboard.',
    defaultValue: true,
  },
];

// ─────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────

export const NAV_LINKS: NavLink[] = [
  { label: 'Features', href: '/#features' },
  { label: 'Providers', href: '/#providers' },
  { label: 'Documentation', href: '/docs' },
  { label: 'Docker Generator', href: '/docs/docker' },
];

// ─────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────

export const FOOTER_LINKS: Record<string, FooterLinkGroup> = {
  product: {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Providers', href: '/#providers' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  resources: {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Docker Generator', href: '/docs/docker' },
      { label: 'GitHub', href: 'https://github.com/schrodrive' },
    ],
  },
  stack: {
    title: "Schrödinger's Copy Stack",
    links: [
      { label: 'SchröDrive (Core)', href: '/' },
      { label: 'Media Manager', href: '/#media-manager' },
    ],
  },
};

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

export const STATS: Stat[] = [
  { label: 'Debrid Providers', value: '4' },
  { label: 'Media Servers', value: '3' },
  { label: 'Containers', value: '1', suffix: 'to deploy' },
  { label: 'Setup Time', value: '<5', suffix: 'minutes' },
];

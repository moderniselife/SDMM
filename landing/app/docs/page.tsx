'use client';

import GlassCard from '@/components/ui/GlassCard';
import GradientText from '@/components/ui/GradientText';
import CodeBlock from '@/components/ui/CodeBlock';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EnvTable from '@/components/docs/EnvTable';
import { ENV_VARS } from '@/lib/constants';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Info,
  Sparkles,
  Terminal,
} from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="space-y-16">
      {/* ─── Quick Start ─── */}
      <section id="quick-start" className="scroll-mt-24">
        <Badge variant="gradient" className="mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Documentation
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
          Getting Started with{' '}
          <GradientText as="span">SchröDrive</GradientText>
        </h1>
        <p className="text-lg text-white/60 max-w-3xl mb-6">
          SchröDrive is the ultimate media automation orchestrator for debrid services.
          Connect your debrid accounts, indexers, and media servers — then let SchröDrive
          handle everything automatically.
        </p>

        <GlassCard className="p-6" hoverEffect={false}>
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 flex-shrink-0">
              <Info className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-purple-300 mb-1">
                Part of the Schrödinger&apos;s Copy Stack
              </h3>
              <p className="text-sm text-white/50">
                SchröDrive is the core orchestrator in the Schrödinger&apos;s Copy stack.
                Your media exists in superposition — cloud and local, cached and streamed,
                everywhere and nowhere — until SchröDrive observes it. Pair it with the{' '}
                <span className="text-blue-400">SchroDrive Media Manager</span> for
                intelligent local storage with hardware encoding.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* ─── Prerequisites ─── */}
      <section id="prerequisites" className="scroll-mt-24">
        <h2 className="text-3xl font-bold text-white mb-6">Prerequisites</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <PrerequisiteCard
            title="Docker & Docker Compose"
            description="Docker Engine 20.10+ and Docker Compose V2 for container deployment."
            required
          />
          <PrerequisiteCard
            title="Debrid Service Account"
            description="At least one of: RealDebrid, TorBox, AllDebrid, or Premiumize."
            required
          />
          <PrerequisiteCard
            title="Media Server"
            description="Plex, Jellyfin, or Emby for streaming your organised content library."
            required
          />
          <PrerequisiteCard
            title="NVIDIA GPU + Drivers"
            description="Required only for Media Manager hardware encoding (NVENC). CPU encoding also supported."
          />
          <PrerequisiteCard
            title="NVIDIA Container Toolkit"
            description="Required for GPU passthrough to Docker containers. Only needed for Media Manager."
          />
          <PrerequisiteCard
            title="Indexer (Recommended)"
            description="Prowlarr or Jackett for automated content discovery and searching."
          />
        </div>
      </section>

      {/* ─── Docker Setup ─── */}
      <section id="docker-setup" className="scroll-mt-24">
        <h2 className="text-3xl font-bold text-white mb-2">
          Installation — Docker{' '}
          <Badge variant="gradient" className="ml-2 text-xs align-middle">
            Recommended
          </Badge>
        </h2>
        <p className="text-white/50 mb-8">
          Docker is the recommended way to run SchröDrive. Single container, zero external databases.
        </p>

        {/* Docker Run */}
        <div id="docker-run" className="scroll-mt-24 mb-10">
          <h3 className="text-xl font-semibold text-white mb-4">Quick Docker Run</h3>
          <p className="text-white/50 text-sm mb-4">
            For a quick test, you can run SchröDrive with a single docker run command:
          </p>
          <CodeBlock language="bash" filename="terminal">
{`docker run -d \\
  --name schrodrive \\
  --restart unless-stopped \\
  -p 3000:3000 \\
  -v /home/user/schrodrive/config:/app/config \\
  -v /mnt/schrodrive:/mnt/schrodrive:shared \\
  --cap-add SYS_ADMIN \\
  --device /dev/fuse \\
  --security-opt apparmor:unconfined \\
  -e PROVIDERS=torbox,realdebrid \\
  -e TORBOX_API_KEY=your_torbox_key \\
  -e RD_ACCESS_TOKEN=your_rd_token \\
  -e PLEX_URL=http://plex:32400 \\
  -e PLEX_TOKEN=your_plex_token \\
  -e TZ=Australia/Sydney \\
  ghcr.io/schrodrive/schrodrive:latest`}
          </CodeBlock>

          <GlassCard className="p-4 mt-4" hoverEffect={false}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-white/50">
                <span className="text-yellow-400 font-medium">FUSE mounts require</span>{' '}
                <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">--cap-add SYS_ADMIN</code>,{' '}
                <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">--device /dev/fuse</code>, and{' '}
                <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">:shared</code> mount propagation
                on volume mounts.
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Docker Compose */}
        <div id="docker-compose" className="scroll-mt-24">
          <h3 className="text-xl font-semibold text-white mb-4">Docker Compose</h3>
          <p className="text-white/50 text-sm mb-4">
            For production deployments, use Docker Compose. Create a{' '}
            <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-purple-300">
              docker-compose.yml
            </code>{' '}
            file:
          </p>
          <CodeBlock language="yaml" filename="docker-compose.yml" showLineNumbers>
{`version: "3.9"

services:
  schrodrive:
    image: ghcr.io/schrodrive/schrodrive:latest
    container_name: schrodrive
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - /mnt/schrodrive:/mnt/schrodrive:shared
    cap_add:
      - SYS_ADMIN
    devices:
      - /dev/fuse
    security_opt:
      - apparmor:unconfined
    environment:
      # ── Core ──
      - PROVIDERS=torbox,realdebrid
      - TZ=Australia/Sydney
      
      # ── Debrid API Keys ──
      - TORBOX_API_KEY=your_torbox_key
      - RD_ACCESS_TOKEN=your_rd_token
      
      # ── Media Server ──
      - PLEX_URL=http://plex:32400
      - PLEX_TOKEN=your_plex_token
      
      # ── Indexers ──
      - PROWLARR_URL=http://prowlarr:9696
      - PROWLARR_API_KEY=your_prowlarr_key
      
      # ── Request Manager ──
      - OVERSEERR_URL=http://overseerr:5055
      - OVERSEERR_API_KEY=your_overseerr_key
      
      # ── Services ──
      - RUN_MOUNT=true
      - RUN_WEBHOOK=true
      - RUN_POLLER=true
      - RUN_WEB_GUI=true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s`}
          </CodeBlock>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button href="/docs/docker" size="sm">
              <FileCode2 className="w-4 h-4" />
              Use the Docker Compose Generator
            </Button>
            <p className="text-sm text-white/40 self-center">
              Build a custom configuration tailored to your setup
            </p>
          </div>
        </div>
      </section>

      {/* ─── Bare Metal ─── */}
      <section id="bare-metal" className="scroll-mt-24">
        <h2 className="text-3xl font-bold text-white mb-2">
          Installation — Bare Metal
        </h2>
        <p className="text-white/50 mb-8">
          Run SchröDrive directly on your system using Bun.
        </p>

        <div id="bun-install" className="scroll-mt-24">
          <h3 className="text-xl font-semibold text-white mb-4">Install with Bun</h3>
          <CodeBlock language="bash" filename="terminal">
{`# Clone the repository
$ git clone https://github.com/schrodrive/schrodrive.git
$ cd schrodrive

# Install dependencies
$ bun install

# Build the project
$ bun run build

# Run SchröDrive
$ bun dist/index.js serve`}
          </CodeBlock>

          <GlassCard className="p-4 mt-4" hoverEffect={false}>
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-white/50">
                Bare metal installation requires{' '}
                <a
                  href="https://bun.sh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Bun
                </a>{' '}
                to be installed on your system. You&apos;ll also need rclone installed
                separately for FUSE mount functionality.
              </p>
            </div>
          </GlassCard>

          <div className="mt-6">
            <h4 className="text-sm font-semibold text-white/70 mb-3">
              Environment Variables (Bare Metal)
            </h4>
            <p className="text-sm text-white/40 mb-3">
              Create a <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-purple-300">.env</code>{' '}
              file in the project root or export variables directly:
            </p>
            <CodeBlock language="bash" filename=".env">
{`PROVIDERS=torbox,realdebrid
TORBOX_API_KEY=your_torbox_key
RD_ACCESS_TOKEN=your_rd_token
PLEX_URL=http://localhost:32400
PLEX_TOKEN=your_plex_token
TZ=Australia/Sydney`}
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* ─── Configuration ─── */}
      <section id="configuration" className="scroll-mt-24">
        <h2 className="text-3xl font-bold text-white mb-2">Configuration</h2>
        <p className="text-white/50 mb-8">
          SchröDrive is configured entirely through environment variables. Below is the
          complete reference, organised by category.
        </p>

        <div id="environment-variables" className="scroll-mt-24 space-y-6">
          <EnvTable
            id="env-core"
            title={ENV_VARS.core.title}
            description={ENV_VARS.core.description}
            variables={ENV_VARS.core.variables}
          />
          <EnvTable
            id="env-debrid"
            title={ENV_VARS.debrid.title}
            description={ENV_VARS.debrid.description}
            variables={ENV_VARS.debrid.variables}
          />
          <EnvTable
            id="env-indexers"
            title={ENV_VARS.indexers.title}
            description={ENV_VARS.indexers.description}
            variables={ENV_VARS.indexers.variables}
          />
          <EnvTable
            id="env-overseerr"
            title={ENV_VARS.overseerr.title}
            description={ENV_VARS.overseerr.description}
            variables={ENV_VARS.overseerr.variables}
          />
          <EnvTable
            id="env-media-servers"
            title={ENV_VARS.mediaServers.title}
            description={ENV_VARS.mediaServers.description}
            variables={ENV_VARS.mediaServers.variables}
          />
          <EnvTable
            id="env-mount"
            title={ENV_VARS.mount.title}
            description={ENV_VARS.mount.description}
            variables={ENV_VARS.mount.variables}
          />
          <EnvTable
            id="env-services"
            title={ENV_VARS.services.title}
            description={ENV_VARS.services.description}
            variables={ENV_VARS.services.variables}
          />
          <EnvTable
            id="env-arr-bridge"
            title={ENV_VARS.arrBridge.title}
            description={ENV_VARS.arrBridge.description}
            variables={ENV_VARS.arrBridge.variables}
          />
          <EnvTable
            id="env-download-tokens"
            title={ENV_VARS.downloadTokens.title}
            description={ENV_VARS.downloadTokens.description}
            variables={ENV_VARS.downloadTokens.variables}
          />
        </div>
      </section>

      {/* ─── Integrations ─── */}
      <section id="integrations" className="scroll-mt-24">
        <h2 className="text-3xl font-bold text-white mb-6">Integrations</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <IntegrationCard
            name="Overseerr / Jellyseerr"
            description="Media request management. Webhook + API polling for automatic content acquisition."
            category="Request Manager"
          />
          <IntegrationCard
            name="Prowlarr"
            description="Universal indexer manager. Centralise all your indexers in one place."
            category="Indexer"
          />
          <IntegrationCard
            name="Jackett"
            description="API bridge for your favourite torrent indexers."
            category="Indexer"
          />
          <IntegrationCard
            name="Plex"
            description="Stream your library. Automatic scanning, watchlist integration, and metadata."
            category="Media Server"
          />
          <IntegrationCard
            name="Jellyfin"
            description="Free and open-source media system. Full library management support."
            category="Media Server"
          />
          <IntegrationCard
            name="Emby"
            description="Personal media server with automatic library organisation."
            category="Media Server"
          />
        </div>
      </section>

      {/* ─── Verify Installation ─── */}
      <section id="verify-installation" className="scroll-mt-24">
        <h2 className="text-3xl font-bold text-white mb-6">Verify Installation</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Health Check</h3>
            <p className="text-sm text-white/50 mb-4">
              Verify SchröDrive is running correctly with a health check:
            </p>
            <CodeBlock language="bash" filename="terminal">
{`$ curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok","version":"1.x.x","uptime":123}`}
            </CodeBlock>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Web GUI</h3>
            <p className="text-sm text-white/50 mb-4">
              Open your browser and navigate to the SchröDrive dashboard:
            </p>
            <CodeBlock language="bash" filename="terminal">
{`# Open in your browser
$ open http://localhost:3000

# Or with curl to verify the GUI is accessible
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200`}
            </CodeBlock>
          </div>

          <GlassCard className="p-6" hoverEffect={false} gradientBorder>
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-green-300 mb-1">
                  You&apos;re all set!
                </h3>
                <p className="text-sm text-white/50">
                  SchröDrive is now running. Content will begin appearing in your media
                  server as requests come in through Overseerr or the Web GUI. Check the
                  dashboard for real-time status and logs.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ─── //

function PrerequisiteCard({
  title,
  description,
  required = false,
}: {
  title: string;
  description: string;
  required?: boolean;
}) {
  return (
    <GlassCard className="p-4" hoverEffect>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
          <p className="text-xs text-white/40">{description}</p>
        </div>
        {required ? (
          <Badge variant="gradient" className="text-xs flex-shrink-0">
            Required
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs flex-shrink-0">
            Optional
          </Badge>
        )}
      </div>
    </GlassCard>
  );
}

function IntegrationCard({
  name,
  description,
  category,
}: {
  name: string;
  description: string;
  category: string;
}) {
  return (
    <GlassCard className="p-4">
      <Badge variant="outline" className="text-xs mb-3">
        {category}
      </Badge>
      <h3 className="text-sm font-semibold text-white mb-1">{name}</h3>
      <p className="text-xs text-white/40">{description}</p>
    </GlassCard>
  );
}

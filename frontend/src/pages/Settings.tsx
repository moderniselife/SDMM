/**
 * Settings Page — Application configuration with sections.
 */
import { useState } from 'react';
import { Save, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Settings() {
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  const toggleToken = (key: string) =>
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Encoding Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Encoding</CardTitle>
          <CardDescription>Configure how media files are transcoded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="encoder">
                Encoder
              </label>
              <Select defaultValue="ffmpeg">
                <SelectTrigger id="encoder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ffmpeg">FFmpeg</SelectItem>
                  <SelectItem value="handbrake">HandBrake</SelectItem>
                  <SelectItem value="av1an">av1an</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="preset">
                Preset
              </label>
              <Select defaultValue="slow">
                <SelectTrigger id="preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ultrafast">Ultra Fast</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="slow">Slow</SelectItem>
                  <SelectItem value="veryslow">Very Slow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="crf">
                CRF Value
              </label>
              <Input id="crf" type="number" defaultValue={20} min={0} max={51} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="maxParallel">
                Max Parallel Encodes
              </label>
              <Input id="maxParallel" type="number" defaultValue={2} min={1} max={8} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audio Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Audio</CardTitle>
          <CardDescription>Configure audio stream handling during encoding.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="audioMode">
                Audio Mode
              </label>
              <Select defaultValue="preserve_all">
                <SelectTrigger id="audioMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve_all">Preserve All Tracks</SelectItem>
                  <SelectItem value="single_audio">Single Audio Track</SelectItem>
                  <SelectItem value="convert_high_bitrate">Convert High Bitrate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="bitrateThreshold">
                Bitrate Threshold (kbps)
              </label>
              <Input id="bitrateThreshold" type="number" defaultValue={640} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subtitle Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Subtitles</CardTitle>
          <CardDescription>Configure subtitle handling during encoding.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="subMode">
                Subtitle Mode
              </label>
              <Select defaultValue="copy_all">
                <SelectTrigger id="subMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy_all">Copy All</SelectItem>
                  <SelectItem value="burn_default">Burn Default</SelectItem>
                  <SelectItem value="strip">Strip All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="burnLang">
                Burn Language
              </label>
              <Input id="burnLang" defaultValue="eng" placeholder="e.g. eng, jpn" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Connect to Plex, Tautulli, qBittorrent, and cloud services.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plex */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Plex</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="plexUrl">URL</label>
                <Input id="plexUrl" defaultValue="http://localhost:32400" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="plexToken">Token</label>
                <div className="relative">
                  <Input
                    id="plexToken"
                    type={showTokens.plex ? 'text' : 'password'}
                    defaultValue="abc123xyz"
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => toggleToken('plex')}
                    aria-label={showTokens.plex ? 'Hide token' : 'Show token'}
                  >
                    {showTokens.plex ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tautulli */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Tautulli</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tautulliUrl">URL</label>
                <Input id="tautulliUrl" defaultValue="http://localhost:8181" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tautulliKey">API Key</label>
                <div className="relative">
                  <Input
                    id="tautulliKey"
                    type={showTokens.tautulli ? 'text' : 'password'}
                    defaultValue="tautulli-api-key"
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => toggleToken('tautulli')}
                    aria-label={showTokens.tautulli ? 'Hide key' : 'Show key'}
                  >
                    {showTokens.tautulli ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* qBittorrent */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">qBittorrent</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qbtUrl">URL</label>
                <Input id="qbtUrl" defaultValue="http://localhost:8080" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qbtUser">Username</label>
                <Input id="qbtUser" defaultValue="admin" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qbtPass">Password</label>
                <Input id="qbtPass" type="password" defaultValue="password" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Cloud services */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Cloud Services</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="rdKey">RealDebrid API Key</label>
                <div className="relative">
                  <Input
                    id="rdKey"
                    type={showTokens.rd ? 'text' : 'password'}
                    defaultValue="rd-api-key-here"
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => toggleToken('rd')}
                    aria-label={showTokens.rd ? 'Hide key' : 'Show key'}
                  >
                    {showTokens.rd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tbKey">TorBox API Key</label>
                <div className="relative">
                  <Input
                    id="tbKey"
                    type={showTokens.tb ? 'text' : 'password'}
                    defaultValue="torbox-api-key-here"
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => toggleToken('tb')}
                    aria-label={showTokens.tb ? 'Hide key' : 'Show key'}
                  >
                    {showTokens.tb ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanner Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Scanner</CardTitle>
          <CardDescription>Configure automatic library scanning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="scanInterval">
                Scan Interval (minutes)
              </label>
              <Input id="scanInterval" type="number" defaultValue={30} min={5} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="extensions">
                File Extensions
              </label>
              <Input id="extensions" defaultValue=".mkv,.mp4,.avi,.mov,.m4v" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Version</p>
              <p className="text-sm font-medium">0.1.0</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uptime</p>
              <p className="text-sm font-medium">3d 14h 22m</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Database Size</p>
              <p className="text-sm font-medium">24.3 MB</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Media</p>
              <p className="text-sm font-medium">1,247</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg">
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}

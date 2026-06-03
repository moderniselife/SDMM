/**
 * Settings Page — Application configuration with sections.
 */
import { useState } from 'react';
import { Save, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
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
import { useApi } from '@/hooks/useApi';
import { fetchSettings, updateSettings } from '@/lib/api';
import type { AppSettings } from '@/lib/types';

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function Settings() {
  const { data: settings, loading, error } = useApi(fetchSettings);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleToken = (key: string) =>
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const formData: Partial<AppSettings> = {
        encoding: {
          encoder: settings?.encoding.encoder ?? 'ffmpeg',
          preset: settings?.encoding.preset ?? 'slow',
          hwAccel: settings?.encoding.hwAccel ?? false,
          crf: parseInt((document.getElementById('crf') as HTMLInputElement)?.value ?? '20'),
          maxParallel: parseInt((document.getElementById('maxParallel') as HTMLInputElement)?.value ?? '2'),
        },
        integrations: {
          plexUrl: (document.getElementById('plexUrl') as HTMLInputElement)?.value ?? '',
          plexToken: (document.getElementById('plexToken') as HTMLInputElement)?.value ?? '',
          tautulliUrl: (document.getElementById('tautulliUrl') as HTMLInputElement)?.value ?? '',
          tautulliApiKey: (document.getElementById('tautulliKey') as HTMLInputElement)?.value ?? '',
          qbittorrentUrl: (document.getElementById('qbtUrl') as HTMLInputElement)?.value ?? '',
          qbittorrentUsername: (document.getElementById('qbtUser') as HTMLInputElement)?.value ?? '',
          qbittorrentPassword: (document.getElementById('qbtPass') as HTMLInputElement)?.value ?? '',
          realDebridApiKey: (document.getElementById('rdKey') as HTMLInputElement)?.value ?? '',
          torBoxApiKey: (document.getElementById('tbKey') as HTMLInputElement)?.value ?? '',
        },
        scanner: {
          intervalMinutes: parseInt((document.getElementById('scanInterval') as HTMLInputElement)?.value ?? '30'),
          extensions: (document.getElementById('extensions') as HTMLInputElement)?.value.split(',').map((s) => s.trim()) ?? [],
          watchDirectories: settings?.scanner.watchDirectories ?? [],
        },
      };
      await updateSettings(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Could add error toast
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load settings: {error}
        </div>
      </div>
    );
  }

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
              <label className="text-sm font-medium" htmlFor="encoder">Encoder</label>
              <Select defaultValue={settings?.encoding.encoder ?? 'ffmpeg'}>
                <SelectTrigger id="encoder"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ffmpeg">FFmpeg</SelectItem>
                  <SelectItem value="handbrake">HandBrake</SelectItem>
                  <SelectItem value="av1an">av1an</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="preset">Preset</label>
              <Select defaultValue={settings?.encoding.preset ?? 'slow'}>
                <SelectTrigger id="preset"><SelectValue /></SelectTrigger>
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
              <label className="text-sm font-medium" htmlFor="crf">CRF Value</label>
              <Input id="crf" type="number" defaultValue={settings?.encoding.crf ?? 20} min={0} max={51} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="maxParallel">Max Parallel Encodes</label>
              <Input id="maxParallel" type="number" defaultValue={settings?.encoding.maxParallel ?? 2} min={1} max={8} />
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
              <label className="text-sm font-medium" htmlFor="audioMode">Audio Mode</label>
              <Select defaultValue={settings?.audio.mode ?? 'preserve_all'}>
                <SelectTrigger id="audioMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve_all">Preserve All Tracks</SelectItem>
                  <SelectItem value="single_audio">Single Audio Track</SelectItem>
                  <SelectItem value="convert_high_bitrate">Convert High Bitrate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="bitrateThreshold">Bitrate Threshold (kbps)</label>
              <Input id="bitrateThreshold" type="number" defaultValue={settings?.audio.bitrateThreshold ?? 640} />
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
              <label className="text-sm font-medium" htmlFor="subMode">Subtitle Mode</label>
              <Select defaultValue={settings?.subtitles.mode ?? 'copy_all'}>
                <SelectTrigger id="subMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy_all">Copy All</SelectItem>
                  <SelectItem value="burn_default">Burn Default</SelectItem>
                  <SelectItem value="strip">Strip All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="burnLang">Burn Language</label>
              <Input id="burnLang" defaultValue={settings?.subtitles.burnLanguage ?? 'eng'} placeholder="e.g. eng, jpn" />
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
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Plex</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="plexUrl">URL</label>
                <Input id="plexUrl" defaultValue={settings?.integrations.plexUrl ?? ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="plexToken">Token</label>
                <div className="relative">
                  <Input id="plexToken" type={showTokens.plex ? 'text' : 'password'} defaultValue={settings?.integrations.plexToken ?? ''} />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => toggleToken('plex')} aria-label={showTokens.plex ? 'Hide token' : 'Show token'}>
                    {showTokens.plex ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Tautulli</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tautulliUrl">URL</label>
                <Input id="tautulliUrl" defaultValue={settings?.integrations.tautulliUrl ?? ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tautulliKey">API Key</label>
                <div className="relative">
                  <Input id="tautulliKey" type={showTokens.tautulli ? 'text' : 'password'} defaultValue={settings?.integrations.tautulliApiKey ?? ''} />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => toggleToken('tautulli')} aria-label={showTokens.tautulli ? 'Hide key' : 'Show key'}>
                    {showTokens.tautulli ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">qBittorrent</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qbtUrl">URL</label>
                <Input id="qbtUrl" defaultValue={settings?.integrations.qbittorrentUrl ?? ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qbtUser">Username</label>
                <Input id="qbtUser" defaultValue={settings?.integrations.qbittorrentUsername ?? ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qbtPass">Password</label>
                <Input id="qbtPass" type="password" defaultValue={settings?.integrations.qbittorrentPassword ?? ''} />
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Cloud Services</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="rdKey">RealDebrid API Key</label>
                <div className="relative">
                  <Input id="rdKey" type={showTokens.rd ? 'text' : 'password'} defaultValue={settings?.integrations.realDebridApiKey ?? ''} />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => toggleToken('rd')} aria-label={showTokens.rd ? 'Hide key' : 'Show key'}>
                    {showTokens.rd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tbKey">TorBox API Key</label>
                <div className="relative">
                  <Input id="tbKey" type={showTokens.tb ? 'text' : 'password'} defaultValue={settings?.integrations.torBoxApiKey ?? ''} />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => toggleToken('tb')} aria-label={showTokens.tb ? 'Hide key' : 'Show key'}>
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
              <label className="text-sm font-medium" htmlFor="scanInterval">Scan Interval (minutes)</label>
              <Input id="scanInterval" type="number" defaultValue={settings?.scanner.intervalMinutes ?? 30} min={5} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="extensions">File Extensions</label>
              <Input id="extensions" defaultValue={settings?.scanner.extensions?.join(', ') ?? '.mkv, .mp4, .avi, .mov, .m4v'} />
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
              <p className="text-sm font-medium">{settings?.about.version ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uptime</p>
              <p className="text-sm font-medium">{settings?.about.uptime ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Database Size</p>
              <p className="text-sm font-medium">{settings?.about.databaseSize ? `${(settings.about.databaseSize / 1_000_000).toFixed(1)} MB` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Media</p>
              <p className="text-sm font-medium">{settings?.about.totalMediaCount?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3">
        {saveSuccess && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Settings saved successfully
          </span>
        )}
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

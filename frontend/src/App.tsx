/**
 * SchroDrive Media Manager — App Router
 * React Router v7 with layout wrapper and theme support.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { LocalLibrary } from '@/pages/LocalLibrary';
import { RealDebridBrowser } from '@/pages/RealDebridBrowser';
import { TorBoxBrowser } from '@/pages/TorBoxBrowser';
import { Downloads } from '@/pages/Downloads';
import { EncodeQueuePage } from '@/pages/EncodeQueuePage';
import { MediaDetail } from '@/pages/MediaDetail';
import { Settings } from '@/pages/Settings';

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<LocalLibrary />} />
            <Route path="/realdebrid" element={<RealDebridBrowser />} />
            <Route path="/torbox" element={<TorBoxBrowser />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/encode-queue" element={<EncodeQueuePage />} />
            <Route path="/media/:id" element={<MediaDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

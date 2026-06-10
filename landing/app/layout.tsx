import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SchröDrive — The Ultimate Media Automation Orchestrator',
  description:
    'Your content exists everywhere and nowhere — until SchröDrive observes it. The ultimate media automation orchestrator for debrid services.',
  openGraph: {
    title: 'SchröDrive — Media Automation Orchestrator',
    description:
      'Connect Overseerr, Prowlarr, debrid services, and your media server in a single self-healing container.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#030014] text-white font-sans">
        {children}
      </body>
    </html>
  );
}

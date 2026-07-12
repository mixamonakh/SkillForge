import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'SkillForge', template: '%s · SkillForge' },
  description: 'Тренажёр инженерной уверенности на основе реальных evidence.',
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#ffffff',
};

// A per-request CSP nonce is injected by `proxy.ts`. The document must be
// rendered at request time so Next.js can apply that nonce to bootstrap scripts.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

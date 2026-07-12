'use client';

import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Download,
  Gauge,
  Menu,
  Route,
  Settings,
  ShieldCheck,
  Swords,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/client';

const navigation = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/roadmap', label: 'Roadmap', icon: Route },
  { href: '/sessions', label: 'Learning Session', icon: BookOpen },
  { href: '/assessment', label: 'Assessment', icon: ClipboardCheck },
  { href: '/import-export', label: 'Import / Export', icon: Download },
  { href: '/metrics', label: 'Metrics', icon: BarChart3 },
  { href: '/battle', label: 'Battle Evidence', icon: Swords },
  { href: '/library', label: 'Content Library', icon: Boxes },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () =>
      apiFetch<{ settings: { reducedMotion: boolean; targetTrackKey: string } }>('/api/v1/profile'),
    staleTime: 60_000,
  });
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = profileQuery.data?.settings.reducedMotion
      ? 'true'
      : 'false';
  }, [profileQuery.data?.settings.reducedMotion]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!mobile || !menuOpen) return;
    sidebar.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [menuOpen, mobile]);

  const closeMenu = () => {
    setMenuOpen(false);
    if (mobile) window.setTimeout(() => menuButton.current?.focus(), 0);
  };
  const handleDrawerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!mobile || !menuOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(sidebar.current?.querySelectorAll<HTMLElement>('a, button') ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const targetTrackKey = profileQuery.data?.settings.targetTrackKey;

  return (
    <div className="sf-app">
      <aside
        ref={sidebar}
        id="mobile-navigation"
        className="sf-sidebar"
        data-open={menuOpen}
        aria-label="Основная навигация"
        aria-hidden={mobile && !menuOpen ? true : undefined}
        inert={mobile && !menuOpen ? true : undefined}
        onKeyDown={handleDrawerKeyDown}
      >
        <Link href="/" className="sf-brand" onClick={closeMenu}>
          <span className="sf-brand-mark">SF</span>
          <span className="sf-brand-copy">
            <strong>SkillForge</strong>
            <small>инженерная уверенность</small>
          </span>
        </Link>
        <nav className="sf-sidebar-nav">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="sf-nav-link"
              aria-current={isCurrent(pathname, href) ? 'page' : undefined}
              onClick={closeMenu}
              title={label}
            >
              <Icon aria-hidden="true" size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sf-sidebar-footer">
          <ShieldCheck aria-hidden="true" size={15} /> Manual AI · локальные данные
        </div>
      </aside>
      {mobile && menuOpen ? (
        <button
          type="button"
          className="sf-sidebar-overlay"
          aria-label="Закрыть меню"
          tabIndex={-1}
          onClick={closeMenu}
        />
      ) : null}
      <div className="sf-main">
        <header className="sf-topbar">
          <div className="sf-actions">
            <button
              ref={menuButton}
              type="button"
              className="sf-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            >
              {menuOpen ? (
                <X aria-hidden="true" size={20} />
              ) : (
                <Menu aria-hidden="true" size={20} />
              )}
            </button>
            <Link href="/settings" className="sf-target-chip">
              {targetTrackKey ? `Цель: ${targetTrackKey}` : 'Целевой профиль'}
            </Link>
          </div>
          <div className="sf-topbar-actions">
            <Link className="sf-button sf-button--ghost" href="/import-export?mode=import">
              <Upload aria-hidden="true" size={16} /> Импорт
            </Link>
            <Link
              className="sf-button sf-button--secondary"
              href="/import-export?mode=export&scope=profile"
            >
              <Download aria-hidden="true" size={16} /> Экспорт
            </Link>
          </div>
        </header>
        <main className="sf-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

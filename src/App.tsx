/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { RecordFormView } from './views/RecordFormView';
import { NotificationsView } from './views/NotificationsView';
import { Menu, Sun, Moon, Languages } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { RecordItem } from './types';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  buildExpiryAlertMessage,
  filterExact30DayCivilIdRecords,
  hasNotifiedTodayForKey,
  isDeviceNotificationsEnabled,
  markNotifiedTodayForKeys,
  showDeviceNotification,
} from './utils/deviceNotifications';

type AppRoute =
  | { path: 'login' }
  | { path: 'records' }
  | { path: 'notifications' }
  | { path: 'record_new' }
  | { path: 'record_edit'; id: string };

function parseCurrentRoute(): AppRoute {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/login') return { path: 'login' };
  if (pathname === '/records/new') return { path: 'record_new' };
  if (pathname.startsWith('/records/')) {
    const id = pathname.replace('/records/', '').trim();
    if (id) return { path: 'record_edit', id };
  }
  if (pathname === '/notifications') return { path: 'notifications' };
  return { path: 'records' };
}

function MainAppContent() {
  const { user, loading, companyName } = useAuth();
  const { isDark, toggleTheme, lang, toggleLang } = usePreferences();
  const isAr = lang === 'ar';

  const [route, setRoute] = useState<AppRoute>(parseCurrentRoute());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const navigateTo = (newRoute: AppRoute) => {
    setRoute(newRoute);
    let url = '/records';
    if (newRoute.path === 'login') url = '/login';
    else if (newRoute.path === 'records') url = '/records';
    else if (newRoute.path === 'notifications') url = '/notifications';
    else if (newRoute.path === 'record_new') url = '/records/new';
    else if (newRoute.path === 'record_edit') url = `/records/${newRoute.id}`;

    if (window.location.pathname !== url) {
      window.history.pushState({}, '', url);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseCurrentRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!user && route.path !== 'login') {
        navigateTo({ path: 'login' });
      } else if (user && route.path === 'login') {
        navigateTo({ path: 'records' });
      }
    }
  }, [user, loading, route.path]);

  // Register PWA service worker for offline & desktop/mobile notifications
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      registerSW({ immediate: true });
    }
  }, []);

  // Sync exact 30-day email alerts as OS-level desktop/phone notifications + Realtime listener
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const checkAndNotify30DayAlerts = async () => {
      if (!isDeviceNotificationsEnabled()) return;
      try {
        const { data, error } = await supabase.from('records_with_status').select('*');
        if (error || !data) return;

        const dueRecords = filterExact30DayCivilIdRecords(data as RecordItem[]);
        if (dueRecords.length === 0) return;

        const unnotified = dueRecords.filter(
          (r) => !hasNotifiedTodayForKey(`${r.id}|${r.unique_number_expiry_date || r.unique_number_expiry || ''}`)
        );
        if (unnotified.length === 0) return;

        const payload = buildExpiryAlertMessage(unnotified, companyName, lang);
        const shown = await showDeviceNotification(payload);
        if (shown) {
          markNotifiedTodayForKeys(
            unnotified.map((r) => `${r.id}|${r.unique_number_expiry_date || r.unique_number_expiry || ''}`)
          );
        }
      } catch (err) {
        console.warn('Device notification sync check failed:', err);
      }
    };

    checkAndNotify30DayAlerts();

    const intervalId = window.setInterval(checkAndNotify30DayAlerts, 30 * 60 * 1000);

    const realtimeChannel = supabase
      .channel('notifications_log_device_alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications_log' },
        async (payload) => {
          if (!isDeviceNotificationsEnabled()) return;
          const row = payload.new as {
            record_id?: string;
            status?: string;
            kind?: string;
            target_expiry?: string;
          } | null;
          if (!row || row.status !== 'sent' || row.kind !== 'unique_number' || !row.record_id) {
            return;
          }
          const dedupeKey = `${row.record_id}|${row.target_expiry || ''}`;
          if (hasNotifiedTodayForKey(dedupeKey)) return;

          const { data: rec } = await supabase
            .from('records_with_status')
            .select('*')
            .eq('id', row.record_id)
            .maybeSingle();

          if (rec) {
            const msg = buildExpiryAlertMessage([rec as RecordItem], companyName, lang);
            const shown = await showDeviceNotification(msg);
            if (shown) {
              markNotifiedTodayForKeys([dedupeKey]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(realtimeChannel);
    };
  }, [user, companyName, lang]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F8] dark:bg-slate-950">
        <div className="w-10 h-10 border-4 border-[#0F766E]/20 border-t-[#0F766E] rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {isAr ? 'جاري تحميل النظام...' : 'Loading system...'}
        </p>
      </div>
    );
  }

  if (!user || route.path === 'login') {
    return (
      <LoginView
        onLoginSuccess={() => {
          navigateTo({ path: 'records' });
        }}
      />
    );
  }

  const currentSidebarTab = route.path === 'notifications' ? 'notifications' : 'records';

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-slate-950 flex flex-col lg:flex-row text-slate-900 dark:text-slate-100 transition-colors">
      {/* Persistent Sidebar */}
      <Sidebar
        currentTab={currentSidebarTab}
        onSelectTab={(tab) => {
          if (tab === 'notifications') navigateTo({ path: 'notifications' });
          else navigateTo({ path: 'records' });
        }}
        onAddNewRecord={() => navigateTo({ path: 'record_new' })}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area (using logical margin ms-64 for automatic RTL/LTR support) */}
      <div className="flex-1 flex flex-col min-w-0 lg:ms-64">
        {/* Top Header for Mobile/Tablet */}
        <header className="flex lg:hidden items-center justify-between px-4 py-3.5 bg-[#0B3B38] dark:bg-slate-900 border-b border-white/10 dark:border-slate-800 text-white sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.png"
              alt={companyName || "A'system"}
              className="w-8 h-8 object-contain shrink-0"
            />
            <span dir="ltr" className="font-brand text-xl tracking-wide truncate">
              {companyName || "A'system"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              title={isDark ? 'Light Mode' : 'Dark Mode'}
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-300" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className="p-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              title="RTL / LTR"
            >
              <Languages className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              title={isAr ? 'فتح القائمة' : 'Open Menu'}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* View Port Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {route.path === 'notifications' && <NotificationsView />}

          {route.path === 'records' && (
            <DashboardView
              onAddNew={() => navigateTo({ path: 'record_new' })}
              onEdit={(id) => navigateTo({ path: 'record_edit', id })}
            />
          )}

          {route.path === 'record_new' && (
            <RecordFormView
              recordId={null}
              onBack={() => navigateTo({ path: 'records' })}
              onSaved={() => navigateTo({ path: 'records' })}
            />
          )}

          {route.path === 'record_edit' && (
            <RecordFormView
              recordId={route.id}
              onBack={() => navigateTo({ path: 'records' })}
              onSaved={() => navigateTo({ path: 'records' })}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <MainAppContent />
        <OfflineIndicator />
      </AuthProvider>
    </PreferencesProvider>
  );
}

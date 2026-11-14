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
import { Menu, Sun, Moon, Languages, BellRing, AlertTriangle, X } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { RecordItem } from './types';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { triggerAutomaticExpiryCheck } from './utils/autoAlertTrigger';
import {
  buildExpiryAlertMessage,
  DeviceNotificationPayload,
  filterExact30DayCivilIdRecords,
  getDeviceNotificationPermission,
  hasNotifiedTodayForKey,
  isDeviceNotificationsEnabled,
  isRunningInIframe,
  markNotifiedTodayForKeys,
  NOTIF_PREF_EVENT,
  requestDeviceNotificationPermission,
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
  const [liveAlertBanner, setLiveAlertBanner] = useState<DeviceNotificationPayload | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getDeviceNotificationPermission()
  );
  const [promptDismissed, setPromptDismissed] = useState(false);

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

  // Auto-trigger email alerts & sync OS/in-app notifications whenever 30-day records exist
  useEffect(() => {
    const syncPerm = () => setNotifPermission(getDeviceNotificationPermission());
    window.addEventListener(NOTIF_PREF_EVENT, syncPerm);
    return () => window.removeEventListener(NOTIF_PREF_EVENT, syncPerm);
  }, []);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const runAutomaticChecks = async () => {
      // 1. Trigger idempotent backend email & log check (only sends if un-logged 30-day record exists)
      await triggerAutomaticExpiryCheck({
        lang,
        onAlertTriggered: (payload) => {
          setLiveAlertBanner(payload);
        },
      });

      // 2. Check local 30-day records for in-app banner & device OS notification
      try {
        const { data, error } = await supabase.from('records_with_status').select('*');
        if (error || !data) return;

        const dueRecords = filterExact30DayCivilIdRecords(data as RecordItem[]);
        if (dueRecords.length === 0) return;

        const payload = buildExpiryAlertMessage(dueRecords, companyName, lang);
        setLiveAlertBanner(payload);

        if (!isDeviceNotificationsEnabled()) return;

        const unnotified = dueRecords.filter(
          (r) =>
            !hasNotifiedTodayForKey(
              `${r.id}|${r.unique_number_expiry_date || r.unique_number_expiry || ''}`
            )
        );
        if (unnotified.length === 0) return;

        const unnotifiedPayload = buildExpiryAlertMessage(unnotified, companyName, lang);
        const shown = await showDeviceNotification(unnotifiedPayload);
        if (shown) {
          markNotifiedTodayForKeys(
            unnotified.map(
              (r) => `${r.id}|${r.unique_number_expiry_date || r.unique_number_expiry || ''}`
            )
          );
        }
      } catch (err) {
        console.warn('Device notification sync check failed:', err);
      }
    };

    runAutomaticChecks();

    const intervalId = window.setInterval(runAutomaticChecks, 10 * 60 * 1000);
    const handlePrefEnabled = () => {
      if (isDeviceNotificationsEnabled()) {
        runAutomaticChecks();
      }
    };
    window.addEventListener(NOTIF_PREF_EVENT, handlePrefEnabled);

    const realtimeChannel = supabase
      .channel('notifications_log_device_alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications_log' },
        async (payload) => {
          const row = payload.new as {
            record_id?: string;
            status?: string;
            kind?: string;
            target_expiry?: string;
          } | null;
          if (!row || row.status !== 'sent' || row.kind !== 'unique_number' || !row.record_id) {
            return;
          }

          const { data: rec } = await supabase
            .from('records_with_status')
            .select('*')
            .eq('id', row.record_id)
            .maybeSingle();

          if (rec) {
            const msg = buildExpiryAlertMessage([rec as RecordItem], companyName, lang);
            setLiveAlertBanner(msg);

            const dedupeKey = `${row.record_id}|${row.target_expiry || ''}`;
            if (isDeviceNotificationsEnabled() && !hasNotifiedTodayForKey(dedupeKey)) {
              const shown = await showDeviceNotification(msg);
              if (shown) {
                markNotifiedTodayForKeys([dedupeKey]);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(NOTIF_PREF_EVENT, handlePrefEnabled);
      supabase.removeChannel(realtimeChannel);
    };
  }, [user, companyName, lang]);

  const handleRequestNotifPermissionBanner = async () => {
    const result = await requestDeviceNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      await showDeviceNotification({
        title: isAr ? "تم تفعيل إشعارات A'system التلقائية" : "A'system Automatic Alerts Enabled",
        body: isAr
          ? 'سيتم تنبيهك تلقائياً فور بقاء ٣٠ يوماً على انتهاء الرقم المدني لأي شخص.'
          : 'You will automatically receive alerts when any Civil ID has 30 days remaining.',
        url: '/notifications',
        dir: isAr ? 'rtl' : 'ltr',
        lang,
      });
    }
  };

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
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-5">
          {/* Prompt to enable OS notifications if permission is still 'default' */}
          {notifPermission === 'default' && !promptDismissed && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-xl text-sm text-teal-950 dark:text-teal-100 shadow-xs">
              <div className="flex items-center gap-2.5">
                <BellRing className="w-5 h-5 text-[#0F766E] dark:text-teal-400 shrink-0" />
                <div>
                  <p className="font-bold text-xs sm:text-sm">
                    {isAr
                      ? 'فعّل إشعارات الجهاز ليصلك التنبيه التلقائي على الكمبيوتر والهاتف'
                      : 'Enable device notifications for automatic alerts on desktop & mobile'}
                  </p>
                  {isRunningInIframe() && (
                    <p className="text-[11px] text-teal-800/80 dark:text-teal-300/80 mt-0.5">
                      {isAr
                        ? 'ملاحظة: عند فتح التطبيق في نافذة مستقلة أو تثبيته كأيقونة ستعمل إشعارات النظام بكامل كفاءتها.'
                        : 'Note: System notifications work best when opened in its own window or installed as an app icon.'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRequestNotifPermissionBanner}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0F766E] hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                >
                  {isAr ? 'تفعيل الإشعارات الآن' : 'Enable Notifications'}
                </button>
                <button
                  type="button"
                  onClick={() => setPromptDismissed(true)}
                  className="p-1 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900 rounded-lg cursor-pointer"
                  title={isAr ? 'إخفاء' : 'Dismiss'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Live Automatic 30-Day Expiry Alert Banner (Always visible even if OS alerts are blocked) */}
          {liveAlertBanner && (
            <div className="flex items-start justify-between gap-3 p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-950 dark:text-amber-100 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold">{liveAlertBanner.title}</p>
                  <p className="text-xs whitespace-pre-line leading-relaxed text-amber-900 dark:text-amber-200">
                    {liveAlertBanner.body}
                  </p>
                  {route.path !== 'notifications' && (
                    <button
                      type="button"
                      onClick={() => navigateTo({ path: 'notifications' })}
                      className="inline-block mt-1 text-xs font-bold text-[#0F766E] dark:text-teal-300 underline hover:no-underline cursor-pointer"
                    >
                      {isAr ? 'عرض سجل الإشعارات والبريد' : 'View Notifications Log'}
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiveAlertBanner(null)}
                className="p-1 text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900 rounded-lg cursor-pointer shrink-0"
                title={isAr ? 'إغلاق التنبيه' : 'Dismiss alert'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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

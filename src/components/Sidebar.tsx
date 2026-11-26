/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Users,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  PlusCircle,
  Mail,
  Sun,
  Moon,
  Languages,
  Bell,
  BellRing,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { PWAInstallButton } from './PWAInstallButton';
import {
  getDeviceNotificationPermission,
  isDeviceNotificationsEnabled,
  NOTIF_PREF_EVENT,
  requestDeviceNotificationPermission,
  setDeviceNotificationsEnabled,
  showDeviceNotification,
} from '../utils/deviceNotifications';

interface SidebarProps {
  currentTab: 'records' | 'files' | 'notifications';
  onSelectTab: (tab: 'records' | 'files' | 'notifications') => void;
  onAddNewRecord: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onAddNewRecord,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { user, isAdmin, companyName, logout } = useAuth();
  const { isDark, toggleTheme, lang, isRtl, toggleLang } = usePreferences();
  const isAr = lang === 'ar';
  const [notifEnabled, setNotifEnabled] = React.useState<boolean>(() => isDeviceNotificationsEnabled());

  React.useEffect(() => {
    const sync = () => setNotifEnabled(isDeviceNotificationsEnabled());
    window.addEventListener(NOTIF_PREF_EVENT, sync);
    return () => window.removeEventListener(NOTIF_PREF_EVENT, sync);
  }, []);

  const handleToggleDeviceNotifications = async () => {
    const perm = getDeviceNotificationPermission();
    if (perm === 'unsupported') return;

    if (perm !== 'granted') {
      const result = await requestDeviceNotificationPermission();
      const granted = result === 'granted';
      setNotifEnabled(granted);
      if (granted) {
        await showDeviceNotification({
          title: isAr ? 'تم تفعيل إشعارات Al-Muhallab' : 'Al-Muhallab Notifications Enabled',
          body: isAr
            ? 'ستصلك تنبيهات انتهاء الرقم المدني مباشرة على هذا الجهاز.'
            : 'You will receive Civil ID expiry alerts directly on this device.',
          url: '/notifications',
          dir: isAr ? 'rtl' : 'ltr',
          lang,
        });
      }
      return;
    }

    const next = !notifEnabled;
    setDeviceNotificationsEnabled(next);
    setNotifEnabled(next);
  };

  const positionClass = isRtl ? 'right-0' : 'left-0';
  const hiddenTranslate = isRtl ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 ${positionClass} z-40 flex flex-col w-64 bg-[#0B3B38] dark:bg-slate-900 dark:border-e dark:border-slate-800 text-white shadow-xl transition-transform duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : hiddenTranslate
        }`}
      >
        {/* Company Header */}
        <div className="flex flex-col justify-center px-6 py-5 border-b border-white/10 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt={companyName || 'Al-Muhallab'}
              className="w-10 h-10 object-contain shrink-0"
            />
            <div className="overflow-hidden">
              <h1 dir="ltr" className="font-brand text-2xl text-white tracking-wide truncate leading-tight">
                {companyName || 'Al-Muhallab'}
              </h1>
              <span className="text-[11px] text-teal-200/70 block">
                {isAr ? 'نظام تنبيهات الصلاحية' : 'Document Expiry Alerts'}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              onAddNewRecord();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#0F766E] hover:bg-teal-600 active:bg-teal-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all border border-teal-500/40 cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>{isAr ? ' إضافة سجل جديد' : ' Add New Record'}</span>
          </button>
        </div>

        {/* Navigation Links (2 distinct pages — duplicate removed) */}
        <nav className="flex-1 min-h-0 px-3 py-6 space-y-1.5 overflow-y-auto sidebar-scrollbar">
          <button
            type="button"
            onClick={() => {
              onSelectTab('records');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-3 min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer ${
              currentTab === 'records'
                ? 'bg-white/15 text-white font-bold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5 text-teal-300 shrink-0" />
            <span>{isAr ? 'سجلات' : 'Records'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('files');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-3 min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer ${
              currentTab === 'files'
                ? 'bg-white/15 text-white font-bold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FolderOpen className="w-5 h-5 text-teal-300 shrink-0" />
            <span>{isAr ? 'الملفات والوثائق' : 'Files & Documents'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('notifications');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-3 min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer ${
              currentTab === 'notifications'
                ? 'bg-white/15 text-white font-bold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Mail className="w-5 h-5 text-teal-300 shrink-0" />
            <span>{isAr ? 'التنبيهات' : 'Notifications'}</span>
          </button>
        </nav>

        {/* PWA Install, Device Notifications, Appearance & Language Switchers */}
        <div className="px-4 py-3 border-t border-white/10 dark:border-slate-800 space-y-2">
          <PWAInstallButton variant="sidebar" />

          {getDeviceNotificationPermission() !== 'unsupported' && (
            <button
              type="button"
              onClick={handleToggleDeviceNotifications}
              className={`w-full flex items-center justify-center gap-2 min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                notifEnabled
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/30'
                  : 'bg-white/10 hover:bg-white/15 text-white/90'
              }`}
            >
              {notifEnabled ? (
                <>
                  <BellRing className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>{isAr ? 'إشعارات الجهاز: مفعلة' : 'Device Alerts: On'}</span>
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>{isAr ? 'تفعيل إشعارات الجهاز' : 'Enable Device Alerts'}</span>
                </>
              )}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? (isAr ? 'الوضع الفاتح' : 'Light Mode') : isAr ? 'الوضع الداكن' : 'Dark Mode'}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors cursor-pointer"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isAr ? 'فاتح' : 'Light'}</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-teal-200" />
                  <span>{isAr ? 'داكن' : 'Dark'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={toggleLang}
              title={isAr ? 'التبديل للإنجليزية (LTR)' : 'Switch to Arabic (RTL)'}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5 text-teal-300" />
              <span className="font-mono">{isAr ? 'EN (LTR)' : 'AR (RTL)'}</span>
            </button>
          </div>
        </div>

        {/* Footer: User profile & Logout */}
        <div className="p-4 border-t border-white/10 dark:border-slate-800 bg-black/15">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white/90 shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-semibold text-white truncate" dir="ltr">
                {user?.email}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                    <ShieldCheck className="w-3 h-3" />
                    {isAr ? 'مدير النظام' : 'Admin'}
                  </span>
                ) : (
                  <span className="text-[10px] text-white/60">
                    {isAr ? 'مستخدم معتمد' : 'Authorized User'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 text-xs font-medium text-red-200 hover:text-white bg-red-500/15 hover:bg-red-600/30 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Bell, Users, LogOut, ShieldCheck, User as UserIcon, PlusCircle, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  currentTab: 'alerts' | 'records' | 'notifications';
  onSelectTab: (tab: 'alerts' | 'records' | 'notifications') => void;
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
        className={`fixed top-0 bottom-0 right-0 z-40 flex flex-col w-64 bg-[#0B3B38] text-white shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Company Header */}
        <div className="flex flex-col justify-center px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-300 shrink-0 font-bold text-lg">
              {companyName ? companyName.charAt(0) : 'ت'}
            </div>
            <div className="overflow-hidden">
              <h1 className="text-lg font-bold text-white tracking-wide truncate">
                {companyName || 'برنامج التنبيه'}
              </h1>
              <span className="text-[11px] text-teal-200/70 block">نظام تنبيهات الصلاحية</span>
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
            <span>+ إضافة سجل جديد</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onSelectTab('alerts');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-3 min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer ${
              currentTab === 'alerts'
                ? 'bg-white/15 text-white font-bold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Bell className="w-5 h-5 text-teal-300" />
            <span>لوحة التنبيهات</span>
          </button>

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
            <Users className="w-5 h-5 text-teal-300" />
            <span>السجلات</span>
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
            <Mail className="w-5 h-5 text-teal-300" />
            <span>سجل التنبيهات والبريد</span>
          </button>
        </nav>

        {/* Footer: User profile & Logout */}
        <div className="p-4 border-t border-white/10 bg-black/15">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white/90">
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
                    مدير النظام
                  </span>
                ) : (
                  <span className="text-[10px] text-white/60">مستخدم معتمد</span>
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
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
};

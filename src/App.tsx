/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { RecordFormView } from './views/RecordFormView';
import { NotificationsView } from './views/NotificationsView';
import { Menu } from 'lucide-react';

type AppRoute =
  | { path: 'login' }
  | { path: 'dashboard' }
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
  if (pathname === '/records') return { path: 'records' };
  if (pathname === '/notifications') return { path: 'notifications' };
  return { path: 'dashboard' };
}

function MainAppContent() {
  const { user, loading, companyName } = useAuth();
  const [route, setRoute] = useState<AppRoute>(parseCurrentRoute());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Sync route state with browser history
  const navigateTo = (newRoute: AppRoute) => {
    setRoute(newRoute);
    let url = '/dashboard';
    if (newRoute.path === 'login') url = '/login';
    else if (newRoute.path === 'dashboard') url = '/dashboard';
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

  // Protect routes: Redirect unauthenticated users to /login
  useEffect(() => {
    if (!loading) {
      if (!user && route.path !== 'login') {
        navigateTo({ path: 'login' });
      } else if (user && route.path === 'login') {
        navigateTo({ path: 'dashboard' });
      }
    }
  }, [user, loading, route.path]);

  // Loading spinner during auth check
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F8]">
        <div className="w-10 h-10 border-4 border-[#0F766E]/20 border-t-[#0F766E] rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-700">جاري تحميل النظام...</p>
      </div>
    );
  }

  // Login view
  if (!user || route.path === 'login') {
    return (
      <LoginView
        onLoginSuccess={() => {
          navigateTo({ path: 'dashboard' });
        }}
      />
    );
  }

  // Determine current active tab for sidebar highlight
  const currentSidebarTab =
    route.path === 'notifications'
      ? 'notifications'
      : route.path === 'records'
      ? 'records'
      : 'dashboard';

  // Authenticated layout
  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col lg:flex-row text-slate-900 font-sans">
      {/* Right-side persistent Sidebar */}
      <Sidebar
        currentTab={currentSidebarTab}
        onSelectTab={(tab) => {
          if (tab === 'notifications') navigateTo({ path: 'notifications' });
          else if (tab === 'records') navigateTo({ path: 'records' });
          else navigateTo({ path: 'dashboard' });
        }}
        onAddNewRecord={() => navigateTo({ path: 'record_new' })}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area (padded on right for lg sidebar) */}
      <div className="flex-1 flex flex-col min-w-0 lg:mr-64">
        {/* Top Header for Mobile/Tablet */}
        <header className="flex lg:hidden items-center justify-between px-4 py-3.5 bg-[#0B3B38] text-white sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 font-bold text-sm font-mono">
              {companyName ? companyName.charAt(0).toUpperCase() : 'N'}
            </div>
            <span className="font-bold text-base truncate">{companyName}</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10"
            title="فتح القائمة"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* View Port Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {route.path === 'notifications' && (
            <NotificationsView />
          )}

          {route.path === 'dashboard' && (
            <DashboardView
              activeSidebarTab="dashboard"
              onAddNew={() => navigateTo({ path: 'record_new' })}
              onEdit={(id) => navigateTo({ path: 'record_edit', id })}
            />
          )}

          {route.path === 'records' && (
            <DashboardView
              activeSidebarTab="records"
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
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

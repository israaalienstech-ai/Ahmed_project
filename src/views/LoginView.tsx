/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, ShieldAlert, Sun, Moon, Languages } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { isSupabaseConfigured } from '../lib/supabase';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { login } = useAuth();
  const { isDark, toggleTheme, lang, toggleLang } = usePreferences();
  const isAr = lang === 'ar';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage(
        isAr
          ? 'يرجى إدخال اسم المستخدم (البريد الإلكتروني) وكلمة المرور.'
          : 'Please enter your email and password.'
      );
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      onLoginSuccess();
    } else {
      setErrorMessage(
        result.error ||
          (isAr ? 'فشل تسجيل الدخول. يرجى التحقق من البيانات.' : 'Sign in failed. Please verify your credentials.')
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#F8FAFC] dark:bg-slate-950 transition-colors relative">
      {/* Top Toolbar for Theme & Language/Direction */}
      <div className="fixed top-4 end-4 flex items-center gap-2 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>{isAr ? 'الوضع الفاتح' : 'Light'}</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-600" />
              <span>{isAr ? 'الوضع الداكن' : 'Dark'}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Languages className="w-4 h-4 text-[#0F766E] dark:text-teal-400" />
          <span className="font-mono">{isAr ? 'EN (LTR)' : 'AR (RTL)'}</span>
        </button>
      </div>

      {/* Unconfigured Supabase Banner Notification */}
      {!isSupabaseConfigured && (
        <div className="w-full max-w-md mb-6 p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-sm shadow-xs">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                {isAr ? 'تنبيه إعدادات Supabase:' : 'Supabase Configuration Alert:'}
              </p>
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                {isAr ? 'يرجى إضافة متغيرات الاتصال في ملف ' : 'Please add connection variables to '}
                <code className="bg-amber-100 dark:bg-amber-900/70 px-1 py-0.5 rounded font-mono" dir="ltr">
                  .env
                </code>
                :
              </p>
              <pre
                className="text-[11px] font-mono bg-amber-100/70 dark:bg-slate-900 p-2 rounded text-slate-800 dark:text-slate-200 mt-1 overflow-x-auto text-left"
                dir="ltr"
              >
                {`VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-[#E2E8F0] dark:border-slate-800 p-8">
        {/* Company Header & Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <img
            src="/logo.png"
            alt="Al-Muhallab"
            className="w-20 h-20 object-contain mb-4"
          />
          <h1
            dir="ltr"
            className="font-brand text-4xl text-slate-900 dark:text-white mb-2 tracking-wide"
          >
            Al-Muhallab
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAr
              ? 'نظام إدارة ومتابعة تواريخ الصلاحية والوثائق'
              : 'Document & Civil ID Expiry Tracking System'}
          </p>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="flex items-center gap-3 p-3.5 mb-6 text-sm text-red-800 dark:text-red-300 bg-[#FEE2E2] dark:bg-red-950/60 border border-[#FECACA] dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-[#B91C1C] dark:text-red-400 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="username-email"
              className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
            >
              {isAr ? 'اسم المستخدم (البريد الإلكتروني)' : 'Email Address'}
            </label>
            <div className="relative">
              <input
                id="username-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full min-h-[44px] px-3.5 pe-10 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all text-sm"
                dir="ltr"
              />
              <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
            >
              {isAr ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[44px] px-3.5 pe-10 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all text-sm"
                dir="ltr"
              />
              <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 text-base font-bold text-white bg-[#0F766E] hover:bg-teal-800 active:bg-teal-900 rounded-lg shadow-md transition-all focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#0F766E] disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isAr ? 'جاري تسجيل الدخول...' : 'Signing in...'}</span>
              </>
            ) : (
              <span>{isAr ? 'تسجيل الدخول' : 'Sign In'}</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
          <p>
            {isAr
              ? 'الدخول مخصص للموظفين المصرح لهم فقط وفقاً لسياسات الأمان.'
              : 'Access is restricted to authorized personnel only.'}
          </p>
        </div>
      </div>
    </div>
  );
};

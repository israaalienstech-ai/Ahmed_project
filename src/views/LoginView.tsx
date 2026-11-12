/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, ShieldAlert, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('يرجى إدخال اسم المستخدم (البريد الإلكتروني) وكلمة المرور.');
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      onLoginSuccess();
    } else {
      setErrorMessage(result.error || 'فشل تسجيل الدخول. يرجى التحقق من البيانات.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#F4F6F8]">
      {/* Unconfigured Supabase Banner Notification */}
      {!isSupabaseConfigured && (
        <div className="w-full max-w-md mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm shadow-xs">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">تنبيه إعدادات Supabase:</p>
              <p className="text-xs leading-relaxed text-amber-800">
                يرجى إضافة متغيرات الاتصال في ملف <code className="bg-amber-100 px-1 py-0.5 rounded font-mono" dir="ltr">.env</code>:
              </p>
              <pre className="text-[11px] font-mono bg-amber-100/70 p-2 rounded text-slate-800 mt-1 overflow-x-auto text-left" dir="ltr">
{`VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-8">
        {/* Company Header & Logo Placeholder */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#0F766E]/10 border border-[#0F766E]/20 flex items-center justify-center text-[#0F766E] mb-4 shadow-xs">
            <KeyRound className="w-8 h-8" />
          </div>
          {/* Default app name per RLS rule prior to login */}
          <h1 className="text-2xl font-bold text-slate-900 mb-1" dir="ltr">notifyme</h1>
          <p className="text-sm text-slate-500">نظام إدارة ومتابعة تواريخ الصلاحية والوثائق</p>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="flex items-center gap-3 p-3.5 mb-6 text-sm text-red-800 bg-[#FEE2E2] border border-[#FECACA] rounded-lg">
            <AlertCircle className="w-5 h-5 text-[#B91C1C] shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="username-email"
              className="block text-sm font-semibold text-slate-700 mb-2"
            >
              اسم المستخدم (البريد الإلكتروني)
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
                className="w-full min-h-[44px] px-3.5 pr-10 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all text-sm"
                dir="ltr"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-semibold text-slate-700 mb-2"
            >
              كلمة المرور
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
                className="w-full min-h-[44px] px-3.5 pr-10 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all text-sm"
                dir="ltr"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
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
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              <span>تسجيل الدخول</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-500 border-t border-slate-100 pt-4">
          <p>الدخول مخصص للموظفين المصرح لهم فقط وفقاً لسياسات الأمان.</p>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { usePreferences } from '../context/PreferencesContext';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'sidebar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { lang } = usePreferences();
  const isAr = lang === 'ar';
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'compact'
            ? 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold bg-teal-500/20 hover:bg-teal-500/30 text-teal-100 border border-teal-400/30 rounded-lg transition-colors cursor-pointer'
            : 'w-full flex items-center justify-center gap-2 min-h-[38px] px-3 py-2 text-xs font-bold bg-teal-500/20 hover:bg-teal-500/30 text-teal-100 border border-teal-400/30 rounded-lg transition-colors cursor-pointer'
        }
        title={isAr ? 'تثبيت التطبيق كأيقونة على الجهاز' : 'Install app icon on device'}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{isAr ? 'تثبيت التطبيق كأيقونة' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'compact'
              ? 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold bg-teal-500/20 hover:bg-teal-500/30 text-teal-100 border border-teal-400/30 rounded-lg transition-colors cursor-pointer'
              : 'w-full flex items-center justify-center gap-2 min-h-[38px] px-3 py-2 text-xs font-bold bg-teal-500/20 hover:bg-teal-500/30 text-teal-100 border border-teal-400/30 rounded-lg transition-colors cursor-pointer'
          }
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'إضافة للشاشة الرئيسية (iOS)' : 'Add to Home Screen'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl text-slate-900 dark:text-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold">
                  {isAr ? 'تثبيت A\'system على الآيفون / الآيباد' : 'Install A\'system on iPhone / iPad'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside leading-relaxed">
                <li>
                  {isAr
                    ? 'افتح التطبيق في متصفح Safari واضغط على زر المشاركة (Share).'
                    : 'Tap the Share button in the Safari toolbar.'}
                </li>
                <li>
                  {isAr
                    ? 'اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).'
                    : 'Scroll down and tap "Add to Home Screen".'}
                </li>
                <li>
                  {isAr
                    ? 'افتح التطبيق من الأيقونة على الشاشة الرئيسية لتفعيل إشعارات الجهاز.'
                    : 'Launch the app from your Home Screen icon to enable device notifications.'}
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#0F766E] hover:bg-teal-800 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
              >
                {isAr ? 'فهمت' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

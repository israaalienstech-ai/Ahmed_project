/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { ExpiryStatus } from '../types';
import { usePreferences } from '../context/PreferencesContext';

interface StatusChipProps {
  label: string;
  status?: ExpiryStatus | null;
  daysLeft?: number | null;
}

export const StatusChip: React.FC<StatusChipProps> = ({ label, status, daysLeft }) => {
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  let textClass = 'text-emerald-700 dark:text-emerald-400';
  let statusText = isAr ? 'ساري' : 'Valid';
  let Icon = CheckCircle2;

  if (status === 'expired') {
    textClass = 'text-red-600 dark:text-red-400';
    statusText = isAr ? 'منتهي' : 'Expired';
    Icon = XCircle;
  } else if (status === 'expiring_soon') {
    textClass = 'text-amber-600 dark:text-amber-400';
    statusText = isAr ? 'ينتهي قريباً' : 'Expiring soon';
    Icon = Clock;
  }

  let daysText = '';
  if (daysLeft !== undefined && daysLeft !== null) {
    if (daysLeft < 0) {
      daysText = isAr ? `منذ ${Math.abs(daysLeft)} يوم` : `${Math.abs(daysLeft)}d ago`;
    } else if (daysLeft === 0) {
      daysText = isAr ? 'اليوم' : 'Today';
    } else {
      daysText = isAr ? `متبقٍ ${daysLeft} يوم` : `${daysLeft}d left`;
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs leading-relaxed">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${textClass}`} />
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}:</span>
      <span className={`font-semibold ${textClass}`}>{statusText}</span>
      {daysText && (
        <>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
            {daysText}
          </span>
        </>
      )}
    </div>
  );
};

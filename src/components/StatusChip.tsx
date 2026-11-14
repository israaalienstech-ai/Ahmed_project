/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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

  let bgClass =
    'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0] dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80';
  let statusText = isAr ? 'ساري' : 'Valid';

  if (status === 'expired') {
    bgClass =
      'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA] dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80';
    statusText = isAr ? 'منتهي' : 'Expired';
  } else if (status === 'expiring_soon') {
    bgClass =
      'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80';
    statusText = isAr ? 'ينتهي قريباً' : 'Expiring soon';
  }

  let daysText = '';
  if (daysLeft !== undefined && daysLeft !== null) {
    if (daysLeft < 0) {
      daysText = isAr ? `(منذ ${Math.abs(daysLeft)} يوم)` : `(${Math.abs(daysLeft)}d ago)`;
    } else if (daysLeft === 0) {
      daysText = isAr ? `(اليوم)` : `(Today)`;
    } else {
      daysText = isAr ? `(${daysLeft} يوم)` : `(${daysLeft}d)`;
    }
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${bgClass}`}
    >
      <span className="font-semibold text-slate-700 dark:text-slate-200">{label}:</span>
      <span>{statusText}</span>
      {daysText && <span className="font-mono tabular-nums text-[11px] opacity-90">{daysText}</span>}
    </div>
  );
};

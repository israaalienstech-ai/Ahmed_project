/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ExpiryStatus } from '../types';

interface StatusChipProps {
  label: string; // e.g. "الرقم المميز" or "الجواز"
  status?: ExpiryStatus | null;
  daysLeft?: number | null;
}

export const StatusChip: React.FC<StatusChipProps> = ({ label, status, daysLeft }) => {
  // Determine chip style based on status
  let bgClass = 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'; // Default: valid
  let statusText = 'ساري';

  if (status === 'expired') {
    bgClass = 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]';
    statusText = 'منتهي';
  } else if (status === 'expiring_soon') {
    bgClass = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
    statusText = 'ينتهي قريباً';
  }

  // Days left text in Western numerals (0-9)
  let daysText = '';
  if (daysLeft !== undefined && daysLeft !== null) {
    if (daysLeft < 0) {
      daysText = `(منذ ${Math.abs(daysLeft)} يوم)`;
    } else if (daysLeft === 0) {
      daysText = `(اليوم)`;
    } else {
      daysText = `(${daysLeft} يوم)`;
    }
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${bgClass}`}>
      <span className="font-semibold text-slate-700">{label}:</span>
      <span>{statusText}</span>
      {daysText && <span className="font-mono tabular-nums text-[11px] opacity-90">{daysText}</span>}
    </div>
  );
};

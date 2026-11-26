/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  X,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileBarChart2,
  Download,
  Search,
  User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RecordItem, ExpiryStatus } from '../types';
import { usePreferences } from '../context/PreferencesContext';
import { formatKuwaitDate } from '../utils/date';
import { computeKuwaitDaysLeft } from '../utils/deviceNotifications';
import { translateErrorMessage } from '../utils/errors';

interface QuickReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ReportCategory = 'all' | 'expired' | 'expiring_soon' | 'valid';

interface CategorizedRecord {
  record: RecordItem;
  category: 'expired' | 'expiring_soon' | 'valid';
  civilDays: number | null;
  passportDays: number | null;
  civilStatus: ExpiryStatus;
  passportStatus: ExpiryStatus;
  nearestDays: number;
}

function resolveDocStatus(
  explicitStatus: ExpiryStatus | undefined,
  daysLeft: number | null
): ExpiryStatus {
  if (explicitStatus) return explicitStatus;
  if (daysLeft === null) return 'valid';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring_soon';
  return 'valid';
}

export const QuickReportModal: React.FC<QuickReportModalProps> = ({ isOpen, onClose }) => {
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('records_with_status')
        .select('*');

      if (fetchErr) throw fetchErr;
      setRecords((data || []) as RecordItem[]);
    } catch (err: any) {
      setError(translateErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    if (isOpen) {
      fetchReportData();
    }
  }, [isOpen, fetchReportData]);

  const categorized = useMemo(() => {
    const expired: CategorizedRecord[] = [];
    const expiringSoon: CategorizedRecord[] = [];
    const valid: CategorizedRecord[] = [];

    for (const r of records) {
      const civilDate = r.unique_number_expiry_date || r.unique_number_expiry;
      const passportDate = r.passport_expiry_date || r.passport_expiry;

      const civilDays =
        typeof r.unique_number_days_left === 'number'
          ? r.unique_number_days_left
          : computeKuwaitDaysLeft(civilDate);

      const passportDays =
        typeof r.passport_days_left === 'number'
          ? r.passport_days_left
          : computeKuwaitDaysLeft(passportDate);

      const civilStatus = resolveDocStatus(r.unique_number_status, civilDays);
      const passportStatus = resolveDocStatus(r.passport_status, passportDays);

      const nearestDays = Math.min(
        civilDays !== null ? civilDays : 999999,
        passportDays !== null ? passportDays : 999999
      );

      let category: 'expired' | 'expiring_soon' | 'valid' = 'valid';
      if (civilStatus === 'expired' || passportStatus === 'expired') {
        category = 'expired';
      } else if (civilStatus === 'expiring_soon' || passportStatus === 'expiring_soon') {
        category = 'expiring_soon';
      }

      const item: CategorizedRecord = {
        record: r,
        category,
        civilDays,
        passportDays,
        civilStatus,
        passportStatus,
        nearestDays,
      };

      if (category === 'expired') expired.push(item);
      else if (category === 'expiring_soon') expiringSoon.push(item);
      else valid.push(item);
    }

    const byNearest = (a: CategorizedRecord, b: CategorizedRecord) => a.nearestDays - b.nearestDays;
    expired.sort(byNearest);
    expiringSoon.sort(byNearest);
    valid.sort(byNearest);

    return { expired, expiringSoon, valid };
  }, [records]);

  const filterBySearch = useCallback(
    (list: CategorizedRecord[]) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return list;
      return list.filter(({ record }) => {
        const name = (record.full_name || record.name || '').toLowerCase();
        const civil = (record.unique_number || '').toLowerCase();
        const passport = (record.passport_number || '').toLowerCase();
        const nat = (record.nationality || '').toLowerCase();
        return (
          name.includes(q) ||
          civil.includes(q) ||
          passport.includes(q) ||
          nat.includes(q)
        );
      });
    },
    [searchTerm]
  );

  const filteredExpired = useMemo(
    () => filterBySearch(categorized.expired),
    [categorized.expired, filterBySearch]
  );
  const filteredExpiringSoon = useMemo(
    () => filterBySearch(categorized.expiringSoon),
    [categorized.expiringSoon, filterBySearch]
  );
  const filteredValid = useMemo(
    () => filterBySearch(categorized.valid),
    [categorized.valid, filterBySearch]
  );

  const formatDaysLabel = (days: number | null) => {
    if (days === null) return '—';
    if (days < 0) {
      const abs = Math.abs(days);
      return isAr ? `منتهي منذ ${abs} يوم` : `Expired ${abs}d ago`;
    }
    if (days === 0) {
      return isAr ? 'ينتهي اليوم' : 'Expires today';
    }
    return isAr ? `متبقٍ ${days} يوم` : `${days}d left`;
  };

  const getStatusTextClasses = (status: ExpiryStatus) => {
    if (status === 'expired') {
      return 'text-red-600 dark:text-red-400';
    }
    if (status === 'expiring_soon') {
      return 'text-amber-600 dark:text-amber-400';
    }
    return 'text-emerald-700 dark:text-emerald-400';
  };

  const handleExportCsv = () => {
    const sections: CategorizedRecord[] = [
      ...(activeCategory === 'all' || activeCategory === 'expired' ? filteredExpired : []),
      ...(activeCategory === 'all' || activeCategory === 'expiring_soon'
        ? filteredExpiringSoon
        : []),
      ...(activeCategory === 'all' || activeCategory === 'valid' ? filteredValid : []),
    ];

    const categoryTitle = (cat: CategorizedRecord['category']) => {
      if (cat === 'expired') return isAr ? 'خلصت مدتهم (منتهية)' : 'Expired';
      if (cat === 'expiring_soon') return isAr ? 'قربت تخلص مدتهم (خلال 30 يوم)' : 'Expiring Soon';
      return isAr ? 'لسه بدري عليها (سارية)' : 'Valid (>30d)';
    };

    const headers = isAr
      ? [
          'التصنيف',
          'الاسم',
          'الرقم المدني',
          'انتهاء الرقم المدني',
          'حالة الرقم المدني',
          'رقم الجواز',
          'انتهاء الجواز',
          'حالة الجواز',
          'الجنسية',
        ]
      : [
          'Category',
          'Full Name',
          'Civil ID',
          'Civil ID Expiry',
          'Civil ID Status',
          'Passport Number',
          'Passport Expiry',
          'Passport Status',
          'Nationality',
        ];

    const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;

    const rows = sections.map((item) => {
      const r = item.record;
      const civilDate = r.unique_number_expiry_date || r.unique_number_expiry || '';
      const passDate = r.passport_expiry_date || r.passport_expiry || '';
      return [
        categoryTitle(item.category),
        r.full_name || r.name || '',
        r.unique_number || '',
        formatKuwaitDate(civilDate),
        formatDaysLabel(item.civilDays),
        r.passport_number || '',
        formatKuwaitDate(passDate),
        formatDaysLabel(item.passportDays),
        r.nationality || '',
      ]
        .map(escapeCsv)
        .join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quick-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const renderSection = (
    title: string,
    subtitle: string,
    items: CategorizedRecord[],
    _accent: 'red' | 'amber' | 'emerald',
    icon: React.ReactNode
  ) => {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {icon}
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
          </div>
          <span className="text-xs font-bold font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {items.length}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'لا توجد أسماء ضمن هذا التصنيف.' : 'No people in this category.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                <tr>
                  <th className="px-4 py-2.5 text-start whitespace-nowrap">
                    {isAr ? 'الاسم' : 'Name'}
                  </th>
                  <th className="px-4 py-2.5 text-start whitespace-nowrap">
                    {isAr ? 'الرقم المدني' : 'Civil ID'}
                  </th>
                  <th className="px-4 py-2.5 text-start whitespace-nowrap">
                    {isAr ? 'حالة المدني' : 'Civil ID Status'}
                  </th>
                  <th className="px-4 py-2.5 text-start whitespace-nowrap">
                    {isAr ? 'جواز السفر' : 'Passport'}
                  </th>
                  <th className="px-4 py-2.5 text-start whitespace-nowrap">
                    {isAr ? 'حالة الجواز' : 'Passport Status'}
                  </th>
                  <th className="px-4 py-2.5 text-start whitespace-nowrap">
                    {isAr ? 'الجنسية' : 'Nationality'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(({ record, civilDays, passportDays, civilStatus, passportStatus }) => {
                  const civilDate = record.unique_number_expiry_date || record.unique_number_expiry;
                  const passDate = record.passport_expiry_date || record.passport_expiry;

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{record.full_name || record.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{record.unique_number || '—'}</div>
                        <div className="text-[11px] text-slate-400">
                          {formatKuwaitDate(civilDate)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${getStatusTextClasses(
                            civilStatus
                          )}`}
                        >
                          {formatDaysLabel(civilDays)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{record.passport_number || '—'}</div>
                        <div className="text-[11px] text-slate-400">
                          {formatKuwaitDate(passDate)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${getStatusTextClasses(
                            passportStatus
                          )}`}
                        >
                          {formatDaysLabel(passportDays)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {record.nationality || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileBarChart2 className="w-5 h-5 text-[#0F766E] dark:text-teal-400 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr ? 'ريبورت سريع لحالة السجلات' : 'Quick Records Status Report'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? `إجمالي الأشخاص: ${records.length}`
                  : `Total people: ${records.length}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || records.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#0F766E] hover:bg-teal-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير Excel' : 'Export CSV'}</span>
            </button>
            <button
              type="button"
              onClick={fetchReportData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0F766E]' : ''}`} />
              <span>{isAr ? 'تحديث' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#F8FAFC] dark:bg-slate-950">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* 3 Summary Filter Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <button
              type="button"
              onClick={() =>
                setActiveCategory((prev) => (prev === 'expired' ? 'all' : 'expired'))
              }
              className={`text-start p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all cursor-pointer ${
                activeCategory === 'expired'
                  ? 'border-[#0F766E] ring-2 ring-[#0F766E]/25'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? 'خلصت مدتهم (منتهية)' : 'Expired'}
                </span>
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {categorized.expired.length}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'لديهم وثيقة منتهية الصلاحية' : 'Have an expired document'}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveCategory((prev) =>
                  prev === 'expiring_soon' ? 'all' : 'expiring_soon'
                )
              }
              className={`text-start p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all cursor-pointer ${
                activeCategory === 'expiring_soon'
                  ? 'border-[#0F766E] ring-2 ring-[#0F766E]/25'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? 'قربت تخلص مدتهم' : 'Expiring Soon'}
                </span>
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {categorized.expiringSoon.length}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'متبقٍ ٣٠ يوماً أو أقل على الانتهاء' : '30 days or less remaining'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory((prev) => (prev === 'valid' ? 'all' : 'valid'))}
              className={`text-start p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all cursor-pointer ${
                activeCategory === 'valid'
                  ? 'border-[#0F766E] ring-2 ring-[#0F766E]/25'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? 'لسه بدري عليها (سارية)' : 'Valid (> 30 Days)'}
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {categorized.valid.length}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'أكثر من ٣٠ يوماً على الانتهاء' : 'More than 30 days remaining'}
              </p>
            </button>
          </div>

          {/* Search & Category Tabs Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg flex-wrap">
              {(
                [
                  { id: 'all', labelAr: 'عرض الكل', labelEn: 'All' },
                  { id: 'expired', labelAr: 'خلصت مدتهم', labelEn: 'Expired' },
                  { id: 'expiring_soon', labelAr: 'قربت تخلص', labelEn: 'Expiring Soon' },
                  { id: 'valid', labelAr: 'لسه بدري عليها', labelEn: 'Valid' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeCategory === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAr ? tab.labelAr : tab.labelEn}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  isAr
                    ? 'بحث بالاسم، المدني، الجواز، الجنسية...'
                    : 'Search name, Civil ID, passport...'
                }
                className="w-full min-h-[38px] ps-9 pe-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E] mb-2" />
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'جاري تجهيز التقرير...' : 'Generating quick report...'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {(activeCategory === 'all' || activeCategory === 'expired') &&
                renderSection(
                  isAr ? 'أشخاص خلصت مدتهم (منتهية)' : 'Expired',
                  isAr
                    ? 'انتهت صلاحية الرقم المدني أو جواز السفر ويحتاجون لتجديد فوري'
                    : 'Civil ID or Passport has already expired',
                  filteredExpired,
                  'red',
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                )}

              {(activeCategory === 'all' || activeCategory === 'expiring_soon') &&
                renderSection(
                  isAr ? 'أشخاص قربت تخلص مدتهم (خلال ٣٠ يوماً)' : 'Expiring Soon (≤ 30 Days)',
                  isAr
                    ? 'متبقٍ على انتهاء الرقم المدني أو جواز السفر ٣٠ يوماً أو أقل'
                    : 'Civil ID or Passport expires within 30 days',
                  filteredExpiringSoon,
                  'amber',
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}

              {(activeCategory === 'all' || activeCategory === 'valid') &&
                renderSection(
                  isAr ? 'أشخاص لسه بدري عليها (سارية)' : 'Valid (> 30 Days Left)',
                  isAr
                    ? 'الوثائق سارية ومتبقٍ أكثر من ٣٠ يوماً على الانتهاء'
                    : 'All documents valid with more than 30 days remaining',
                  filteredValid,
                  'emerald',
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {isAr
              ? 'البيانات محدّثة مباشرة حسب توقيت الكويت.'
              : 'Live report calculated using Kuwait timezone.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

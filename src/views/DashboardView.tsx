/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Calendar,
  Filter,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RecordItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { formatKuwaitDate } from '../utils/date';
import { StatusChip } from '../components/StatusChip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { translateErrorMessage } from '../utils/errors';

interface DashboardViewProps {
  onAddNew: () => void;
  onEdit: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onAddNew, onEdit }) => {
  const { isAdmin } = useAuth();
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'civil_id' | 'passport'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring_soon' | 'expired' | 'valid'>('all');
  const [nationalityFilter, setNationalityFilter] = useState<string>('all');

  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('records_with_status')
        .select('*');

      if (fetchErr) {
        setError(translateErrorMessage(fetchErr, lang));
      } else {
        setRecords(data || []);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !isAdmin) return;

    setIsDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('records')
        .delete()
        .eq('id', deleteTarget.id);

      if (delErr) {
        setError(translateErrorMessage(delErr, lang));
      } else {
        setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        setToastMessage(isAr ? 'تم حذف السجل بنجاح.' : 'Record deleted successfully.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err, lang));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const metrics = useMemo(() => {
    let civilIdExpiringSoon = 0;
    let passportExpiringSoon = 0;
    let alreadyExpired = 0;

    for (const r of records) {
      const uStatus = r.unique_number_status;
      const pStatus = r.passport_status;

      if (uStatus === 'expiring_soon') {
        civilIdExpiringSoon++;
      }
      if (pStatus === 'expiring_soon') {
        passportExpiringSoon++;
      }
      if (uStatus === 'expired' || pStatus === 'expired') {
        alreadyExpired++;
      }
    }

    return {
      civilIdExpiringSoon,
      passportExpiringSoon,
      alreadyExpired,
    };
  }, [records]);

  const availableNationalities = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.nationality && r.nationality.trim()) {
        set.add(r.nationality.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [records]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    docTypeFilter !== 'all' ||
    statusFilter !== 'all' ||
    nationalityFilter !== 'all';

  const resetAllFilters = () => {
    setSearchTerm('');
    setDocTypeFilter('all');
    setStatusFilter('all');
    setNationalityFilter('all');
  };

  const filteredRecords = useMemo(() => {
    return records
      .filter((rec) => {
        // Document type filter check
        if (docTypeFilter === 'civil_id' && !rec.unique_number) return false;
        if (docTypeFilter === 'passport' && !rec.passport_number) return false;

        // Nationality filter check
        if (nationalityFilter !== 'all' && (rec.nationality || '').trim() !== nationalityFilter) {
          return false;
        }

        const name = (rec.full_name || rec.name || '').toLowerCase();
        const civilId = (rec.unique_number || '').toLowerCase();
        const passportNum = (rec.passport_number || '').toLowerCase();
        const query = searchTerm.toLowerCase().trim();

        const matchesSearch =
          !query ||
          name.includes(query) ||
          civilId.includes(query) ||
          passportNum.includes(query);

        if (!matchesSearch) return false;

        if (statusFilter === 'all') return true;

        if (docTypeFilter === 'civil_id') {
          return rec.unique_number_status === statusFilter;
        }
        if (docTypeFilter === 'passport') {
          return rec.passport_status === statusFilter;
        }

        if (statusFilter === 'expired') {
          return rec.unique_number_status === 'expired' || rec.passport_status === 'expired';
        }
        if (statusFilter === 'expiring_soon') {
          return (
            rec.unique_number_status === 'expiring_soon' || rec.passport_status === 'expiring_soon'
          );
        }
        if (statusFilter === 'valid') {
          return rec.unique_number_status === 'valid' && rec.passport_status === 'valid';
        }

        return true;
      })
      .sort((a, b) => {
        const getNearestDays = (item: RecordItem): number => {
          const uDays = typeof item.unique_number_days_left === 'number' ? item.unique_number_days_left : 999999;
          const pDays = typeof item.passport_days_left === 'number' ? item.passport_days_left : 999999;
          if (docTypeFilter === 'civil_id') return uDays;
          if (docTypeFilter === 'passport') return pDays;
          return Math.min(uDays, pDays);
        };

        return getNearestDays(a) - getNearestDays(b);
      });
  }, [records, searchTerm, docTypeFilter, statusFilter, nationalityFilter]);

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 start-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-800 text-white rounded-xl shadow-lg border border-emerald-700 animate-fade-in text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isAr ? 'سجلات' : 'Records'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'متابعة دقيقة ومباشرة لتواريخ انتهاء الرقم المدني وجوازات السفر'
              : 'Live monitoring of Civil ID and passport expiration dates'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchRecords}
            disabled={loading}
            title={isAr ? 'تحديث البيانات' : 'Refresh'}
            className="flex items-center gap-2 min-h-[44px] px-3.5 py-2 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-sm transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0F766E] dark:text-teal-400' : ''}`} />
            <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{isAr ? 'إضافة سجل' : 'Add Record'}</span>
          </button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[#FEE2E2] dark:bg-red-950/60 border border-[#FECACA] dark:border-red-800 rounded-xl text-sm text-red-900 dark:text-red-200">
          <AlertTriangle className="w-5 h-5 text-[#B91C1C] dark:text-red-400 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button
            type="button"
            onClick={fetchRecords}
            className="text-xs font-bold text-red-900 dark:text-red-200 underline hover:no-underline cursor-pointer"
          >
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card A: الرقم المدني ينتهي خلال ٣٠ يوماً */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'expiring_soon' ? 'all' : 'expiring_soon'))}
          className={`text-start p-5 bg-white dark:bg-slate-900 border rounded-xl shadow-xs cursor-pointer transition-all ${
            statusFilter === 'expiring_soon'
              ? 'border-[#0F766E] ring-2 ring-[#0F766E]/25'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isAr ? 'خلال ٣٠ يوماً' : 'Within 30 Days'}
            </span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
            {isAr ? 'الرقم المدني ينتهي قريباً' : 'Civil ID Expiring Soon'}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {metrics.civilIdExpiringSoon}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'سجل يحتاج تجديداً' : 'records need renewal'}
            </span>
          </div>
        </button>

        {/* Card B: الجواز ينتهي خلال سنة */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'expiring_soon' ? 'all' : 'expiring_soon'))}
          className={`text-start p-5 bg-white dark:bg-slate-900 border rounded-xl shadow-xs cursor-pointer transition-all ${
            statusFilter === 'expiring_soon'
              ? 'border-[#0F766E] ring-2 ring-[#0F766E]/25'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isAr ? 'خلال سنة' : 'Within 1 Year'}
            </span>
            <Calendar className="w-4 h-4 text-[#0F766E] dark:text-teal-400 shrink-0" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
            {isAr ? 'الجواز ينتهي قريباً' : 'Passport Expiring Soon'}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {metrics.passportExpiringSoon}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'جواز سفر قارب على الانتهاء' : 'passports nearing expiry'}
            </span>
          </div>
        </button>

        {/* Card C: منتهية بالفعل */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'expired' ? 'all' : 'expired'))}
          className={`text-start p-5 bg-white dark:bg-slate-900 border rounded-xl shadow-xs cursor-pointer transition-all ${
            statusFilter === 'expired'
              ? 'border-[#0F766E] ring-2 ring-[#0F766E]/25'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isAr ? 'منتهية الصلاحية' : 'Expired'}
            </span>
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
            {isAr ? 'وثائق منتهية بالفعل' : 'Already Expired'}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {metrics.alreadyExpired}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'وثيقة منتهية' : 'expired documents'}
            </span>
          </div>
        </button>
      </div>

      {/* Search Bar, Document Type Filter, Nationality Filter & Status Filter */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] p-4 shadow-xs space-y-3">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* Search Input (Name, Civil ID / Unique Number, Passport Number) */}
            <div className="relative flex-1 min-w-[240px]">
              <input
                id="dashboard-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label={
                  isAr
                    ? 'البحث بالاسم أو الرقم المميز أو رقم جواز السفر'
                    : 'Search by name, Civil ID, or passport number'
                }
                placeholder={
                  isAr
                    ? 'بحث بالاسم أو الرقم المميز / المدني أو جواز السفر...'
                    : 'Search by name, Civil ID / unique number, or passport...'
                }
                className="w-full min-h-[44px] ps-10 pe-9 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all"
              />
              <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  title={isAr ? 'مسح البحث' : 'Clear search'}
                  className="absolute inset-y-0 end-0 flex items-center pe-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Nationality Filter Dropdown */}
            <div className="relative shrink-0 min-w-[170px]">
              <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                <Filter className="w-4 h-4" />
              </div>
              <select
                value={nationalityFilter}
                onChange={(e) => setNationalityFilter(e.target.value)}
                aria-label={isAr ? 'تصفية حسب الجنسية' : 'Filter by nationality'}
                className="w-full min-h-[44px] ps-9 pe-8 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 text-sm font-medium focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all cursor-pointer"
              >
                <option value="all">{isAr ? 'كل الجنسيات' : 'All Nationalities'}</option>
                {availableNationalities.map((nat) => (
                  <option key={nat} value={nat}>
                    {nat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Segmented Status Filter Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full xl:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? `الكل (${records.length})` : `All (${records.length})`}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expiring_soon')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'expiring_soon'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? 'ينتهي قريباً' : 'Expiring Soon'}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'expired'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? 'منتهي' : 'Expired'}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('valid')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'valid'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? 'ساري' : 'Valid'}
            </button>
          </div>
        </div>

        {/* Secondary Filter Row: Document Type + Reset Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isAr ? 'نوع الوثيقة:' : 'Document Type:'}
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setDocTypeFilter('all')}
                className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  docTypeFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'كل الوثائق' : 'All Docs'}
              </button>
              <button
                type="button"
                onClick={() => setDocTypeFilter('civil_id')}
                className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  docTypeFilter === 'civil_id'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'رقم مدني' : 'Civil ID'}
              </button>
              <button
                type="button"
                onClick={() => setDocTypeFilter('passport')}
                className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  docTypeFilter === 'passport'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'جواز سفر' : 'Passport'}
              </button>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{isAr ? 'مسح الفلاتر' : 'Clear Filters'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
              <tr>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'الاسم' : 'Full Name'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'الرقم المدني' : 'Civil ID'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'تاريخ الانتهاء' : 'Civil ID Expiry'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'رقم الجواز' : 'Passport No.'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'الجنسية' : 'Nationality'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'انتهاء الجواز' : 'Passport Expiry'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'الحالة' : 'Status'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-center">
                  {isAr ? 'الإجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-32" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-slate-500 dark:text-slate-400">
                      <FileSpreadsheet className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                      <p className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                        {isAr ? 'لا توجد سجلات مطابقة' : 'No matching records'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {searchTerm
                          ? isAr
                            ? 'لم يتم العثور على أي نتائج تطابق عبارة البحث الحالية.'
                            : 'No records match your current search.'
                          : isAr
                          ? 'لم يتم إضافة أي سجلات بعد في النظام.'
                          : 'No records have been added yet.'}
                      </p>
                      <button
                        type="button"
                        onClick={onAddNew}
                        className="px-4 py-2 bg-[#0F766E] text-white text-xs font-bold rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
                      >
                        {isAr ? '+ إضافة أول سجل الآن' : '+ Add First Record'}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => {
                  const fullName = item.full_name || item.name || '—';
                  const civilIdExpiry = item.unique_number_expiry_date || item.unique_number_expiry;
                  const passportExpiry = item.passport_expiry_date || item.passport_expiry;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onEdit(item.id)}
                      title={isAr ? 'اضغط لفتح وتعديل بيانات السجل' : 'Click to open record details'}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                    >
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {fullName}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {item.unique_number || '—'}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatKuwaitDate(civilIdExpiry)}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {item.passport_number || '—'}
                      </td>

                      <td className="px-5 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {item.nationality || '—'}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatKuwaitDate(passportExpiry)}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 items-start">
                          <StatusChip
                            label={isAr ? 'الرقم المدني' : 'Civil ID'}
                            status={item.unique_number_status}
                            daysLeft={item.unique_number_days_left}
                          />
                          <StatusChip
                            label={isAr ? 'الجواز' : 'Passport'}
                            status={item.passport_status}
                            daysLeft={item.passport_days_left}
                          />
                        </div>
                      </td>

                      <td
                        className="px-5 py-4 whitespace-nowrap text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(item.id);
                            }}
                            title={isAr ? 'تعديل السجل' : 'Edit record'}
                            className="p-2 text-slate-600 dark:text-slate-400 hover:text-[#0F766E] dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(item);
                              }}
                              title={isAr ? 'حذف السجل' : 'Delete record'}
                              className="p-2 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer count */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <div>
            {isAr ? (
              <>
                إجمالي السجلات المعروضة:{' '}
                <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                  {filteredRecords.length}
                </span>{' '}
                من أصل{' '}
                <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                  {records.length}
                </span>
              </>
            ) : (
              <>
                Showing{' '}
                <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                  {filteredRecords.length}
                </span>{' '}
                of{' '}
                <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                  {records.length}
                </span>{' '}
                records
              </>
            )}
          </div>
          <div className="text-slate-400 dark:text-slate-500 text-[11px]">
            {isAr ? 'مرتبة تلقائياً حسب تاريخ الانتهاء الأقرب' : 'Sorted by nearest expiry'}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={isAr ? 'تأكيد حذف السجل' : 'Confirm Delete'}
        message={
          isAr
            ? `هل أنت متأكد من رغبتك في حذف سجل "${deleteTarget?.full_name || deleteTarget?.name || ''}" بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.`
            : `Are you sure you want to permanently delete "${deleteTarget?.full_name || deleteTarget?.name || ''}"? This cannot be undone.`
        }
        confirmLabel={isAr ? 'حذف السجل' : 'Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

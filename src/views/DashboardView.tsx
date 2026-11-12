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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RecordItem, ExpiryStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatKuwaitDate } from '../utils/date';
import { StatusChip } from '../components/StatusChip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { translateErrorMessage } from '../utils/errors';

interface DashboardViewProps {
  onAddNew: () => void;
  onEdit: (id: string) => void;
  activeSidebarTab: 'alerts' | 'records';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onAddNew,
  onEdit,
  activeSidebarTab: _activeSidebarTab,
}) => {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring_soon' | 'expired' | 'valid'>('all');

  // Deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Query the view records_with_status
      const { data, error: fetchErr } = await supabase
        .from('records_with_status')
        .select('*');

      if (fetchErr) {
        setError(translateErrorMessage(fetchErr));
      } else {
        setRecords(data || []);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Handle record deletion (Admin only)
  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !isAdmin) return;

    setIsDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('records')
        .delete()
        .eq('id', deleteTarget.id);

      if (delErr) {
        setError(translateErrorMessage(delErr));
      } else {
        setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        setToastMessage('تم حذف السجل بنجاح.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Summary Metrics computed from view records_with_status
  // a) الرقم المميز ينتهي خلال ٣٠ يوماً (unique_number_status = 'expiring_soon')
  // b) الجواز ينتهي خلال سنة (passport_status = 'expiring_soon')
  // c) منتهية بالفعل (either status = 'expired')
  const metrics = useMemo(() => {
    let uniqueNumberExpiringSoon = 0;
    let passportExpiringSoon = 0;
    let alreadyExpired = 0;

    for (const r of records) {
      const uStatus = r.unique_number_status;
      const pStatus = r.passport_status;

      if (uStatus === 'expiring_soon') {
        uniqueNumberExpiringSoon++;
      }
      if (pStatus === 'expiring_soon') {
        passportExpiringSoon++;
      }
      if (uStatus === 'expired' || pStatus === 'expired') {
        alreadyExpired++;
      }
    }

    return {
      uniqueNumberExpiringSoon,
      passportExpiringSoon,
      alreadyExpired,
    };
  }, [records]);

  // Filtered and Sorted records
  // Default sort: nearest expiry = smaller of unique_number_days_left and passport_days_left
  const filteredRecords = useMemo(() => {
    return records
      .filter((rec) => {
        // Search text: name, unique number, passport number
        const name = (rec.full_name || rec.name || '').toLowerCase();
        const uniqueNum = (rec.unique_number || '').toLowerCase();
        const passportNum = (rec.passport_number || '').toLowerCase();
        const query = searchTerm.toLowerCase().trim();

        const matchesSearch =
          !query ||
          name.includes(query) ||
          uniqueNum.includes(query) ||
          passportNum.includes(query);

        if (!matchesSearch) return false;

        // Status filter
        if (statusFilter === 'all') return true;
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
        // Default sort: nearest expiry = the smaller of unique_number_days_left and passport_days_left
        const getNearestDays = (item: RecordItem): number => {
          const uDays = typeof item.unique_number_days_left === 'number' ? item.unique_number_days_left : 999999;
          const pDays = typeof item.passport_days_left === 'number' ? item.passport_days_left : 999999;
          return Math.min(uDays, pDays);
        };

        return getNearestDays(a) - getNearestDays(b);
      });
  }, [records, searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-800 text-white rounded-xl shadow-lg border border-emerald-700 animate-fade-in text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">لوحة التنبيهات وإدارة السجلات</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            متابعة دقيقة ومباشرة لتواريخ انتهاء الرقم المميز وجوازات السفر
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchRecords}
            disabled={loading}
            title="تحديث البيانات"
            className="flex items-center gap-2 min-h-[44px] px-3.5 py-2 bg-white border border-[#E2E8F0] rounded-xl text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0F766E]' : ''}`} />
            <span className="hidden sm:inline">تحديث</span>
          </button>

          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>+ إضافة سجل</span>
          </button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[#FEE2E2] border border-[#FECACA] rounded-xl text-sm text-red-900">
          <AlertTriangle className="w-5 h-5 text-[#B91C1C] shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button
            type="button"
            onClick={fetchRecords}
            className="text-xs font-bold text-red-900 underline hover:no-underline"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* 3 Summary Cards computed from view records_with_status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card A: الرقم المميز ينتهي خلال ٣٠ يوماً */}
        <div
          onClick={() => setStatusFilter((curr) => (curr === 'expiring_soon' ? 'all' : 'expiring_soon'))}
          className={`p-5 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs cursor-pointer hover:border-amber-400 transition-all ${
            statusFilter === 'expiring_soon' ? 'ring-2 ring-amber-500 bg-amber-50/20' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-900 bg-[#FEF3C7] px-2.5 py-1 rounded-md">
              خلال 30 يوماً
            </span>
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">
            الرقم المميز ينتهي خلال ٣٠ يوماً
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-800 font-mono tabular-nums">
              {metrics.uniqueNumberExpiringSoon}
            </span>
            <span className="text-xs text-slate-500">سجل يحتاج تجديداً عاجلاً</span>
          </div>
        </div>

        {/* Card B: الجواز ينتهي خلال سنة */}
        <div
          onClick={() => setStatusFilter((curr) => (curr === 'expiring_soon' ? 'all' : 'expiring_soon'))}
          className={`p-5 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs cursor-pointer hover:border-teal-500 transition-all ${
            statusFilter === 'expiring_soon' ? 'ring-2 ring-[#0F766E] bg-teal-50/20' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-teal-900 bg-teal-100 px-2.5 py-1 rounded-md">
              خلال سنة
            </span>
            <div className="p-2.5 bg-teal-50 text-[#0F766E] rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">الجواز ينتهي خلال سنة</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0F766E] font-mono tabular-nums">
              {metrics.passportExpiringSoon}
            </span>
            <span className="text-xs text-slate-500">جواز سفر قارب على الانتهاء</span>
          </div>
        </div>

        {/* Card C: منتهية بالفعل */}
        <div
          onClick={() => setStatusFilter((curr) => (curr === 'expired' ? 'all' : 'expired'))}
          className={`p-5 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs cursor-pointer hover:border-red-400 transition-all ${
            statusFilter === 'expired' ? 'ring-2 ring-red-500 bg-red-50/20' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#B91C1C] bg-[#FEE2E2] px-2.5 py-1 rounded-md">
              منتهية الصلاحية
            </span>
            <div className="p-2.5 bg-red-50 text-[#B91C1C] rounded-xl">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">منتهية بالفعل</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#B91C1C] font-mono tabular-nums">
              {metrics.alreadyExpired}
            </span>
            <span className="text-xs text-slate-500">وثيقة انتهت صلاحيتها</span>
          </div>
        </div>
      </div>

      {/* Search Bar & Status Filter */}
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Box */}
        <div className="relative w-full md:w-96">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث بالاسم، الرقم المميز، أو رقم الجواز..."
            className="w-full min-h-[44px] pr-10 pl-4 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
        </div>

        {/* Segmented Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-full md:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الكل ({records.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expiring_soon')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'expiring_soon'
                ? 'bg-[#FEF3C7] text-[#92400E] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ينتهي قريباً
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'expired'
                ? 'bg-[#FEE2E2] text-[#B91C1C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            منتهي
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('valid')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'valid'
                ? 'bg-[#DCFCE7] text-[#166534] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ساري
          </button>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              <tr>
                {/* Columns in exact specified order:
                    1) الاسم
                    2) الرقم المميز
                    3) تاريخ الانتهاء
                    4) رقم الجواز
                    5) الجنسية
                    6) انتهاء الجواز
                    7) الحالة
                    + الإجراءات (Actions) */}
                <th scope="col" className="px-5 py-4 whitespace-nowrap">الاسم</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap">الرقم المميز</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap">تاريخ الانتهاء</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap">رقم الجواز</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap">الجنسية</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap">انتهاء الجواز</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap">الحالة</th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                // Skeleton loading rows
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-32" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-slate-500">
                      <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-base font-bold text-slate-800 mb-1">لا توجد سجلات مطابقة</p>
                      <p className="text-xs text-slate-500 mb-4">
                        {searchTerm
                          ? 'لم يتم العثور على أي نتائج تطابق عبارة البحث الحالية.'
                          : 'لم يتم إضافة أي سجلات بعد في النظام.'}
                      </p>
                      <button
                        type="button"
                        onClick={onAddNew}
                        className="px-4 py-2 bg-[#0F766E] text-white text-xs font-bold rounded-lg hover:bg-teal-800 transition-colors"
                      >
                        + إضافة أول سجل الآن
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => {
                  const fullName = item.full_name || item.name || '—';
                  const uniqueNumExpiry = item.unique_number_expiry_date || item.unique_number_expiry;
                  const passportExpiry = item.passport_expiry_date || item.passport_expiry;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* 1. الاسم */}
                      <td className="px-5 py-4 font-semibold text-slate-900 whitespace-nowrap">
                        {fullName}
                      </td>

                      {/* 2. الرقم المميز */}
                      <td className="px-5 py-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {item.unique_number || '—'}
                      </td>

                      {/* 3. تاريخ الانتهاء (للأرقام المميزة) */}
                      <td className="px-5 py-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatKuwaitDate(uniqueNumExpiry)}
                      </td>

                      {/* 4. رقم الجواز */}
                      <td className="px-5 py-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {item.passport_number || '—'}
                      </td>

                      {/* 5. الجنسية */}
                      <td className="px-5 py-4 text-slate-700 whitespace-nowrap">
                        {item.nationality || '—'}
                      </td>

                      {/* 6. انتهاء الجواز */}
                      <td className="px-5 py-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatKuwaitDate(passportExpiry)}
                      </td>

                      {/* 7. الحالة (Chips for both Unique Number and Passport with days left) */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 items-start">
                          <StatusChip
                            label="الرقم المميز"
                            status={item.unique_number_status}
                            daysLeft={item.unique_number_days_left}
                          />
                          <StatusChip
                            label="الجواز"
                            status={item.passport_status}
                            daysLeft={item.passport_days_left}
                          />
                        </div>
                      </td>

                      {/* Actions: تعديل and حذف (حذف visible only to admin) */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEdit(item.id)}
                            title="تعديل السجل"
                            className="p-2 text-slate-600 hover:text-[#0F766E] hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              title="حذف السجل (صلاحية مدير النظام)"
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div>
            إجمالي السجلات المعروضة:{' '}
            <span className="font-mono tabular-nums font-bold text-slate-700">
              {filteredRecords.length}
            </span>{' '}
            من أصل{' '}
            <span className="font-mono tabular-nums font-bold text-slate-700">
              {records.length}
            </span>
          </div>
          <div className="text-slate-400 text-[11px]">
            مرتبة تلقائياً حسب تاريخ الانتهاء الأقرب
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="تأكيد حذف السجل"
        message={`هل أنت متأكد من رغبتك في حذف سجل "${deleteTarget?.full_name || deleteTarget?.name || ''}" بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف السجل"
        cancelLabel="إلغاء"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

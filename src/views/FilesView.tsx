/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderOpen,
  Upload,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  Clock,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  FileText,
  X,
  Copy,
  Check,
  Bell,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ExpiryStatus, ManagedFileItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { formatKuwaitDate, toInputDateFormat, isPassportExpiryValid } from '../utils/date';
import { translateErrorMessage } from '../utils/errors';
import { StatusChip } from '../components/StatusChip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { computeKuwaitDaysLeft } from '../utils/deviceNotifications';
import { triggerAutomaticExpiryCheck } from '../utils/autoAlertTrigger';
import { compressImageIfNeeded } from '../utils/imageCompress';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const MANAGED_FILES_SQL = `create table if not exists public.managed_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text null,
  storage_path text not null,
  issue_date date not null,
  expiry_date date not null,
  notes text null,
  notified_for_expiry date null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.managed_files
  add column if not exists file_type text null;

alter table public.managed_files enable row level security;

create policy "Authenticated users can view managed_files"
  on public.managed_files for select
  to authenticated using (true);

create policy "Authenticated users can insert managed_files"
  on public.managed_files for insert
  to authenticated with check (true);

create policy "Authenticated users can update managed_files"
  on public.managed_files for update
  to authenticated using (true);

create policy "Authenticated users can delete managed_files"
  on public.managed_files for delete
  to authenticated using (true);`;

const ALTER_FILE_TYPE_SQL = `alter table public.managed_files
  add column if not exists file_type text null;`;

const SUGGESTED_FILE_TYPES_AR = [
  'رخصة تجارية',
  'عقد إيجار',
  'شهادة',
  'وثيقة تأمين',
  'اعتماد توقيع',
  'مستند رسمي',
];

const SUGGESTED_FILE_TYPES_EN = [
  'Trade License',
  'Lease Contract',
  'Certificate',
  'Insurance Policy',
  'Signatory Auth',
  'Official Document',
];

export const FilesView: React.FC = () => {
  const { isAdmin } = useAuth();
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  const [files, setFiles] = useState<ManagedFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [missingFileTypeColumn, setMissingFileTypeColumn] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring_soon' | 'expired' | 'valid'>('all');

  // Form Modal State
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ManagedFileItem | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete & Preview State
  const [deleteTarget, setDeleteTarget] = useState<ManagedFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<{ title: string; storagePath: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissingTable(false);
    try {
      const { data, error: fetchErr } = await supabase
        .from('managed_files')
        .select('*')
        .order('expiry_date', { ascending: true });

      if (fetchErr) {
        const msg = (fetchErr.message || '').toLowerCase();
        const code = (fetchErr as { code?: string }).code || '';
        if (
          code === '42P01' ||
          code === 'PGRST205' ||
          msg.includes('managed_files') && (msg.includes('does not exist') || msg.includes('schema cache'))
        ) {
          setMissingTable(true);
        } else {
          setError(translateErrorMessage(fetchErr, lang));
        }
      } else {
        setFiles((data as ManagedFileItem[]) || []);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const getFileStatus = (expiry: string): { status: ExpiryStatus; daysLeft: number | null } => {
    const days = computeKuwaitDaysLeft(expiry);
    if (days === null) return { status: 'valid', daysLeft: null };
    if (days < 0) return { status: 'expired', daysLeft: days };
    if (days <= 30) return { status: 'expiring_soon', daysLeft: days };
    return { status: 'valid', daysLeft: days };
  };

  const metrics = useMemo(() => {
    let expiringSoon = 0;
    let expired = 0;
    for (const f of files) {
      const { status } = getFileStatus(f.expiry_date);
      if (status === 'expiring_soon') expiringSoon++;
      else if (status === 'expired') expired++;
    }
    return {
      total: files.length,
      expiringSoon,
      expired,
    };
  }, [files]);

  const availableFileTypes = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      if (f.file_type && f.file_type.trim()) {
        set.add(f.file_type.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, isAr ? 'ar' : 'en'));
  }, [files, isAr]);

  const filteredFiles = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    return files
      .filter((item) => {
        const nameMatch = (item.file_name || '').toLowerCase().includes(query);
        const typeMatch = (item.file_type || '').toLowerCase().includes(query);
        const notesMatch = (item.notes || '').toLowerCase().includes(query);
        if (query && !nameMatch && !typeMatch && !notesMatch) return false;

        if (fileTypeFilter !== 'all' && (item.file_type || '').trim() !== fileTypeFilter) {
          return false;
        }

        if (statusFilter === 'all') return true;
        const { status } = getFileStatus(item.expiry_date);
        return status === statusFilter;
      })
      .sort((a, b) => {
        const da = computeKuwaitDaysLeft(a.expiry_date) ?? 999999;
        const db = computeKuwaitDaysLeft(b.expiry_date) ?? 999999;
        return da - db;
      });
  }, [files, searchTerm, fileTypeFilter, statusFilter]);

  const openNewForm = () => {
    setEditingItem(null);
    setFileName('');
    setFileType('');
    setIssueDate('');
    setExpiryDate('');
    setNotes('');
    setSelectedFile(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (item: ManagedFileItem) => {
    setEditingItem(item);
    setFileName(item.file_name || '');
    setFileType(item.file_type || '');
    setIssueDate(toInputDateFormat(item.issue_date));
    setExpiryDate(toInputDateFormat(item.expiry_date));
    setNotes(item.notes || '');
    setSelectedFile(null);
    setFormError(null);
    setFormOpen(true);
  };

  const handleFileInput = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setFormError(
        isAr
          ? `حجم الملف (${file.name}) يتجاوز الحد الأقصى المسموح به (10 ميجابايت).`
          : `File (${file.name}) exceeds the 10 MB size limit.`
      );
      return;
    }
    setFormError(null);
    setSelectedFile(file);
    if (!fileName.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setFileName(baseName);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fileName.trim()) {
      setFormError(isAr ? 'يرجى كتابة اسم المستند.' : 'Please enter the document name.');
      return;
    }
    if (!editingItem && !selectedFile) {
      setFormError(isAr ? 'يرجى اختيار ملف لرفعه.' : 'Please select a file to upload.');
      return;
    }
    if (!issueDate) {
      setFormError(
        isAr ? 'يرجى تحديد تاريخ الإصدار.' : 'Please select the issue date.'
      );
      return;
    }
    if (!expiryDate) {
      setFormError(isAr ? 'يرجى تحديد تاريخ الانتهاء.' : 'Please select the expiry date.');
      return;
    }
    if (!isPassportExpiryValid(issueDate, expiryDate)) {
      setFormError(
        isAr
          ? 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.'
          : 'Expiry date must be strictly after the issue date.'
      );
      return;
    }

    setSaving(true);
    try {
      const targetId = editingItem?.id || crypto.randomUUID();
      let storagePath = editingItem?.storage_path || '';

      if (selectedFile) {
        const optimizedFile = await compressImageIfNeeded(selectedFile);
        const ext = optimizedFile.name.split('.').pop()?.toLowerCase() || 'pdf';
        const uploadPath = `company-files/${targetId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(uploadPath, optimizedFile, {
            upsert: true,
            contentType: optimizedFile.type || 'application/octet-stream',
          });

        if (uploadErr) {
          throw new Error(
            isAr
              ? `فشل رفع الملف: ${uploadErr.message}`
              : `Failed to upload file: ${uploadErr.message}`
          );
        }
        storagePath = uploadPath;
      }

      const nowIso = new Date().toISOString();
      const payload = {
        id: targetId,
        file_name: fileName.trim(),
        file_type: fileType.trim() || null,
        storage_path: storagePath,
        issue_date: issueDate,
        expiry_date: expiryDate,
        notes: notes.trim() || null,
        // Reset notified_for_expiry if expiry date changed
        notified_for_expiry:
          editingItem && toInputDateFormat(editingItem.expiry_date) === expiryDate
            ? editingItem.notified_for_expiry || null
            : null,
        updated_at: nowIso,
      };

      const isMissingColErr = (errObj: any) => {
        const msg = (errObj?.message || '').toLowerCase();
        const code = errObj?.code || '';
        return (
          (code === 'PGRST204' || code === '42703') ||
          (msg.includes('file_type') && (msg.includes('column') || msg.includes('schema cache')))
        );
      };

      if (editingItem) {
        const { error: updateErr } = await supabase
          .from('managed_files')
          .update(payload)
          .eq('id', targetId);
        if (updateErr) {
          if (isMissingColErr(updateErr)) {
            setMissingFileTypeColumn(true);
            throw new Error(
              isAr
                ? 'يرجى تنفيذ كود إضافة عمود (نوع الملف) في Supabase SQL Editor أولاً (يظهر أعلى الصفحة).'
                : 'Please run the ALTER TABLE SQL to add the file_type column in Supabase SQL Editor first.'
            );
          }
          throw updateErr;
        }
      } else {
        const { error: insertErr } = await supabase.from('managed_files').insert({
          ...payload,
          created_at: nowIso,
        });
        if (insertErr) {
          if (isMissingColErr(insertErr)) {
            setMissingFileTypeColumn(true);
            throw new Error(
              isAr
                ? 'يرجى تنفيذ كود إضافة عمود (نوع الملف) في Supabase SQL Editor أولاً (يظهر أعلى الصفحة).'
                : 'Please run the ALTER TABLE SQL to add the file_type column in Supabase SQL Editor first.'
            );
          }
          throw insertErr;
        }
      }

      setMissingFileTypeColumn(false);

      // Update local state immediately for snappy UX
      const savedRow: ManagedFileItem = {
        ...payload,
        created_at: editingItem?.created_at || nowIso,
      };
      setFiles((prev) =>
        editingItem
          ? prev.map((f) => (f.id === targetId ? savedRow : f))
          : [...prev, savedRow]
      );

      const is30DaysLeft = computeKuwaitDaysLeft(expiryDate) === 30;
      if (is30DaysLeft) {
        void triggerAutomaticExpiryCheck({ lang, forceCheck: true });
      }

      setFormOpen(false);
      setToastMessage(
        (editingItem
          ? isAr
            ? 'تم تحديث بيانات المستند بنجاح.'
            : 'Document updated successfully.'
          : isAr
          ? 'تم رفع وحفظ المستند بنجاح.'
          : 'Document uploaded and saved successfully.') +
          (is30DaysLeft
            ? isAr
              ? ' (سيتم إرسال تنبيه التجديد في الخلفية)'
              : ' (Renewal alert triggered in background)'
            : '')
      );
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setFormError(translateErrorMessage(err, lang));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('managed_files')
        .delete()
        .eq('id', deleteTarget.id);

      if (delErr) throw delErr;

      if (deleteTarget.storage_path) {
        await supabase.storage.from('documents').remove([deleteTarget.storage_path]);
      }

      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      setToastMessage(isAr ? 'تم حذف الملف بنجاح.' : 'File deleted successfully.');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setError(translateErrorMessage(err, lang));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCopySql = (sqlText: string = MANAGED_FILES_SQL) => {
    navigator.clipboard?.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Success Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 start-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-800 text-white rounded-xl shadow-lg border border-emerald-700 text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <FolderOpen className="w-6 h-6 text-[#0F766E] dark:text-teal-400" />
            <span>{isAr ? 'إدارة المستندات والملفات' : 'Documents & Renewal Alerts'}</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'ارفع مستنداتك مع تحديد نوع الملف وتاريخ الإصدار وتاريخ الانتهاء، وسيتم تنبيهك تلقائياً على البريد الإلكتروني قبل الانتهاء بشهر لتجديد المستند.'
              : 'Upload documents with file type, issue & expiry dates to receive automatic email renewal reminders 1 month before expiration.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchFiles}
            disabled={loading}
            className="flex items-center gap-2 min-h-[44px] px-3.5 py-2 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-sm transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0F766E] dark:text-teal-400' : ''}`} />
            <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>

          {!missingTable && (
            <button
              type="button"
              onClick={openNewForm}
              className="flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>{isAr ? 'رفع مستند جديد' : 'Upload New Document'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Missing Table Setup Helper (only shown if managed_files does not exist in Supabase) */}
      {missingTable && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-6 space-y-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-base font-bold text-amber-950 dark:text-amber-100">
                {isAr
                  ? 'مطلوب تفعيل جدول المستندات (managed_files) في Supabase مرة واحدة فقط'
                  : 'One-time Supabase Table Setup Required (managed_files)'}
              </h3>
              <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                {isAr
                  ? 'انسخ كود SQL التالي ونفذه في Supabase SQL Editor لتفعيل حفظ المستند ونوع الملف وتاريخ الإصدار وتاريخ الانتهاء:'
                  : 'Copy and run the SQL below in your Supabase SQL Editor to enable document storage tracking:'}
              </p>
            </div>
          </div>

          <div className="relative">
            <pre
              dir="ltr"
              className="p-4 rounded-xl bg-slate-900 text-emerald-300 text-xs font-mono overflow-x-auto leading-relaxed"
            >
              {MANAGED_FILES_SQL}
            </pre>
            <button
              type="button"
              onClick={() => handleCopySql(MANAGED_FILES_SQL)}
              className="absolute top-3 end-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الكود' : 'Copy SQL'}</span>
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={fetchFiles}
              className="px-4 py-2 bg-[#0F766E] hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              {isAr ? 'تم التنفيذ — إعادة التحقق' : 'Done — Re-check'}
            </button>
          </div>
        </div>
      )}

      {/* Missing file_type column helper if table was created earlier without it */}
      {!missingTable && missingFileTypeColumn && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                {isAr
                  ? 'مطلوب إضافة عمود (نوع الملف) لجدول managed_files'
                  : 'Add file_type column to managed_files table'}
              </h3>
              <p className="text-xs text-amber-900 dark:text-amber-200">
                {isAr
                  ? 'نفّذ الأمر التالي في Supabase SQL Editor لإضافة حقل نوع الملف:'
                  : 'Run this snippet in Supabase SQL Editor to add the file_type column:'}
              </p>
            </div>
          </div>
          <div className="relative">
            <pre
              dir="ltr"
              className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 text-xs font-mono overflow-x-auto"
            >
              {ALTER_FILE_TYPE_SQL}
            </pre>
            <button
              type="button"
              onClick={() => handleCopySql(ALTER_FILE_TYPE_SQL)}
              className="absolute top-2.5 end-2.5 flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[#FEE2E2] dark:bg-red-950/60 border border-[#FECACA] dark:border-red-800 rounded-xl text-sm text-red-900 dark:text-red-200">
          <AlertTriangle className="w-5 h-5 text-[#B91C1C] dark:text-red-400 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button
            type="button"
            onClick={fetchFiles}
            className="text-xs font-bold underline hover:no-underline cursor-pointer"
          >
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          onClick={() => setStatusFilter('all')}
          className={`p-5 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs cursor-pointer hover:border-teal-500 transition-all ${
            statusFilter === 'all' ? 'ring-2 ring-[#0F766E]' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-teal-900 dark:text-teal-300 bg-teal-100 dark:bg-teal-950/70 px-2.5 py-1 rounded-md">
              {isAr ? 'جميع الملفات' : 'All Files'}
            </span>
            <div className="p-2.5 bg-teal-50 dark:bg-teal-950/60 text-[#0F766E] dark:text-teal-400 rounded-xl">
              <FolderOpen className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
            {isAr ? 'إجمالي الملفات المرفوعة' : 'Total Uploaded Files'}
          </p>
          <span className="text-3xl font-extrabold text-[#0F766E] dark:text-teal-400 font-mono tabular-nums">
            {metrics.total}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter((curr) => (curr === 'expiring_soon' ? 'all' : 'expiring_soon'))}
          className={`p-5 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs cursor-pointer hover:border-amber-400 transition-all ${
            statusFilter === 'expiring_soon' ? 'ring-2 ring-amber-500' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-300 bg-[#FEF3C7] dark:bg-amber-950/70 px-2.5 py-1 rounded-md">
              {isAr ? 'تنبيه قبل شهر' : 'Within 30 Days'}
            </span>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
            {isAr ? 'ملفات تحتاج تجديداً قريباً' : 'Files Needing Renewal'}
          </p>
          <span className="text-3xl font-extrabold text-amber-800 dark:text-amber-400 font-mono tabular-nums">
            {metrics.expiringSoon}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter((curr) => (curr === 'expired' ? 'all' : 'expired'))}
          className={`p-5 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs cursor-pointer hover:border-red-400 transition-all ${
            statusFilter === 'expired' ? 'ring-2 ring-red-500' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#B91C1C] dark:text-red-300 bg-[#FEE2E2] dark:bg-red-950/70 px-2.5 py-1 rounded-md">
              {isAr ? 'منتهية الصلاحية' : 'Expired'}
            </span>
            <div className="p-2.5 bg-red-50 dark:bg-red-950/60 text-[#B91C1C] dark:text-red-400 rounded-xl">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
            {isAr ? 'ملفات منتهية بالفعل' : 'Already Expired Files'}
          </p>
          <span className="text-3xl font-extrabold text-[#B91C1C] dark:text-red-400 font-mono tabular-nums">
            {metrics.expired}
          </span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] p-4 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isAr ? 'بحث بالمستند، نوع الملف، أو الملاحظات...' : 'Search by document, file type, or notes...'
              }
              className="w-full min-h-[44px] ps-10 pe-9 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] cursor-pointer"
          >
            <option value="all">{isAr ? 'كل أنواع الملفات' : 'All File Types'}</option>
            {availableFileTypes.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {typeOption}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {isAr ? `الكل (${files.length})` : `All (${files.length})`}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expiring_soon')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === 'expiring_soon'
                ? 'bg-[#FEF3C7] dark:bg-amber-950/80 text-[#92400E] dark:text-amber-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {isAr ? 'ينتهي قريباً' : 'Expiring Soon'}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === 'expired'
                ? 'bg-[#FEE2E2] dark:bg-red-950/80 text-[#B91C1C] dark:text-red-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {isAr ? 'منتهي' : 'Expired'}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('valid')}
            className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === 'valid'
                ? 'bg-[#DCFCE7] dark:bg-emerald-950/80 text-[#166534] dark:text-emerald-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {isAr ? 'ساري' : 'Valid'}
          </button>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
              <tr>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'المستند' : 'Document'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'نوع الملف' : 'File Type'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'الحالة' : 'Status'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-start">
                  {isAr ? 'تنبيه التجديد (قبل شهر)' : '30-Day Renewal Alert'}
                </th>
                <th scope="col" className="px-5 py-4 whitespace-nowrap text-center">
                  {isAr ? 'الإجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-40" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-slate-500 dark:text-slate-400">
                      <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                      <p className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                        {isAr ? 'لا توجد مستندات مطابقة' : 'No matching documents'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {searchTerm || fileTypeFilter !== 'all'
                          ? isAr
                            ? 'جرب تعديل عبارة البحث أو الفلتر.'
                            : 'Try adjusting your search or filter.'
                          : isAr
                          ? 'ابدأ برفع أول مستند مع تحديد نوع الملف وتاريخ الإصدار وتاريخ الانتهاء ليتم تنبيهك قبل انتهائه بشهر.'
                          : 'Upload your first document with file type, issue and expiry dates to get notified 1 month early.'}
                      </p>
                      {!missingTable && (
                        <button
                          type="button"
                          onClick={openNewForm}
                          className="px-4 py-2 bg-[#0F766E] text-white text-xs font-bold rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
                        >
                          {isAr ? '+ رفع أول مستند الآن' : '+ Upload First Document'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFiles.map((item) => {
                  const { status, daysLeft } = getFileStatus(item.expiry_date);
                  const alertAlreadySent =
                    Boolean(item.notified_for_expiry) &&
                    toInputDateFormat(item.notified_for_expiry) === toInputDateFormat(item.expiry_date);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => openEditForm(item)}
                      title={isAr ? 'اضغط لفتح وتعديل بيانات المستند' : 'Click to open document details'}
                      className="hover:bg-teal-50/40 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-[#0F766E] dark:text-teal-400 shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {item.file_name}
                            </div>
                            {item.notes && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                {item.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {item.file_type ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 dark:bg-teal-950/60 text-[#0F766E] dark:text-teal-300 border border-teal-200/70 dark:border-teal-800">
                            {item.file_type}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatKuwaitDate(item.issue_date)}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {formatKuwaitDate(item.expiry_date)}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusChip
                          label={isAr ? 'الصلاحية' : 'Validity'}
                          status={status}
                          daysLeft={daysLeft}
                        />
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {alertAlreadySent ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isAr ? 'تم إرسال تنبيه التجديد' : 'Renewal Alert Sent'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            <Bell className="w-3.5 h-3.5 text-[#0F766E] dark:text-teal-400" />
                            <span>{isAr ? 'مجدول قبل الانتهاء بشهر' : 'Scheduled 30d Prior'}</span>
                          </span>
                        )}
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
                              setPreviewTarget({
                                title: item.file_name,
                                storagePath: item.storage_path,
                              });
                            }}
                            title={isAr ? 'معاينة / تحميل المستند' : 'Preview / Download'}
                            className="p-2 text-slate-600 dark:text-slate-400 hover:text-[#0F766E] dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditForm(item);
                            }}
                            title={isAr ? 'تعديل المستند' : 'Edit Document'}
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
                              title={isAr ? 'حذف المستند' : 'Delete Document'}
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
      </div>

      {/* Upload / Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Upload className="w-5 h-5 text-[#0F766E] dark:text-teal-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingItem
                    ? isAr
                      ? 'تعديل بيانات المستند'
                      : 'Edit Document Details'
                    : isAr
                    ? 'رفع وإضافة مستند جديد'
                    : 'Upload & Name New Document'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2.5 p-3 bg-[#FEE2E2] dark:bg-red-950/60 border border-[#FECACA] dark:border-red-800 rounded-xl text-xs font-semibold text-red-900 dark:text-red-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {isAr ? 'المستند *' : 'Document *'}
                </label>
                <input
                  type="text"
                  required
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder={isAr ? 'مثال: رخصة تجارية / عقد إيجار المكتب' : 'e.g. Trade License / Office Lease'}
                  className="w-full min-h-[42px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {isAr ? 'نوع الملف' : 'File Type'}
                </label>
                <input
                  type="text"
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اكتب أو اختر نوع الملف (مثال: رخصة، عقد، تأمين...)'
                      : 'Enter or select file type (e.g. License, Contract...)'
                  }
                  className="w-full min-h-[42px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(isAr ? SUGGESTED_FILE_TYPES_AR : SUGGESTED_FILE_TYPES_EN).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFileType(preset)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                        fileType === preset
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {editingItem
                    ? isAr
                      ? 'استبدال الملف المرفق (اختياري)'
                      : 'Replace Attached File (Optional)'
                    : isAr
                    ? 'إرفاق الملف *'
                    : 'Attach File *'}
                </label>
                <label className="flex flex-col items-center justify-center gap-1.5 p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:border-[#0F766E] dark:hover:border-teal-500 transition-colors cursor-pointer text-center">
                  <Upload className="w-6 h-6 text-[#0F766E] dark:text-teal-400" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {selectedFile
                      ? selectedFile.name
                      : editingItem
                      ? isAr
                        ? 'اضغط لاختيار ملف جديد إذا أردت استبدال الحالي'
                        : 'Click to pick a new file to replace the current one'
                      : isAr
                      ? 'اضغط لاختيار ملف (PDF، صورة، Word، Excel... حتى 10 ميجابايت)'
                      : 'Click to select a file (PDF, Image, Word, Excel up to 10 MB)'}
                  </span>
                  <input
                    type="file"
                    onChange={(e) => handleFileInput(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    {isAr ? 'تاريخ الإصدار *' : 'Issue Date *'}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    {isAr ? 'تاريخ الانتهاء *' : 'Expiry Date *'}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {isAr ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isAr ? 'أي تفاصيل إضافية عن المستند...' : 'Any extra details...'}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 min-h-[42px] px-5 py-2 bg-[#0F766E] hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4" />
                      <span>{editingItem ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : isAr ? 'حفظ ورفع المستند' : 'Save & Upload'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <DocumentPreviewModal
        isOpen={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        title={previewTarget?.title || ''}
        storagePath={previewTarget?.storagePath}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={isAr ? 'تأكيد حذف المستند' : 'Confirm Delete Document'}
        message={
          isAr
            ? `هل أنت متأكد من حذف المستند "${deleteTarget?.file_name || ''}" بشكل نهائي؟`
            : `Are you sure you want to permanently delete "${deleteTarget?.file_name || ''}"?`
        }
        confirmLabel={isAr ? 'حذف المستند' : 'Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

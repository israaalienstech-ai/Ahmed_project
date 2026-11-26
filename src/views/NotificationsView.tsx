/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  RefreshCw,
  FileBarChart2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileSpreadsheet,
  MessageCircle,
  User,
  Search,
  Filter,
  X,
  Plus,
  Copy,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { NotificationLogItem } from '../types';
import { formatKuwaitDate } from '../utils/date';
import { translateErrorMessage } from '../utils/errors';
import { QuickReportModal } from '../components/QuickReportModal';

export const NotificationsView: React.FC = () => {
  const { isAdmin, companyName } = useAuth();
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quickReportOpen, setQuickReportOpen] = useState(false);
  const [emailsModalOpen, setEmailsModalOpen] = useState(false);

  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [logChannelFilter, setLogChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all');

  // Additional Email Recipients state (stored in settings.alert_emails)
  const [settingsRowId, setSettingsRowId] = useState<string | null>(null);
  const [alertEmails, setAlertEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [savingEmails, setSavingEmails] = useState(false);
  const [emailsFeedback, setEmailsFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [missingAlertEmailsCol, setMissingAlertEmailsCol] = useState(false);
  const [copiedEmailsSql, setCopiedEmailsSql] = useState(false);

  const ALERT_EMAILS_SQL = `alter table public.settings
  add column if not exists alert_emails text[] not null default '{}';`;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('notifications_log')
        .select(
          `
          id,
          record_id,
          kind,
          channel,
          target_expiry,
          status,
          error,
          sent_at,
          records (
            id,
            full_name,
            name,
            unique_number,
            passport_number
          )
        `
        )
        .order('sent_at', { ascending: false });

      if (fetchErr) {
        console.warn('notifications_log fetch error:', fetchErr);
        setError(translateErrorMessage(fetchErr, lang));
      } else {
        setLogs((data as unknown as NotificationLogItem[]) || []);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  const fetchAlertEmails = useCallback(async () => {
    try {
      const { data, error: settingsErr } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (settingsErr) {
        console.warn('settings fetch error:', settingsErr);
        return;
      }

      if (data) {
        if (data.id) setSettingsRowId(String(data.id));
        const raw = (data as Record<string, unknown>).alert_emails;
        if (raw === undefined) {
          // Column might exist as null or not exist in schema
          if (!('alert_emails' in (data as Record<string, unknown>))) {
            setMissingAlertEmailsCol(true);
          }
          setAlertEmails([]);
        } else {
          setMissingAlertEmailsCol(false);
          const parsed = Array.isArray(raw)
            ? raw.map((e) => String(e).trim()).filter(Boolean)
            : String(raw || '')
                .split(/[;,\s]+/)
                .map((e) => e.trim())
                .filter(Boolean);
          setAlertEmails(parsed);
        }
      }
    } catch (err) {
      console.warn('Failed to load alert_emails:', err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchAlertEmails();
  }, [fetchLogs, fetchAlertEmails]);

  const persistAlertEmails = async (nextList: string[]) => {
    setSavingEmails(true);
    setEmailsFeedback(null);
    try {
      const writeRow = async (value: string[] | string) => {
        if (settingsRowId) {
          return supabase
            .from('settings')
            .update({ alert_emails: value })
            .eq('id', settingsRowId);
        }
        return supabase
          .from('settings')
          .insert({
            company_name: companyName || 'Al-Muhallab',
            alert_emails: value,
          })
          .select('id')
          .maybeSingle();
      };

      let res = await writeRow(nextList);

      // Fallback if alert_emails column in DB is text instead of text[]
      if (
        res.error &&
        String(res.error.message || '').toLowerCase().includes('malformed array literal')
      ) {
        res = await writeRow(nextList.join(', '));
      }

      if (res.error) {
        const msg = String(res.error.message || '').toLowerCase();
        const code = (res.error as { code?: string }).code || '';
        if (
          code === '42703' ||
          code === 'PGRST204' ||
          (msg.includes('alert_emails') && (msg.includes('column') || msg.includes('schema cache')))
        ) {
          setMissingAlertEmailsCol(true);
          setEmailsFeedback({
            type: 'error',
            text: isAr
              ? 'يرجى تنفيذ كود SQL الظاهر أدناه في Supabase SQL Editor لتفعيل حفظ قائمة الإيميلات.'
              : 'Please run the SQL below in Supabase SQL Editor to enable saving recipient emails.',
          });
          return false;
        }
        throw res.error;
      }

      if (!settingsRowId && res.data && typeof res.data === 'object' && 'id' in res.data) {
        setSettingsRowId(String((res.data as { id: string }).id));
      }

      setMissingAlertEmailsCol(false);
      setAlertEmails(nextList);
      setEmailsFeedback({
        type: 'success',
        text: isAr
          ? 'تم تحديث قائمة مستلمي البريد بنجاح.'
          : 'Recipient email list updated successfully.',
      });
      return true;
    } catch (err: any) {
      setEmailsFeedback({
        type: 'error',
        text: translateErrorMessage(err, lang),
      });
      return false;
    } finally {
      setSavingEmails(false);
    }
  };

  const handleAddRecipientEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailsFeedback(null);
    const candidates = newEmailInput
      .split(/[;,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (candidates.length === 0) {
      setEmailsFeedback({
        type: 'error',
        text: isAr ? 'يرجى إدخال عنوان بريد إلكتروني صحيح.' : 'Please enter a valid email address.',
      });
      return;
    }

    const invalid = candidates.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalid) {
      setEmailsFeedback({
        type: 'error',
        text: isAr
          ? `صيغة البريد الإلكتروني غير صحيحة: ${invalid}`
          : `Invalid email address: ${invalid}`,
      });
      return;
    }

    const existingLower = new Set(alertEmails.map((em) => em.toLowerCase()));
    const toAdd = candidates.filter((em) => !existingLower.has(em.toLowerCase()));
    if (toAdd.length === 0) {
      setEmailsFeedback({
        type: 'error',
        text: isAr ? 'هذا البريد مضاف بالفعل في القائمة.' : 'This email is already in the list.',
      });
      return;
    }

    const ok = await persistAlertEmails([...alertEmails, ...toAdd]);
    if (ok) {
      setNewEmailInput('');
    }
  };

  const handleRemoveRecipientEmail = async (emailToRemove: string) => {
    const nextList = alertEmails.filter(
      (em) => em.toLowerCase() !== emailToRemove.toLowerCase()
    );
    await persistAlertEmails(nextList);
  };



  const filteredLogs = React.useMemo(() => {
    const query = logSearchTerm.toLowerCase().trim();
    return logs.filter((log) => {
      if (logStatusFilter !== 'all' && log.status !== logStatusFilter) return false;
      if (logChannelFilter !== 'all' && log.channel !== logChannelFilter) return false;
      if (!query) return true;

      const personName = (log.records?.full_name || log.records?.name || '').toLowerCase();
      const civilId = (log.records?.unique_number || '').toLowerCase();
      const passportNum = (log.records?.passport_number || '').toLowerCase();
      const errorText = (log.error || '').toLowerCase();

      return (
        personName.includes(query) ||
        civilId.includes(query) ||
        passportNum.includes(query) ||
        errorText.includes(query)
      );
    });
  }, [logs, logSearchTerm, logStatusFilter, logChannelFilter]);

  const emailStatusSummary = React.useMemo(() => {
    const emailLogs = logs.filter((l) => l.channel === 'email');
    const sentCount = emailLogs.filter((l) => l.status === 'sent').length;
    const failedCount = emailLogs.filter((l) => l.status === 'failed').length;
    const latestEmailLog = emailLogs[0] || null;

    if (latestEmailLog) {
      return {
        state: latestEmailLog.status as 'sent' | 'failed',
        reason:
          latestEmailLog.status === 'failed'
            ? latestEmailLog.error || (isAr ? 'حدث خطأ أثناء إرسال البريد.' : 'Email delivery error.')
            : null,
        sentAt: latestEmailLog.sent_at,
        sentCount,
        failedCount,
      };
    }

    return {
      state: 'idle' as const,
      reason: null,
      sentAt: null,
      sentCount: 0,
      failedCount: 0,
    };
  }, [logs, isAr]);

  return (
    <div className="space-y-6">
      {/* Top Header with Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isAr ? 'التنبيهات' : 'Notifications'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'سجل التنبيهات المرسلة والتقارير السريعة لحالة السجلات'
              : 'Sent notifications log and quick status reports'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 min-h-[44px] px-3.5 py-2 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-sm transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0F766E] dark:text-teal-400' : ''}`} />
            <span className="hidden sm:inline">{isAr ? 'تحديث السجل' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickReportOpen(true)}
            className="flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-bold text-white bg-[#0F766E] hover:bg-teal-800 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileBarChart2 className="w-4 h-4" />
            <span>{isAr ? 'ريبورت سريع' : 'Quick Report'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setEmailsModalOpen(true)}
              className="flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
              title={isAr ? 'إدارة إيميلات مستلمي التنبيهات' : 'Manage alert recipient emails'}
            >
              <Mail className="w-4 h-4 text-[#0F766E] dark:text-teal-400" />
              <span>{isAr ? 'مستلمو البريد' : 'Recipients'}</span>
              {alertEmails.length > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  ({alertEmails.length})
                </span>
              )}
            </button>
          )}

        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[#FEE2E2] dark:bg-red-950/60 border border-[#FECACA] dark:border-red-800 rounded-xl text-sm text-red-900 dark:text-red-200">
          <AlertTriangle className="w-5 h-5 text-[#B91C1C] dark:text-red-400 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button
            type="button"
            onClick={fetchLogs}
            className="text-xs font-bold text-red-900 dark:text-red-200 underline hover:no-underline cursor-pointer"
          >
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {/* Visual Email Delivery Status Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            {emailStatusSummary.state === 'sent' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : emailStatusSummary.state === 'failed' ? (
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            ) : (
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span
              className={`text-xs sm:text-sm font-semibold ${
                emailStatusSummary.state === 'sent'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : emailStatusSummary.state === 'failed'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {emailStatusSummary.state === 'sent'
                ? isAr
                  ? 'حالة البريد الإلكتروني: تم الإرسال بنجاح'
                  : 'Email Status: Sent Successfully'
                : emailStatusSummary.state === 'failed'
                ? isAr
                  ? 'حالة البريد الإلكتروني: فشل الإرسال'
                  : 'Email Status: Failed to Send'
                : isAr
                ? 'حالة البريد الإلكتروني: لا توجد محاولات إرسال مسجلة بعد'
                : 'Email Status: No deliveries recorded yet'}
            </span>
          </div>

          {emailStatusSummary.state === 'failed' && emailStatusSummary.reason && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {isAr ? `— السبب: ${emailStatusSummary.reason}` : `— Reason: ${emailStatusSummary.reason}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 shrink-0">
          {(emailStatusSummary.sentCount > 0 || emailStatusSummary.failedCount > 0) && (
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                {isAr ? `ناجح: ${emailStatusSummary.sentCount}` : `Sent: ${emailStatusSummary.sentCount}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-red-600 dark:text-red-400 font-semibold">
                {isAr ? `فاشل: ${emailStatusSummary.failedCount}` : `Failed: ${emailStatusSummary.failedCount}`}
              </span>
            </div>
          )}
          {emailStatusSummary.sentAt && (
            <span className="text-[11px] font-mono tabular-nums">
              {formatKuwaitDate(emailStatusSummary.sentAt)}
            </span>
          )}
        </div>
      </div>

      {/* Notifications History Table */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'سجل التنبيهات المرسلة' : 'Sent Notifications Log'}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums ms-2">
              ({filteredLogs.length}/{logs.length})
            </span>
          </div>

          {/* Search & Filter Bar for Notifications Log */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative min-w-[230px]">
              <input
                type="text"
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                placeholder={
                  isAr
                    ? 'بحث بالاسم، الرقم المدني، أو الجواز...'
                    : 'Search name, Civil ID, or passport...'
                }
                className="w-full min-h-[38px] ps-9 pe-8 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {logSearchTerm && (
                <button
                  type="button"
                  onClick={() => setLogSearchTerm('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value as 'all' | 'sent' | 'failed')}
                className="min-h-[38px] ps-8 pe-7 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] cursor-pointer"
              >
                <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="sent">{isAr ? 'تم الإرسال' : 'Sent'}</option>
                <option value="failed">{isAr ? 'فشل' : 'Failed'}</option>
              </select>
            </div>

            <select
              value={logChannelFilter}
              onChange={(e) => setLogChannelFilter(e.target.value as 'all' | 'email' | 'whatsapp')}
              className="min-h-[38px] px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] cursor-pointer"
            >
              <option value="all">{isAr ? 'كل القنوات' : 'All Channels'}</option>
              <option value="email">{isAr ? 'بريد إلكتروني' : 'Email'}</option>
              <option value="whatsapp">{isAr ? 'واتساب' : 'WhatsApp'}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
              <tr>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-start">
                  {isAr ? 'وقت الإرسال' : 'Sent At'}
                </th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-start">
                  {isAr ? 'الشخص / الرقم المدني' : 'Person / Civil ID'}
                </th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-start">
                  {isAr ? 'نوع التنبيه' : 'Type'}
                </th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-start">
                  {isAr ? 'القناة' : 'Channel'}
                </th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-start">
                  {isAr ? 'تاريخ الانتهاء' : 'Target Expiry'}
                </th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-start">
                  {isAr ? 'الحالة' : 'Status'}
                </th>
                <th scope="col" className="px-5 py-3.5 text-start">
                  {isAr ? 'التفاصيل / الخطأ' : 'Details / Error'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-40" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-44" /></td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-slate-500 dark:text-slate-400">
                      <FileSpreadsheet className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                        {isAr ? 'لا توجد إشعارات مطابقة' : 'No matching notifications'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {logSearchTerm || logStatusFilter !== 'all' || logChannelFilter !== 'all'
                          ? isAr
                            ? 'جرب تغيير عبارة البحث أو الفلاتر.'
                            : 'Try adjusting your search query or filters.'
                          : isAr
                          ? 'يتم تسجيل الإشعار هنا تلقائياً عند وجود شخص متبقٍ على انتهاء صلاحيته ٣٠ يوماً.'
                          : 'Notifications are recorded automatically when a record has 30 days left before expiry.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSuccess = log.status === 'sent';
                  const personName =
                    log.records?.full_name || log.records?.name || (isAr ? 'سجل محفوظ' : 'Saved Record');
                  const civilId = log.records?.unique_number;

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-5 py-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatKuwaitDate(log.sent_at)}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {personName}
                            </div>
                            {civilId && (
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                {civilId}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {log.kind === 'unique_number'
                          ? isAr
                            ? 'الرقم المدني'
                            : 'Civil ID'
                          : log.kind === 'passport'
                          ? isAr
                            ? 'جواز السفر'
                            : 'Passport'
                          : log.kind}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {log.channel === 'email' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <Mail className="w-3.5 h-3.5 text-[#0F766E] dark:text-teal-400 shrink-0" />
                            <span>{isAr ? 'بريد إلكتروني' : 'Email'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatKuwaitDate(log.target_expiry)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
                              isSuccess
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            {isSuccess ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>
                              {isSuccess ? (isAr ? 'تم الإرسال' : 'Sent') : isAr ? 'فشل الإرسال' : 'Failed'}
                            </span>
                          </span>
                          {!isSuccess && log.error && (
                            <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                              {isAr ? `· ${log.error}` : `· ${log.error}`}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
                        {log.error ? (
                          <span className="text-red-700 dark:text-red-400 font-medium">{log.error}</span>
                        ) : (
                          <span>
                            {isAr
                              ? 'تنبيه قبل انتهاء الصلاحية بـ ٣٠ يوماً'
                              : 'Alert sent 30 days before expiry'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Report Modal */}
      <QuickReportModal
        isOpen={quickReportOpen}
        onClose={() => setQuickReportOpen(false)}
      />

      {/* Alert Email Recipients Modal */}
      {emailsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#0F766E] dark:text-teal-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isAr
                    ? 'إيميلات مستلمي التنبيهات (أكثر من بريد)'
                    : 'Alert Email Recipients'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEmailsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isAr
                  ? 'أضف أي بريد إلكتروني إضافي هنا لتصله رسائل التنبيه تلقائياً مع بريد المسؤول الأساسي.'
                  : 'Add any extra email addresses here so they receive expiry alert emails alongside the primary admin email.'}
              </p>

              {missingAlertEmailsCol && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    {isAr
                      ? 'لتفعيل حفظ أكثر من إيميل، نفّذ هذا الأمر مرة واحدة في Supabase SQL Editor:'
                      : 'To save multiple recipient emails, run this SQL once in Supabase SQL Editor:'}
                  </p>
                  <div className="relative">
                    <pre
                      dir="ltr"
                      className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 text-xs font-mono overflow-x-auto"
                    >
                      {ALERT_EMAILS_SQL}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(ALERT_EMAILS_SQL);
                        setCopiedEmailsSql(true);
                        setTimeout(() => setCopiedEmailsSql(false), 2500);
                      }}
                      className="absolute top-1.5 end-1.5 flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-semibold cursor-pointer"
                    >
                      {copiedEmailsSql ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedEmailsSql ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleAddRecipientEmail} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 min-h-[42px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                />
                <button
                  type="submit"
                  disabled={savingEmails}
                  className="flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 bg-[#0F766E] hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{savingEmails ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'إضافة إيميل' : 'Add Email'}</span>
                </button>
              </form>

              {emailsFeedback && (
                <p
                  className={`text-xs font-semibold ${
                    emailsFeedback.type === 'success'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {emailsFeedback.text}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {alertEmails.length === 0 ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr
                      ? 'لم تتم إضافة إيميلات إضافية بعد (يتم الإرسال حالياً لإيميلات المسؤولين المسجلة).'
                      : 'No extra emails added yet (currently sending to registered admin emails).'}
                  </span>
                ) : (
                  alertEmails.map((em) => (
                    <span
                      key={em}
                      dir="ltr"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                    >
                      <span>{em}</span>
                      <button
                        type="button"
                        disabled={savingEmails}
                        onClick={() => handleRemoveRecipientEmail(em)}
                        title={isAr ? 'حذف الإيميل' : 'Remove email'}
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setEmailsModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

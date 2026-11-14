/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Send,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileSpreadsheet,
  MessageCircle,
  User,
  Bell,
  BellRing,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { NotificationLogItem, RecordItem } from '../types';
import { formatKuwaitDate } from '../utils/date';
import { translateErrorMessage } from '../utils/errors';
import {
  buildExpiryAlertMessage,
  filterExact30DayCivilIdRecords,
  getDeviceNotificationPermission,
  isDeviceNotificationsEnabled,
  requestDeviceNotificationPermission,
  setDeviceNotificationsEnabled,
  showDeviceNotification,
} from '../utils/deviceNotifications';

export const NotificationsView: React.FC = () => {
  const { isAdmin, companyName } = useAuth();
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{
    success: boolean;
    message: string;
    warning?: string;
  } | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [logChannelFilter, setLogChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all');
  const [devicePermission, setDevicePermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getDeviceNotificationPermission()
  );
  const [deviceNotifOn, setDeviceNotifOn] = useState<boolean>(() => isDeviceNotificationsEnabled());
  const [sendingDeviceTest, setSendingDeviceTest] = useState(false);

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

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleTriggerAlerts = async (isDryRun = false) => {
    setTriggering(true);
    setTriggerResult(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('daily-expiry-alerts', {
        body: {
          dry_run: isDryRun,
          force_send: true,
        },
      });

      if (fnErr) {
        throw fnErr;
      }

      if (isDryRun && data?.html_preview) {
        setPreviewHtml(data.html_preview);
        setPreviewModalOpen(true);
      }

      const recipientsList = data?.recipients?.length
        ? ` (${isAr ? 'إلى' : 'To'}: ${data.recipients.join(', ')})`
        : '';

      // Mirror the exact same message as an OS notification on desktop/phone if enabled
      if (!isDryRun && isDeviceNotificationsEnabled() && data?.notification_payload) {
        await showDeviceNotification({
          title: data.notification_payload.title,
          body: data.notification_payload.body,
          url: '/notifications',
          dir: isAr ? 'rtl' : 'ltr',
          lang,
        });
      }

      setTriggerResult({
        success: data?.success ?? true,
        message:
          (data?.message ||
            (isAr ? 'تم فحص وإرسال التنبيه بنجاح.' : 'Alert check and send completed.')) +
          recipientsList,
        warning: data?.warning,
      });

      await fetchLogs();
    } catch (err: any) {
      console.error('Edge Function trigger error:', err);
      setTriggerResult({
        success: false,
        message: translateErrorMessage(err, lang),
      });
    } finally {
      setTriggering(false);
    }
  };

  const handleEnableDeviceNotifications = async () => {
    const perm = await requestDeviceNotificationPermission();
    setDevicePermission(perm);
    const enabled = perm === 'granted';
    setDeviceNotifOn(enabled);
    if (enabled) {
      await handleSendTestDeviceNotification();
    }
  };

  const handleToggleDevicePref = () => {
    const next = !deviceNotifOn;
    setDeviceNotificationsEnabled(next);
    setDeviceNotifOn(next);
  };

  const handleSendTestDeviceNotification = async () => {
    setSendingDeviceTest(true);
    try {
      if (getDeviceNotificationPermission() !== 'granted') {
        const perm = await requestDeviceNotificationPermission();
        setDevicePermission(perm);
        if (perm !== 'granted') {
          setSendingDeviceTest(false);
          return;
        }
        setDeviceNotifOn(true);
      }

      const { data: recs } = await supabase.from('records_with_status').select('*');
      const allRecords = (recs || []) as RecordItem[];
      const exact30 = filterExact30DayCivilIdRecords(allRecords);
      const fallbackUpcoming = allRecords.filter(
        (r) =>
          typeof r.unique_number_days_left === 'number' &&
          r.unique_number_days_left >= 0 &&
          r.unique_number_days_left <= 30
      );

      const targetRecords = exact30.length > 0 ? exact30 : fallbackUpcoming;
      const payload = buildExpiryAlertMessage(targetRecords, companyName || "A'system", lang);
      await showDeviceNotification(payload);
    } finally {
      setSendingDeviceTest(false);
    }
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

  const handlePreviewEmail = async () => {
    setPreviewLoading(true);
    setPreviewModalOpen(true);
    setPreviewHtml(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('daily-expiry-alerts', {
        body: { dry_run: true },
      });

      if (!fnErr && data?.html_preview) {
        setPreviewHtml(data.html_preview);
      } else {
        const { data: recs } = await supabase.from('records_with_status').select('*');
        const records = recs || [];
        const exact30 = records.filter((r: any) => r.unique_number_days_left === 30);
        const upcoming = records.filter(
          (r: any) =>
            typeof r.unique_number_days_left === 'number' &&
            r.unique_number_days_left >= 0 &&
            r.unique_number_days_left <= 30
        );

        const targetList = exact30.length > 0 ? exact30 : upcoming;
        const rowsList = targetList
          .map(
            (r: any) => `
            <li style="padding: 10px 14px; border-bottom: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; color: #0F172A;">${r.full_name || r.name || '—'}</span>
              <span style="font-size: 12px; color: #92400E; background: #FEF3C7; padding: 3px 10px; border-radius: 6px;">
                ${
                  isAr
                    ? `متبقٍ ${r.unique_number_days_left ?? 30} يوماً على انتهاء الرقم المدني`
                    : `${r.unique_number_days_left ?? 30} days left on Civil ID`
                }
              </span>
            </li>
          `
          )
          .join('');

        const fallbackHtml = `
          <div style="font-family: 'IBM Plex Sans Arabic', 'Nunito Sans', Tahoma, sans-serif; direction: ${isAr ? 'rtl' : 'ltr'}; padding: 24px; color: #0F172A;">
            <div style="background: #0B3B38; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 20px;">${companyName || "A'system"}</h2>
              <p style="margin: 6px 0 0; font-size: 13px; color: #A7F3D0;">${
                isAr
                  ? 'الأشخاص المتبقي على انتهاء رقمهم المدني ٣٠ يوماً'
                  : 'People with 30 days left before Civil ID expiry'
              }</p>
            </div>
            ${
              targetList.length > 0
                ? `<ul style="list-style: none; padding: 0; margin: 0; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">${rowsList}</ul>`
                : `<p style="color: #166534; background: #F0FDF4; padding: 14px; border-radius: 8px; border: 1px solid #BBF7D0;">${
                    isAr
                      ? 'لا يوجد أشخاص متبقٍ على انتهاء رقمهم المدني ٣٠ يوماً حالياً.'
                      : 'No people currently have 30 days left before Civil ID expiry.'
                  }</p>`
            }
          </div>
        `;
        setPreviewHtml(fallbackHtml);
      }
    } catch (err: any) {
      setPreviewHtml(
        `<p style="color: red; padding: 20px;">${
          isAr ? 'تعذر تحميل المعاينة:' : 'Failed to load preview:'
        } ${err.message}</p>`
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header with Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isAr ? 'سجل الإشعارات والتنبيهات' : 'Notifications & Email Log'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'سجل التنبيهات المرسلة قبل انتهاء صلاحية الرقم المدني بـ ٣٠ يوماً وحالة الإرسال'
              : 'History of Civil ID alerts sent 30 days before expiry'}
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
            onClick={handlePreviewEmail}
            className="flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-bold text-[#0F766E] dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200 dark:border-teal-800 rounded-xl transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>{isAr ? 'معاينة القالب' : 'Preview Template'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleTriggerAlerts(false)}
              disabled={triggering}
              className="flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              title={isAr ? 'اختبار فحص وإرسال تنبيه ٣٠ يوماً للمسؤولين' : 'Test alert check & send'}
            >
              {triggering ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{isAr ? 'جاري الفحص والإرسال...' : 'Sending...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{isAr ? 'اختبار التنبيه (Test)' : 'Test Alert'}</span>
                </>
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

      {/* Result feedback notification */}
      {triggerResult && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
            triggerResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 border-red-200 dark:border-red-800'
          }`}
        >
          {triggerResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-1">
            <p className="font-bold">{triggerResult.message}</p>
            {triggerResult.warning && <p className="text-xs opacity-90">{triggerResult.warning}</p>}
          </div>
          <button
            type="button"
            onClick={() => setTriggerResult(null)}
            className="text-xs font-bold underline hover:no-underline cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Device Notifications Card (Desktop & Mobile PWA Sync) */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-3 rounded-xl shrink-0 ${
              deviceNotifOn
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-teal-50 dark:bg-teal-950/60 text-[#0F766E] dark:text-teal-400'
            }`}
          >
            {deviceNotifOn ? <BellRing className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr
                  ? 'إشعارات الجهاز (الكمبيوتر والهاتف)'
                  : 'Device Notifications (Desktop & Mobile)'}
              </h3>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  devicePermission === 'unsupported'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    : devicePermission === 'denied'
                    ? 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300'
                    : deviceNotifOn
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                }`}
              >
                {devicePermission === 'unsupported'
                  ? isAr
                    ? 'غير مدعوم في هذا المتصفح'
                    : 'Not Supported'
                  : devicePermission === 'denied'
                  ? isAr
                    ? 'محظور من إعدادات المتصفح'
                    : 'Blocked in Browser'
                  : deviceNotifOn
                  ? isAr
                    ? 'مفعلة ومتزامنة'
                    : 'Active & Synced'
                  : isAr
                  ? 'غير مفعلة'
                  : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {isAr
                ? 'تصلك نفس رسالة البريد الإلكتروني كإشعار مباشر على الكمبيوتر أو الهاتف عند تثبيت التطبيق كأيقونة (على الآيفون: أضفه أولاً للشاشة الرئيسية).'
                : 'Receives the exact same email alert message as a native notification on desktop or phone when installed as an app icon.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {devicePermission !== 'granted' ? (
            <button
              type="button"
              onClick={handleEnableDeviceNotifications}
              disabled={devicePermission === 'unsupported' || devicePermission === 'denied'}
              className="flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-[#0F766E] hover:bg-teal-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <BellRing className="w-4 h-4" />
              <span>{isAr ? 'تفعيل إشعارات الجهاز' : 'Enable Device Alerts'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleToggleDevicePref}
                className={`min-h-[40px] px-3.5 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                  deviceNotifOn
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                }`}
              >
                {deviceNotifOn
                  ? isAr
                    ? 'إيقاف مؤقت'
                    : 'Pause Alerts'
                  : isAr
                  ? 'تشغيل الإشعارات'
                  : 'Resume Alerts'}
              </button>
              <button
                type="button"
                onClick={handleSendTestDeviceNotification}
                disabled={sendingDeviceTest}
                className="flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-bold text-[#0F766E] dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200 dark:border-teal-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <Bell className="w-4 h-4" />
                <span>
                  {sendingDeviceTest
                    ? isAr
                      ? 'جاري الإرسال...'
                      : 'Sending...'
                    : isAr
                    ? 'إرسال نفس الرسالة كإشعار الآن'
                    : 'Send Device Notification Now'}
                </span>
              </button>
            </>
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
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50/80 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-md text-xs font-medium">
                            <Mail className="w-3.5 h-3.5 text-[#0F766E] dark:text-teal-400" />
                            <span>{isAr ? 'بريد إلكتروني' : 'Email'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md text-xs font-medium">
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatKuwaitDate(log.target_expiry)}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
                            isSuccess
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                          )}
                          <span>
                            {isSuccess ? (isAr ? 'تم الإرسال' : 'Sent') : isAr ? 'فشل' : 'Failed'}
                          </span>
                        </span>
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

      {/* Email Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#0F766E] dark:text-teal-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isAr ? 'معاينة قالب البريد الإلكتروني' : 'Email Template Preview'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E] dark:text-teal-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {isAr ? 'جاري تجهيز المعاينة...' : 'Loading preview...'}
                  </p>
                </div>
              ) : previewHtml ? (
                <div
                  className="bg-white rounded-lg shadow-xs overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isAr ? 'لا توجد معاينة متاحة.' : 'No preview available.'}
                </p>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {isAr
                  ? 'القالب مهيأ لتقرير الأشخاص المتبقي على انتهاء رقمهم المدني ٣٠ يوماً.'
                  : 'Template formatted for Civil IDs expiring in 30 days.'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
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

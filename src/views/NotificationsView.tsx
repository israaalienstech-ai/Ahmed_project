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
  Code2,
  Copy,
  Check,
  Calendar,
  XCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { NotificationLogItem } from '../types';
import { formatKuwaitDate } from '../utils/date';
import { translateErrorMessage } from '../utils/errors';

export const NotificationsView: React.FC = () => {
  const { isAdmin, companyName, user } = useAuth();
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Triggering Edge Function
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{
    success: boolean;
    message: string;
    warning?: string;
  } | null>(null);

  // Email Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Edge Function deploy snippet copy state
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('notifications_log')
        .select('*')
        .order('sent_at', { ascending: false });

      if (fetchErr) {
        // Table might be empty or column might differ slightly
        console.warn('notifications_log fetch error:', fetchErr);
        setError(translateErrorMessage(fetchErr));
      } else {
        setLogs(data || []);
      }
    } catch (err: any) {
      setError(translateErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  // Trigger Edge Function
  const handleTriggerAlerts = async (isDryRun = false) => {
    setTriggering(true);
    setTriggerResult(null);

    try {
      // 1. Invoke Supabase Edge Function 'daily-expiry-alerts'
      const { data, error: fnErr } = await supabase.functions.invoke('daily-expiry-alerts', {
        body: {
          dry_run: isDryRun,
          test_email: user?.email,
        },
      });

      if (fnErr) {
        throw fnErr;
      }

      if (isDryRun && data?.html_preview) {
        setPreviewHtml(data.html_preview);
        setPreviewModalOpen(true);
      }

      setTriggerResult({
        success: data?.success ?? true,
        message: data?.message || 'تم تنفيذ دالة التنبيهات بنجاح.',
        warning: data?.warning,
      });

      // Refresh log
      await fetchLogs();
    } catch (err: any) {
      console.error('Edge Function trigger error:', err);
      setTriggerResult({
        success: false,
        message: translateErrorMessage(err),
      });
    } finally {
      setTriggering(false);
    }
  };

  // Preview Email directly
  const handlePreviewEmail = async () => {
    setPreviewLoading(true);
    setPreviewModalOpen(true);
    setPreviewHtml(null);

    try {
      // Try edge function first
      const { data, error: fnErr } = await supabase.functions.invoke('daily-expiry-alerts', {
        body: { dry_run: true },
      });

      if (!fnErr && data?.html_preview) {
        setPreviewHtml(data.html_preview);
      } else {
        // Client fallback preview querying records_with_status
        const { data: recs } = await supabase.from('records_with_status').select('*');
        const records = recs || [];
        const expired = records.filter(
          (r: any) => r.unique_number_status === 'expired' || r.passport_status === 'expired'
        );
        const expiringSoon = records.filter(
          (r: any) =>
            (r.unique_number_status === 'expiring_soon' || r.passport_status === 'expiring_soon') &&
            r.unique_number_status !== 'expired' &&
            r.passport_status !== 'expired'
        );

        const mockHtml = `
          <div style="font-family: 'Cairo', Tahoma, sans-serif; direction: rtl; padding: 24px; color: #0F172A;">
            <div style="background: #0B3B38; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="margin: 0;">${companyName || 'برنامج التنبيه'}</h2>
              <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">تقرير تنبيهات انتهاء الصلاحية اليومي</p>
            </div>
            <p><strong>وثائق منتهية:</strong> ${expired.length}</p>
            <p><strong>وثائق قاربت على الانتهاء:</strong> ${expiringSoon.length}</p>
            <div style="margin-top: 20px; padding: 15px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
              <p style="font-size: 13px; color: #64748B; margin: 0;">هذا نموذج مصغر للمعاينة الحية لقالب البريد الصادر من دالة Edge Function.</p>
            </div>
          </div>
        `;
        setPreviewHtml(mockHtml);
      }
    } catch (err: any) {
      setPreviewHtml(`<p style="color: red; padding: 20px;">تعذر تحميل المعاينة: ${err.message}</p>`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const cronSql = `-- جدول زمني يومي في تمام 8:00 صباحاً بتوقيت الكويت (05:00 UTC)
select cron.schedule(
  'send-daily-expiry-alerts',
  '0 5 * * *',
  $$
  select
    net.http_post(
      url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co/functions/v1/daily-expiry-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);`;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">سجل الإشعارات والتنبيهات اليومية</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            إدارة دالة التنبيهات البريدية (Edge Function) ومراجعة العمليات المسجلة
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 min-h-[44px] px-3.5 py-2 bg-white border border-[#E2E8F0] rounded-xl text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0F766E]' : ''}`} />
            <span className="hidden sm:inline">تحديث السجل</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleTriggerAlerts(false)}
              disabled={triggering}
              className="flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جاري الإرسال...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>إرسال التنبيه الآن للمسؤولين</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Result feedback notification */}
      {triggerResult && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
            triggerResult.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          {triggerResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-1">
            <p className="font-bold">{triggerResult.message}</p>
            {triggerResult.warning && (
              <p className="text-xs opacity-90">{triggerResult.warning}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTriggerResult(null)}
            className="text-xs font-bold underline hover:no-underline"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Admin Edge Function Command Center Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-50 text-[#0F766E] rounded-xl">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                دالة التنبيهات البريدية اليومية (Edge Function: daily-expiry-alerts)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تفحص قاعدة البيانات يومياً وترسل تقريراً مفصلاً باللغة العربية إلى جميع المسؤولين.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviewEmail}
              className="flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-bold text-[#0F766E] bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>معاينة قالب البريد</span>
            </button>
          </div>
        </div>

        {/* Technical deployment instructions banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-[#0F766E]" />
              أمر الجدولة التلقائية اليومية في Supabase SQL Editor (توقيت الكويت 8:00 ص):
            </span>
            <button
              type="button"
              onClick={() => handleCopy(cronSql, 'cron')}
              className="flex items-center gap-1 px-2.5 py-1 text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 font-medium"
            >
              {copiedIndex === 'cron' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ الكود</span>
                </>
              )}
            </button>
          </div>
          <pre
            className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-left font-mono text-[11px] leading-relaxed"
            dir="ltr"
          >
            {cronSql}
          </pre>
        </div>
      </div>

      {/* Notifications History Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900">سجل الإشعارات السابقة</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {logs.length} سجلات
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              <tr>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap">وقت الإرسال</th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap">نوع الإشعار</th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap">المستلم</th>
                <th scope="col" className="px-5 py-3.5 whitespace-nowrap">الحالة</th>
                <th scope="col" className="px-5 py-3.5">الملخص والنتائج</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-36" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-64" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-slate-500">
                      <FileSpreadsheet className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-800 mb-1">لا توجد إشعارات مسجلة بعد</p>
                      <p className="text-xs text-slate-500 mb-3">
                        سيتم تسجيل أي إشعار يتم إرساله تلقائياً أو يدوياً في جدول notifications_log.
                      </p>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleTriggerAlerts(false)}
                          className="px-3.5 py-1.5 bg-[#0F766E] text-white text-xs font-bold rounded-lg hover:bg-teal-800"
                        >
                          إرسال أول تنبيه الآن
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isSuccess = log.status === 'sent' || log.status === 'success' || log.status === 'simulated_success';
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* وقت الإرسال */}
                      <td className="px-5 py-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatKuwaitDate(log.sent_at || log.created_at)}
                      </td>

                      {/* نوع الإشعار */}
                      <td className="px-5 py-4 text-xs font-bold text-slate-800 whitespace-nowrap">
                        {log.notification_type === 'daily_expiry_alert' ? 'تنبيه يومي بالصلاحية' : log.notification_type || 'تنبيه بريدي'}
                      </td>

                      {/* المستلم */}
                      <td className="px-5 py-4 font-mono text-xs text-slate-700 whitespace-nowrap" dir="ltr">
                        {log.recipient_email || 'المسؤولون (Admin)'}
                      </td>

                      {/* الحالة */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
                            isSuccess
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-red-50 text-red-800 border border-red-200'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                          )}
                          <span>{isSuccess ? 'تم الإرسال' : 'فشل'}</span>
                        </span>
                      </td>

                      {/* الملخص */}
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {log.summary || '—'}
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
          <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#0F766E]" />
                <h3 className="text-base font-bold text-slate-900">
                  معاينة قالب البريد الإلكتروني (RTL) الصادر من دالة Edge Function
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-slate-100">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E] mb-2" />
                  <p className="text-sm font-semibold text-slate-600">جاري تجهيز المعاينة...</p>
                </div>
              ) : previewHtml ? (
                <div
                  className="bg-white rounded-lg shadow-xs overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="text-sm text-slate-500">لا توجد معاينة متاحة.</p>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>القالب مهيأ لدعم جميع عملاء البريد مع أرقام وتواريخ منسقة بتوقيت الكويت.</span>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded hover:bg-slate-100 text-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

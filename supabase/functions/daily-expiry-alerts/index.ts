import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const LOGO_URL =
  "https://i.postimg.cc/fT1R1cxn/7ea06fe60f018b2b8b4721ae0ff1b90a-removebg-preview.png";

interface AlertRecord {
  id: string;
  name?: string;
  full_name?: string;
  unique_number: string;
  unique_number_expiry_date?: string;
  unique_number_expiry?: string;
  passport_number: string;
  nationality: string;
  passport_expiry_date?: string;
  passport_expiry?: string;
  uniqueExpiryYmd?: string;
  beforeDateYmd?: string;
  daysLeft?: number;
}

/**
 * Extracts YYYY-MM-DD from an ISO date or timestamp string
 */
function extractYmd(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuwait",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
}

/**
 * Returns today's YYYY-MM-DD date string in Asia/Kuwait timezone
 */
function getTodayKuwaitYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Adds/subtracts calendar days to a YYYY-MM-DD string safely in UTC
 */
function addDaysToYmd(ymd: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Computes (targetYmd - baseYmd) in whole days
 */
function diffDaysYmd(targetYmd: string, baseYmd: string): number {
  const [ty, tm, td] = targetYmd.split("-").map(Number);
  const [by, bm, bd] = baseYmd.split("-").map(Number);
  const tUtc = Date.UTC(ty, tm - 1, td);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((tUtc - bUtc) / 86400000);
}

/**
 * Formats a date string in Asia/Kuwait timezone (DD/MM/YYYY)
 */
function formatDateKuwait(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const ymd = extractYmd(dateStr);
    if (ymd) {
      const [y, m, d] = ymd.split("-");
      return `${d}/${m}/${y}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuwait",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Escapes HTML special characters to prevent HTML injection in email templates
 */
function escapeHtml(value?: string | null): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds a clean, RTL Arabic HTML email template showing the person(s) whose Civil ID expires in 30 days
 */
function buildAlertEmailHtml(params: {
  companyName: string;
  appUrl: string;
  dateStr: string;
  matchedRecords: AlertRecord[];
  isTestFallback?: boolean;
}): string {
  const { companyName, appUrl, dateStr, matchedRecords } = params;
  const safeCompany = escapeHtml(companyName);

  const personRowsHtml = matchedRecords
    .map((r) => {
      const name = escapeHtml(r.full_name || r.name || "—");
      const civilId = escapeHtml(r.unique_number || "—");
      const uExp = formatDateKuwait(r.uniqueExpiryYmd || r.unique_number_expiry_date || r.unique_number_expiry);
      const daysVal = typeof r.daysLeft === "number" ? r.daysLeft : 30;
      const daysLabel =
        daysVal < 0
          ? `منتهي منذ ${Math.abs(daysVal)} يوم`
          : daysVal === 0
          ? "ينتهي اليوم"
          : `متبقٍ ${daysVal} يوم`;

      return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 14px 16px; font-weight: 700; font-size: 15px; color: #0F172A;">${name}</td>
        <td style="padding: 14px 16px; font-family: monospace; font-weight: 600; color: #334155;">${civilId}</td>
        <td style="padding: 14px 16px; font-family: monospace; color: #D97706; font-weight: 700;">${uExp}</td>
        <td style="padding: 14px 16px;">
          <span style="display: inline-block; background-color: #FEF3C7; color: #92400E; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px;">
            ${daysLabel}
          </span>
        </td>
      </tr>
      `;
    })
    .join("");

  return `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تنبيه انتهاء الرقم المدني - ${safeCompany}</title>
    <link href="https://fonts.googleapis.com/css2?family=Momo+Signature&display=swap" rel="stylesheet">
  </head>
  <body style="margin: 0; padding: 0; background-color: #F4F6F8; font-family: 'IBM Plex Sans Arabic', 'Nunito Sans', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #0F172A;">
    <div style="max-width: 680px; margin: 30px auto; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      
      <!-- Header with explicit table spacing between logo and text for all email clients -->
      <div style="background-color: #0B3B38; padding: 26px 30px; color: #FFFFFF; border-bottom: 4px solid #0F766E;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <td width="52" valign="middle" style="width: 52px; vertical-align: middle;">
              <img src="${LOGO_URL}" alt="${safeCompany}" width="52" height="52" style="object-fit: contain; display: block; border: 0;" />
            </td>
            <td width="28" style="width: 28px; min-width: 28px; font-size: 1px; line-height: 1px;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
            <td valign="middle" style="vertical-align: middle;">
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #FFFFFF; line-height: 1.4;">
                <span dir="ltr" style="font-family: 'Momo Signature', 'Nunito Sans', Georgia, serif; font-size: 26px; font-weight: 400; letter-spacing: 0.5px;">${safeCompany}</span>
                &nbsp;&mdash;&nbsp;
                تنبيه انتهاء الرقم المدني
              </h1>
              <p style="margin: 0; font-size: 13px; color: #A7F3D0; line-height: 1.5;">تنبيه بأسماء الأشخاص المتبقي على انتهاء رقمهم المدني ٣٠ يوماً (${dateStr})</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding: 28px;">
        ${
          matchedRecords.length > 0
            ? `
          <p style="margin: 0 0 18px 0; font-size: 15px; font-weight: 600; color: #1E293B;">
            يوجد (${matchedRecords.length}) ${matchedRecords.length === 1 ? "شخص متبقٍ" : "أشخاص متبقٍ"} على انتهاء صلاحية الرقم المدني له ٣٠ يوماً:
          </p>
          <div style="overflow-x: auto; border: 1px solid #E2E8F0; border-radius: 10px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: right;">
              <thead>
                <tr style="background-color: #F8FAFC; color: #475569; font-weight: 700; border-bottom: 1px solid #E2E8F0;">
                  <th style="padding: 12px 16px;">اسم الشخص</th>
                  <th style="padding: 12px 16px;">الرقم المدني</th>
                  <th style="padding: 12px 16px;">تاريخ الانتهاء</th>
                  <th style="padding: 12px 16px;">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                ${personRowsHtml}
              </tbody>
            </table>
          </div>
          `
            : `
          <div style="margin-bottom: 16px; padding: 18px; background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; color: #166534; font-size: 14px;">
            ✅ لا يوجد حالياً أي شخص متبقٍ على انتهاء رقمه المدني ٣٠ يوماً اليوم (${dateStr}).
          </div>
          `
        }

        <!-- Action Button -->
        <div style="text-align: center; margin: 28px 0 8px 0;">
          <a href="${escapeHtml(appUrl)}" target="_blank" style="display: inline-block; background-color: #0F766E; color: #FFFFFF; font-weight: 700; font-size: 14px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            فتح لوحة التحكم
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #F8FAFC; padding: 16px 28px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #64748B;">
        <p style="margin: 0;">إشعار آلي من <strong>${safeCompany}</strong> — يُرجى عدم الرد على هذه الرسالة.</p>
      </div>

    </div>
  </body>
  </html>
  `;
}

Deno.serve(async (req) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const alertEmailFrom = Deno.env.get("ALERT_EMAIL_FROM") || gmailUser || "onboarding@resend.dev";
    const alertToEmail = Deno.env.get("ALERT_TO_EMAIL") || Deno.env.get("ADMIN_EMAILS");
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3000";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional request parameters
    let requestBody: Record<string, unknown> = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        requestBody = await req.json();
      }
    } catch {
      // empty body
    }

    const isDryRun = Boolean(requestBody.dry_run);
    const customTestEmail =
      typeof requestBody.test_email === "string" ? requestBody.test_email.trim() : "";
    const forceSend = Boolean(requestBody.force_send || customTestEmail);

    // 1. Fetch company name from settings (default: A'system)
    let companyName = "A'system";
    const { data: settingsData } = await supabaseAdmin
      .from("settings")
      .select("company_name")
      .limit(1)
      .maybeSingle();

    if (
      settingsData?.company_name &&
      settingsData.company_name !== "notifyme" &&
      settingsData.company_name !== "برنامج التنبيه"
    ) {
      companyName = settingsData.company_name;
    }

    // 2. Fetch all records and calculate exact 30-day before-date in Asia/Kuwait timezone
    const todayKuwaitYmd = getTodayKuwaitYmd();

    const { data: recordsData, error: recordsError } = await supabaseAdmin
      .from("records")
      .select("*");

    if (recordsError) {
      throw recordsError;
    }

    const allRecords: AlertRecord[] = (recordsData || []).map((r: any) => {
      const uniqueExpiryYmd = extractYmd(
        r.unique_number_expiry_date || r.unique_number_expiry
      );
      const beforeDateYmd = uniqueExpiryYmd ? addDaysToYmd(uniqueExpiryYmd, -30) : null;
      const daysLeft = uniqueExpiryYmd ? diffDaysYmd(uniqueExpiryYmd, todayKuwaitYmd) : undefined;
      return {
        ...r,
        uniqueExpiryYmd: uniqueExpiryYmd || undefined,
        beforeDateYmd: beforeDateYmd || undefined,
        daysLeft,
      };
    });

    // Fetch already-sent notifications for (record_id, kind='unique_number', channel='email')
    const { data: existingLogs } = await supabaseAdmin
      .from("notifications_log")
      .select("record_id, target_expiry, status")
      .eq("kind", "unique_number")
      .eq("channel", "email")
      .eq("status", "sent");

    const alreadySentSet = new Set<string>(
      (existingLogs || []).map((row: any) => `${row.record_id}|${String(row.target_expiry).slice(0, 10)}`)
    );

    // Core rule: before_date == expiry_date - 30 days == todayKuwaitYmd
    const exact30DayDueRecords = allRecords.filter((r) => {
      if (!r.uniqueExpiryYmd || !r.beforeDateYmd) return false;
      if (r.beforeDateYmd !== todayKuwaitYmd) return false;
      return !alreadySentSet.has(`${r.id}|${r.uniqueExpiryYmd}`);
    });

    // If not in dry-run or force/test mode, and no record has before_date == todayKuwaitYmd, exit cleanly
    if (exact30DayDueRecords.length === 0 && !forceSend && !isDryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "لا يوجد أشخاص متبقٍ على انتهاء رقمهم المميز ٣٠ يوماً اليوم.",
          today_kuwait: todayKuwaitYmd,
          count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For dry_run or test mode when exact30DayDueRecords is empty, preview upcoming <=30 days if available
    let recordsForEmail = exact30DayDueRecords;
    let isTestFallback = false;
    if (recordsForEmail.length === 0 && (forceSend || isDryRun)) {
      isTestFallback = true;
      recordsForEmail = allRecords.filter(
        (r) => typeof r.daysLeft === "number" && r.daysLeft >= 0 && r.daysLeft <= 30
      );
    }

    // 3. Determine recipient emails (Admins)
    let recipientEmails: string[] = [];

    if (customTestEmail) {
      recipientEmails = [customTestEmail];
    }

    if (recipientEmails.length === 0 && alertToEmail) {
      recipientEmails = alertToEmail
        .split(/[;,]/)
        .map((e: string) => e.trim())
        .filter(Boolean);
    }

    if (recipientEmails.length === 0) {
      try {
        const { data: adminProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id, role")
          .eq("role", "admin");

        const adminIds = (adminProfiles || []).map((p: any) => p.id);

        if (adminIds.length > 0) {
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          if (usersData?.users) {
            recipientEmails = usersData.users
              .filter((u: any) => adminIds.includes(u.id) && u.email)
              .map((u: any) => u.email as string);
          }
        }
      } catch (err) {
        console.warn("Could not query admin profiles:", err);
      }
    }

    if (recipientEmails.length === 0 && gmailUser) {
      recipientEmails = [gmailUser];
    }

    if (recipientEmails.length === 0) {
      try {
        const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 5 });
        if (allUsers?.users && allUsers.users.length > 0) {
          recipientEmails = allUsers.users
            .filter((u: any) => u.email)
            .map((u: any) => u.email as string)
            .slice(0, 1);
        }
      } catch (err) {
        console.warn("Could not list auth users:", err);
      }
    }

    if (recipientEmails.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "لم يتم العثور على أي عنوان بريد إلكتروني للمستلم. يرجى ضبط حساب المسؤول أو GMAIL_USER في Supabase Secrets.",
          count: exact30DayDueRecords.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const todayDisplayStr = formatDateKuwait(todayKuwaitYmd);

    const emailHtml = buildAlertEmailHtml({
      companyName,
      appUrl,
      dateStr: todayDisplayStr,
      matchedRecords: recordsForEmail,
      isTestFallback,
    });

    const emailSubject =
      exact30DayDueRecords.length > 0
        ? `⚠️ تنبيه: ${exact30DayDueRecords.length} شخص متبقٍ على انتهاء الرقم المدني ٣٠ يوماً - ${companyName}`
        : `🔔 رسالة اختبار التنبيهات - ${companyName}`;

    const notificationSummaryLines = recordsForEmail.slice(0, 4).map((r) => {
      const personName = r.full_name || r.name || "—";
      const civilId = r.unique_number || "—";
      const expiry = formatDateKuwait(r.uniqueExpiryYmd || r.unique_number_expiry_date || r.unique_number_expiry);
      const daysVal = typeof r.daysLeft === "number" ? r.daysLeft : 30;
      return `• ${personName} (${civilId}) — ينتهي ${expiry} (متبقٍ ${daysVal} يوم)`;
    });

    const notificationPayload = {
      title: emailSubject,
      body:
        recordsForEmail.length > 0
          ? `يوجد (${recordsForEmail.length}) ${recordsForEmail.length === 1 ? "شخص متبقٍ" : "أشخاص متبقٍ"} على انتهاء صلاحية الرقم المدني له ٣٠ يوماً:\n${notificationSummaryLines.join("\n")}`
          : `لا يوجد حالياً أي شخص متبقٍ على انتهاء رقمه المدني ٣٠ يوماً اليوم (${todayDisplayStr}).`,
      url: "/notifications",
    };

    // Dry run preview
    if (isDryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: "معاينة التقرير جاهزة بنجاح.",
          recipients: recipientEmails,
          count: exact30DayDueRecords.length,
          html_preview: emailHtml,
          notification_payload: notificationPayload,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Send Email via Gmail SMTP or Resend
    let emailSendResult: unknown = null;
    let sendStatus: "sent" | "failed" = "sent";
    let sendErrorMessage: string | null = null;

    if (gmailUser && gmailAppPassword) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: gmailUser,
            pass: gmailAppPassword,
          },
        });

        emailSendResult = await transporter.sendMail({
          from: `"${companyName}" <${gmailUser}>`,
          to: recipientEmails.join(", "),
          subject: emailSubject,
          html: emailHtml,
        });
        sendStatus = "sent";
      } catch (gmailErr: any) {
        console.error("Gmail SMTP error:", gmailErr);
        sendStatus = "failed";
        sendErrorMessage = `خطأ أثناء الإرسال عبر Gmail: ${gmailErr.message}`;
      }
    } else if (resendApiKey) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: alertEmailFrom,
            to: recipientEmails,
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        const resendJson = await resendRes.json();
        emailSendResult = resendJson;
        if (!resendRes.ok) {
          sendStatus = "failed";
          sendErrorMessage = resendJson?.message || "فشل إرسال البريد عبر Resend API";
        }
      } catch (err: any) {
        sendStatus = "failed";
        sendErrorMessage = err.message || "خطأ أثناء الاتصال بمزود البريد";
      }
    } else {
      sendStatus = "failed";
      sendErrorMessage =
        "لم يتم إعداد مفاتيح البريد (GMAIL_USER و GMAIL_APP_PASSWORD أو RESEND_API_KEY) في Supabase Secrets.";
    }

    // 5. Save each matched 30-day record into public.notifications_log
    // Exact schema columns: record_id, kind, channel, target_expiry, status, error, sent_at
    let loggedCount = 0;
    let logError: string | null = null;

    if (exact30DayDueRecords.length > 0) {
      const nowIso = new Date().toISOString();
      const logRows = exact30DayDueRecords.map((rec) => ({
        record_id: rec.id,
        kind: "unique_number",
        channel: "email",
        target_expiry: rec.uniqueExpiryYmd!,
        status: sendStatus,
        error: sendStatus === "failed" ? sendErrorMessage : null,
        sent_at: nowIso,
      }));

      const { error: upsertErr } = await supabaseAdmin
        .from("notifications_log")
        .upsert(logRows, {
          onConflict: "record_id,kind,channel,target_expiry",
        });

      if (upsertErr) {
        console.error("Failed to save to notifications_log:", upsertErr);
        logError = upsertErr.message;
      } else {
        loggedCount = logRows.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: sendStatus === "sent",
        status: sendStatus,
        today_kuwait: todayKuwaitYmd,
        matched_count: exact30DayDueRecords.length,
        logged_count: loggedCount,
        log_error: logError,
        message:
          sendStatus === "failed"
            ? `فشل إرسال البريد: ${sendErrorMessage}`
            : exact30DayDueRecords.length > 0
            ? `تم إرسال التنبيه وتسجيل ${loggedCount} سجل متبقٍ على انتهائه ٣٠ يوماً بنجاح.`
            : `تم إرسال رسالة الاختبار بنجاح إلى ${recipientEmails.length} من المسؤولين (لا توجد سجلات متبقٍ لها ٣٠ يوماً اليوم).`,
        recipients: recipientEmails,
        notification_payload: notificationPayload,
        details: emailSendResult,
        warning: sendErrorMessage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error running daily-expiry-alerts function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "حدث خطأ أثناء تنفيذ دالة التنبيهات.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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
  unique_number_status?: "valid" | "expiring_soon" | "expired";
  passport_status?: "valid" | "expiring_soon" | "expired";
  unique_number_days_left?: number | null;
  passport_days_left?: number | null;
}

/**
 * Formats a date string in Asia/Kuwait timezone (DD/MM/YYYY)
 */
function formatDateKuwait(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
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
 * Builds a styled, modern, RTL Arabic HTML email template
 */
function buildAlertEmailHtml(params: {
  companyName: string;
  appUrl: string;
  dateStr: string;
  expiredRecords: AlertRecord[];
  expiringSoonRecords: AlertRecord[];
}): string {
  const { companyName, appUrl, dateStr, expiredRecords, expiringSoonRecords } = params;

  const expiredRows = expiredRecords
    .map((r) => {
      const name = r.full_name || r.name || "—";
      const uExp = formatDateKuwait(r.unique_number_expiry_date || r.unique_number_expiry);
      const pExp = formatDateKuwait(r.passport_expiry_date || r.passport_expiry);
      
      const reasons: string[] = [];
      if (r.unique_number_status === "expired") {
        reasons.push(`الرقم المميز (${r.unique_number_days_left !== undefined && r.unique_number_days_left !== null ? `منذ ${Math.abs(r.unique_number_days_left)} يوم` : 'منتهي'})`);
      }
      if (r.passport_status === "expired") {
        reasons.push(`الجواز (${r.passport_days_left !== undefined && r.passport_days_left !== null ? `منذ ${Math.abs(r.passport_days_left)} يوم` : 'منتهي'})`);
      }

      return `
      <tr style="border-bottom: 1px solid #FEE2E2;">
        <td style="padding: 12px 14px; font-weight: 600; color: #1E293B;">${name}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #475569;">${r.unique_number || '—'}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #DC2626;">${uExp}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #475569;">${r.passport_number || '—'}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #DC2626;">${pExp}</td>
        <td style="padding: 12px 14px; color: #B91C1C; font-weight: 600; font-size: 13px;">${reasons.join(" و ")}</td>
      </tr>
      `;
    })
    .join("");

  const expiringSoonRows = expiringSoonRecords
    .map((r) => {
      const name = r.full_name || r.name || "—";
      const uExp = formatDateKuwait(r.unique_number_expiry_date || r.unique_number_expiry);
      const pExp = formatDateKuwait(r.passport_expiry_date || r.passport_expiry);

      const items: string[] = [];
      if (r.unique_number_status === "expiring_soon") {
        items.push(`الرقم المميز (${r.unique_number_days_left} يوم متبقٍ)`);
      }
      if (r.passport_status === "expiring_soon") {
        items.push(`الجواز (${r.passport_days_left} يوم متبقٍ)`);
      }

      return `
      <tr style="border-bottom: 1px solid #FEF3C7;">
        <td style="padding: 12px 14px; font-weight: 600; color: #1E293B;">${name}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #475569;">${r.unique_number || '—'}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #D97706;">${uExp}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #475569;">${r.passport_number || '—'}</td>
        <td style="padding: 12px 14px; font-family: monospace; color: #D97706;">${pExp}</td>
        <td style="padding: 12px 14px; color: #92400E; font-weight: 600; font-size: 13px;">${items.join(" و ")}</td>
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
    <title>تنبيه انتهاء الصلاحية اليومي</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F4F6F8; font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #0F172A;">
    <div style="max-width: 720px; margin: 30px auto; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      
      <!-- Header -->
      <div style="background-color: #0B3B38; padding: 28px 32px; color: #FFFFFF; border-bottom: 4px solid #0F766E;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">${companyName} — برنامج التنبيه</h1>
        <p style="margin: 0; font-size: 14px; color: #A7F3D0;">تقرير التنبيهات اليومي لانتهاء صلاحية الوثائق والإقامات (${dateStr})</p>
      </div>

      <!-- Overview Stats Cards -->
      <div style="padding: 24px 32px; background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
        <div style="display: flex; gap: 16px;">
          <div style="flex: 1; background: #FFFFFF; border: 1px solid #FECACA; border-radius: 10px; padding: 16px; text-align: center;">
            <div style="font-size: 12px; font-weight: 700; color: #B91C1C; margin-bottom: 4px;">وثائق منتهية الصلاحية</div>
            <div style="font-size: 28px; font-weight: 800; color: #DC2626; font-family: monospace;">${expiredRecords.length}</div>
          </div>
          <div style="flex: 1; background: #FFFFFF; border: 1px solid #FDE68A; border-radius: 10px; padding: 16px; text-align: center;">
            <div style="font-size: 12px; font-weight: 700; color: #92400E; margin-bottom: 4px;">وثائق قاربت على الانتهاء</div>
            <div style="font-size: 28px; font-weight: 800; color: #D97706; font-family: monospace;">${expiringSoonRecords.length}</div>
          </div>
        </div>
      </div>

      <div style="padding: 32px;">

        <!-- Section 1: Expired Records -->
        ${
          expiredRecords.length > 0
            ? `
          <div style="margin-bottom: 36px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
              <span style="display: inline-block; width: 10px; height: 10px; background-color: #DC2626; border-radius: 50%;"></span>
              <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: #B91C1C;">الوثائق المنتهية الصلاحية بالفعل (${expiredRecords.length})</h2>
            </div>
            <div style="overflow-x: auto; border: 1px solid #FECACA; border-radius: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: right;">
                <thead>
                  <tr style="background-color: #FEF2F2; color: #991B1B; font-weight: 700; border-bottom: 1px solid #FECACA;">
                    <th style="padding: 10px 14px;">الاسم</th>
                    <th style="padding: 10px 14px;">الرقم المميز</th>
                    <th style="padding: 10px 14px;">انتهاء الرقم</th>
                    <th style="padding: 10px 14px;">الجواز</th>
                    <th style="padding: 10px 14px;">انتهاء الجواز</th>
                    <th style="padding: 10px 14px;">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  ${expiredRows}
                </tbody>
              </table>
            </div>
          </div>
          `
            : ""
        }

        <!-- Section 2: Expiring Soon Records -->
        ${
          expiringSoonRecords.length > 0
            ? `
          <div style="margin-bottom: 32px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
              <span style="display: inline-block; width: 10px; height: 10px; background-color: #D97706; border-radius: 50%;"></span>
              <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: #92400E;">الوثائق التي تنتهي قريباً (${expiringSoonRecords.length})</h2>
            </div>
            <div style="overflow-x: auto; border: 1px solid #FDE68A; border-radius: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: right;">
                <thead>
                  <tr style="background-color: #FFFBEB; color: #92400E; font-weight: 700; border-bottom: 1px solid #FDE68A;">
                    <th style="padding: 10px 14px;">الاسم</th>
                    <th style="padding: 10px 14px;">الرقم المميز</th>
                    <th style="padding: 10px 14px;">انتهاء الرقم</th>
                    <th style="padding: 10px 14px;">الجواز</th>
                    <th style="padding: 10px 14px;">انتهاء الجواز</th>
                    <th style="padding: 10px 14px;">الحالة المتبقية</th>
                  </tr>
                </thead>
                <tbody>
                  ${expiringSoonRows}
                </tbody>
              </table>
            </div>
          </div>
          `
            : ""
        }

        <!-- Action Button -->
        <div style="text-align: center; margin: 36px 0 16px 0;">
          <a href="${appUrl}" target="_blank" style="display: inline-block; background-color: #0F766E; color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 13px 36px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 8px rgba(15,118,110,0.3);">
            فتح لوحة التحكم ومتابعة التجديد
          </a>
        </div>

      </div>

      <!-- Footer -->
      <div style="background-color: #F8FAFC; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #64748B;">
        <p style="margin: 0 0 4px 0;">هذا إشعار آلي صادر يومياً من <strong>برنامج التنبيه</strong> إلى مسؤولي النظام المعتمدين.</p>
        <p style="margin: 0;">يُرجى عدم الرد المباشر على هذه الرسالة.</p>
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const alertEmailFrom = Deno.env.get("ALERT_EMAIL_FROM") || "onboarding@resend.dev";
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3000";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional request parameters
    let requestBody: any = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        requestBody = await req.json();
      }
    } catch {
      // empty body
    }

    const isDryRun = Boolean(requestBody.dry_run);
    const customTestEmail = requestBody.test_email?.trim();

    // 1. Fetch company name from settings
    let companyName = "برنامج التنبيه";
    const { data: settingsData } = await supabaseAdmin
      .from("settings")
      .select("company_name")
      .limit(1)
      .maybeSingle();

    if (settingsData?.company_name) {
      companyName = settingsData.company_name;
    }

    // 2. Fetch records that need attention from records_with_status view
    // Records expiring soon or expired (unique number or passport)
    const { data: recordsData, error: recordsError } = await supabaseAdmin
      .from("records_with_status")
      .select("*");

    if (recordsError) {
      throw recordsError;
    }

    const records: AlertRecord[] = recordsData || [];

    const expiredRecords = records.filter(
      (r) => r.unique_number_status === "expired" || r.passport_status === "expired"
    );

    const expiringSoonRecords = records.filter(
      (r) =>
        (r.unique_number_status === "expiring_soon" || r.passport_status === "expiring_soon") &&
        r.unique_number_status !== "expired" &&
        r.passport_status !== "expired"
    );

    const totalNeedingAlert = expiredRecords.length + expiringSoonRecords.length;

    // If no records require attention
    if (totalNeedingAlert === 0 && !customTestEmail) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "لا توجد أي وثائق منتهية أو على وشك الانتهاء اليوم. لم يتم إرسال بريد.",
          count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Determine recipients (Admins)
    let recipientEmails: string[] = [];

    if (customTestEmail) {
      recipientEmails = [customTestEmail];
    } else {
      // Find admin user IDs from profiles table (role = 'admin')
      const { data: adminProfiles, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("role", "admin");

      if (profileErr) {
        console.error("Error fetching admin profiles:", profileErr);
      }

      const adminIds = (adminProfiles || []).map((p: any) => p.id);

      // Fetch emails from auth.users using admin API
      if (adminIds.length > 0) {
        const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers();
        if (!usersErr && usersData?.users) {
          recipientEmails = usersData.users
            .filter((u: any) => adminIds.includes(u.id) && u.email)
            .map((u: any) => u.email as string);
        }
      }

      // If no admin emails discovered in profiles, fallback to checking any user metadata or fallback
      if (recipientEmails.length === 0) {
        const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10 });
        if (allUsers?.users && allUsers.users.length > 0) {
          recipientEmails = allUsers.users
            .filter((u: any) => u.email)
            .map((u: any) => u.email as string)
            .slice(0, 3);
        }
      }
    }

    if (recipientEmails.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "لم يتم العثور على عناوين بريد إلكتروني للمسؤولين (role = 'admin').",
          expired_count: expiredRecords.length,
          expiring_soon_count: expiringSoonRecords.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format today's date in Kuwait timezone
    const todayKuwaitStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuwait",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());

    // Generate HTML template
    const emailHtml = buildAlertEmailHtml({
      companyName,
      appUrl,
      dateStr: todayKuwaitStr,
      expiredRecords,
      expiringSoonRecords,
    });

    const emailSubject = `⚠️ تنبيه انتهاء الصلاحية اليومي: ${expiredRecords.length} منتهية، و ${expiringSoonRecords.length} تنتهي قريباً - ${companyName}`;

    // If dry run, return preview without dispatching actual email
    if (isDryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: "معاينة التقرير جاهزة بنجاح (وضع المعاينة).",
          recipients: recipientEmails,
          expired_count: expiredRecords.length,
          expiring_soon_count: expiringSoonRecords.length,
          html_preview: emailHtml,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Send Email via Resend API (or custom SMTP/Provider)
    let emailSendResult: any = null;
    let sendStatus = "sent";
    let sendErrorMessage: string | null = null;

    if (resendApiKey) {
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

        emailSendResult = await resendRes.json();
        if (!resendRes.ok) {
          sendStatus = "failed";
          sendErrorMessage = emailSendResult?.message || "فشل إرسال البريد عبر Resend API";
        }
      } catch (err: any) {
        sendStatus = "failed";
        sendErrorMessage = err.message || "خطأ أثناء الاتصال بمزود البريد";
      }
    } else {
      // RESEND_API_KEY is not configured yet
      sendStatus = "simulated_success";
      sendErrorMessage =
        "تم فحص الوثائق وتوليد التقرير بنجاح. لتفعيل الإرسال الفعلي عبر البريد، يرجى ضبط مفتاح RESEND_API_KEY في إعدادات Supabase Secrets.";
    }

    // 5. Insert record into notifications_log table
    try {
      const summaryText = `تنبيه يومي: ${expiredRecords.length} منتهية، ${expiringSoonRecords.length} تنتهي قريباً.`;
      
      await supabaseAdmin.from("notifications_log").insert({
        recipient_email: recipientEmails.join(", "),
        notification_type: "daily_expiry_alert",
        status: sendStatus,
        summary: summaryText,
        sent_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.warn("Could not write to notifications_log table:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: sendStatus !== "failed",
        status: sendStatus,
        message:
          sendStatus === "failed"
            ? `فشل إرسال البريد: ${sendErrorMessage}`
            : `تم إرسال التنبيه اليومي بنجاح إلى ${recipientEmails.length} من المسؤولين.`,
        recipients: recipientEmails,
        expired_count: expiredRecords.length,
        expiring_soon_count: expiringSoonRecords.length,
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
        error: error.message || "حدث خطأ أثناء تنفيذ دالة التنبيهات اليومية.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

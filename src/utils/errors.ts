/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps Supabase / Postgres error codes or messages to Arabic user-friendly text.
 */
export function translateErrorMessage(error: any): string {
  if (!error) return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.';

  const code = error.code || error.statusCode || '';
  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();

  // Postgres 23505: Unique violation (e.g. unique_number constraint)
  if (code === '23505' || message.includes('duplicate key') || details.includes('unique_number')) {
    return 'الرقم المميز مسجل بالفعل في النظام، يرجى التحقق من الرقم المدخل.';
  }

  // Supabase Auth errors
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  }
  if (message.includes('email not confirmed')) {
    return 'لم يتم تأكيد البريد الإلكتروني بعد.';
  }
  if (message.includes('user not found')) {
    return 'المستخدم غير موجود.';
  }
  if (message.includes('rate limit')) {
    return 'تم تجاوز الحد الأقصى للمحاولات، يرجى الانتظار قليلاً والمحاولة مجدداً.';
  }

  // Row Level Security (RLS) / Permission errors
  if (code === '42501' || message.includes('permission denied') || message.includes('row-level security policy')) {
    return 'ليس لديك الصلاحيات الكافية لتنفيذ هذه العملية.';
  }

  // Network / connection errors
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت وإعدادات الاتصال.';
  }

  // Default fallback with original message if available
  return error.message || 'حدث خطأ أثناء معالجة الطلب.';
}

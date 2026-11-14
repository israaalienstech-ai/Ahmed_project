/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps Supabase / Postgres error codes or messages to user-friendly text (AR/EN).
 */
export function translateErrorMessage(error: any, lang: 'ar' | 'en' = 'ar'): string {
  if (!error) {
    return lang === 'ar'
      ? 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.'
      : 'An unexpected error occurred. Please try again.';
  }

  const code = error.code || error.statusCode || '';
  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();

  // Postgres 23505: Unique violation (e.g. unique_number constraint)
  if (code === '23505' || message.includes('duplicate key') || details.includes('unique_number')) {
    return lang === 'ar'
      ? 'الرقم المدني مسجل بالفعل في النظام، يرجى التحقق من الرقم المدخل.'
      : 'This Civil ID is already registered in the system. Please check the number entered.';
  }

  // Supabase Auth errors
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return lang === 'ar'
      ? 'اسم المستخدم أو كلمة المرور غير صحيحة.'
      : 'Invalid email or password.';
  }
  if (message.includes('email not confirmed')) {
    return lang === 'ar'
      ? 'لم يتم تأكيد البريد الإلكتروني بعد.'
      : 'Email address is not confirmed yet.';
  }
  if (message.includes('user not found')) {
    return lang === 'ar' ? 'المستخدم غير موجود.' : 'User not found.';
  }
  if (message.includes('rate limit')) {
    return lang === 'ar'
      ? 'تم تجاوز الحد الأقصى للمحاولات، يرجى الانتظار قليلاً والمحاولة مجدداً.'
      : 'Too many attempts. Please wait a moment and try again.';
  }

  // Row Level Security (RLS) / Permission errors
  if (
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security policy')
  ) {
    return lang === 'ar'
      ? 'ليس لديك الصلاحيات الكافية لتنفيذ هذه العملية.'
      : 'You do not have permission to perform this action.';
  }

  // Network / connection errors
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return lang === 'ar'
      ? 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت وإعدادات الاتصال.'
      : 'Unable to reach the server. Please check your internet connection.';
  }

  return error.message || (lang === 'ar' ? 'حدث خطأ أثناء معالجة الطلب.' : 'Request failed.');
}

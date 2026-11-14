/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RecordItem } from '../types';
import { formatKuwaitDate, getTodayKuwaitDateString } from './date';

const DEVICE_NOTIFY_PREF_KEY = 'asystem_device_notifications_enabled';
const NOTIFIED_KEYS_STORAGE = 'asystem_notified_alert_keys';
export const NOTIF_PREF_EVENT = 'asystem-notif-pref-changed';

export interface DeviceNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  dir?: 'rtl' | 'ltr';
  lang?: string;
}

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isDeviceNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDeviceNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isDeviceNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export function isDeviceNotificationsEnabled(): boolean {
  if (!isDeviceNotificationsSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  return localStorage.getItem(DEVICE_NOTIFY_PREF_KEY) !== 'false';
}

export function setDeviceNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(DEVICE_NOTIFY_PREF_KEY, enabled ? 'true' : 'false');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIF_PREF_EVENT));
  }
}

export async function requestDeviceNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isDeviceNotificationsSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setDeviceNotificationsEnabled(true);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NOTIF_PREF_EVENT));
    }
    return permission;
  } catch {
    return Notification.permission;
  }
}

/**
 * Computes exact calendar days left in Asia/Kuwait timezone (matches Edge Function logic 1:1)
 */
export function computeKuwaitDaysLeft(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  const targetYmd = match ? match[1] : null;
  if (!targetYmd) return null;

  const todayYmd = getTodayKuwaitDateString();
  const [ty, tm, td] = targetYmd.split('-').map(Number);
  const [by, bm, bd] = todayYmd.split('-').map(Number);
  const tUtc = Date.UTC(ty, tm - 1, td);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((tUtc - bUtc) / 86400000);
}

export function filterExact30DayCivilIdRecords(records: RecordItem[]): RecordItem[] {
  return records.filter((r) => {
    const expiryStr = r.unique_number_expiry_date || r.unique_number_expiry;
    const kuwaitDays = computeKuwaitDaysLeft(expiryStr);
    if (kuwaitDays !== null) {
      return kuwaitDays === 30;
    }
    return r.unique_number_days_left === 30;
  });
}

/**
 * Builds the exact same alert message as the email sent by daily-expiry-alerts
 */
export function buildExpiryAlertMessage(
  matchedRecords: Array<{
    full_name?: string | null;
    name?: string | null;
    unique_number?: string | null;
    unique_number_expiry_date?: string | null;
    unique_number_expiry?: string | null;
    unique_number_days_left?: number | null;
  }>,
  companyName = "A'system",
  lang: 'ar' | 'en' = 'ar'
): DeviceNotificationPayload {
  const brand =
    companyName && companyName !== 'notifyme' && companyName !== 'برنامج التنبيه'
      ? companyName
      : "A'system";

  if (matchedRecords.length === 0) {
    return {
      title:
        lang === 'ar'
          ? `🔔 إشعار اختبار التنبيهات — ${brand}`
          : `🔔 Alert Test Notification — ${brand}`,
      body:
        lang === 'ar'
          ? 'لا يوجد حالياً أي شخص متبقٍ على انتهاء رقمه المدني ٣٠ يوماً اليوم.'
          : 'No records currently have 30 days left before Civil ID expiry.',
      url: '/notifications',
      tag: `asystem-alert-${getTodayKuwaitDateString()}`,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      lang,
    };
  }

  const count = matchedRecords.length;
  const title =
    lang === 'ar'
      ? `⚠️ تنبيه: ${count} شخص متبقٍ على انتهاء الرقم المدني ٣٠ يوماً - ${brand}`
      : `⚠️ Alert: ${count} person(s) with 30 days left on Civil ID - ${brand}`;

  const summaryLines = matchedRecords.slice(0, 4).map((r) => {
    const personName = r.full_name || r.name || '—';
    const civilId = r.unique_number || '—';
    const expiryRaw = r.unique_number_expiry_date || r.unique_number_expiry;
    const expiry = formatKuwaitDate(expiryRaw);
    const kuwaitDays = computeKuwaitDaysLeft(expiryRaw);
    const days =
      kuwaitDays !== null
        ? kuwaitDays
        : typeof r.unique_number_days_left === 'number'
        ? r.unique_number_days_left
        : 30;
    return lang === 'ar'
      ? `• ${personName} (${civilId}) — ينتهي ${expiry} (متبقٍ ${days} يوم)`
      : `• ${personName} (${civilId}) — Expires ${expiry} (${days} days left)`;
  });

  if (count > 4) {
    summaryLines.push(
      lang === 'ar' ? `و ${count - 4} أشخاص آخرين...` : `and ${count - 4} more...`
    );
  }

  const headerLine =
    lang === 'ar'
      ? `يوجد (${count}) ${count === 1 ? 'شخص متبقٍ' : 'أشخاص متبقٍ'} على انتهاء صلاحية الرقم المدني له ٣٠ يوماً:`
      : `${count} person(s) have 30 days left before Civil ID expiry:`;

  return {
    title,
    body: `${headerLine}\n${summaryLines.join('\n')}`,
    url: '/notifications',
    tag: `asystem-alert-${getTodayKuwaitDateString()}`,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    lang,
  };
}

/**
 * Waits up to timeoutMs for an active ServiceWorkerRegistration
 */
async function getActiveServiceWorkerRegistration(
  timeoutMs = 1500
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (reg && reg.active) return reg;
    const fallback = await navigator.serviceWorker.getRegistration();
    return fallback && fallback.active ? fallback : null;
  } catch {
    return null;
  }
}

/**
 * Dispatches an OS-level notification via active Service Worker (for PWA desktop/mobile) or Notification API fallback
 */
export async function showDeviceNotification(
  payload: DeviceNotificationPayload
): Promise<boolean> {
  if (!isDeviceNotificationsSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const swReg = await getActiveServiceWorkerRegistration();
  if (swReg) {
    try {
      await swReg.showNotification(payload.title, {
        body: payload.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        dir: payload.dir || 'rtl',
        lang: payload.lang || 'ar',
        tag: payload.tag || 'asystem-expiry-alert',
        data: { url: payload.url || '/notifications' },
      } as NotificationOptions);
      return true;
    } catch (err) {
      console.warn('ServiceWorker showNotification failed, falling back to Notification API:', err);
    }
  }

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      dir: payload.dir || 'rtl',
      lang: payload.lang || 'ar',
      tag: payload.tag || 'asystem-expiry-alert',
    });
    notification.onclick = () => {
      window.focus();
      if (payload.url && window.location.pathname !== payload.url) {
        window.history.pushState({}, '', payload.url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      notification.close();
    };
    return true;
  } catch (err) {
    console.warn('Notification API failed:', err);
    return false;
  }
}

/**
 * Deduplicates daily device notifications so a record isn't re-alerted repeatedly on every page reload
 */
export function hasNotifiedTodayForKey(dedupeKey: string): boolean {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEYS_STORAGE);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { date: string; keys: string[] };
    const today = getTodayKuwaitDateString();
    if (parsed.date !== today) return false;
    return parsed.keys.includes(dedupeKey);
  } catch {
    return false;
  }
}

export function markNotifiedTodayForKeys(dedupeKeys: string[]): void {
  try {
    const today = getTodayKuwaitDateString();
    const raw = localStorage.getItem(NOTIFIED_KEYS_STORAGE);
    let existingKeys: string[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as { date: string; keys: string[] };
      if (parsed.date === today && Array.isArray(parsed.keys)) {
        existingKeys = parsed.keys;
      }
    }
    const merged = Array.from(new Set([...existingKeys, ...dedupeKeys]));
    localStorage.setItem(NOTIFIED_KEYS_STORAGE, JSON.stringify({ date: today, keys: merged }));
  } catch {
    // ignore storage errors
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  DeviceNotificationPayload,
  isDeviceNotificationsEnabled,
  showDeviceNotification,
} from './deviceNotifications';

let inFlightPromise: Promise<AutoExpiryCheckResult | null> | null = null;
let lastCheckAt = 0;
const PASSIVE_CHECK_COOLDOWN_MS = 60 * 1000;

export interface AutoExpiryCheckResult {
  success: boolean;
  matchedCount: number;
  loggedCount: number;
  notificationPayload?: DeviceNotificationPayload;
}

/**
 * Automatically invokes the daily-expiry-alerts Edge Function (without force_send).
 * The Edge Function is idempotent via notifications_log (record_id, kind, channel, target_expiry):
 * - If any Civil ID or file has before_date == today (30 days remaining) and wasn't logged as 'sent' yet,
 *   it immediately sends the email, saves to notifications_log, and fires a device notification.
 * - If nothing is due or everything due was already sent, it exits immediately without sending emails.
 */
export async function triggerAutomaticExpiryCheck(options?: {
  lang?: 'ar' | 'en';
  forceCheck?: boolean;
  onAlertTriggered?: (payload: DeviceNotificationPayload) => void;
}): Promise<AutoExpiryCheckResult | null> {
  if (!isSupabaseConfigured) return null;

  if (inFlightPromise) {
    if (!options?.forceCheck) {
      return inFlightPromise;
    }
    try {
      await inFlightPromise;
    } catch {
      // ignore previous failure and proceed with fresh forced check
    }
  }

  const now = Date.now();
  if (!options?.forceCheck && now - lastCheckAt < PASSIVE_CHECK_COOLDOWN_MS) {
    return null;
  }

  lastCheckAt = now;
  inFlightPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('daily-expiry-alerts', {
        body: {},
      });

      if (error || !data) {
        return null;
      }

      const matchedCount = Number(data.matched_count ?? data.count ?? 0);
      const loggedCount = Number(data.logged_count ?? 0);
      const payload = data.notification_payload as DeviceNotificationPayload | undefined;

      if (matchedCount > 0 && payload) {
        if (options?.onAlertTriggered) {
          options.onAlertTriggered(payload);
        }

        if (isDeviceNotificationsEnabled()) {
          await showDeviceNotification({
            ...payload,
            dir: options?.lang === 'en' ? 'ltr' : 'rtl',
            lang: options?.lang || 'ar',
          });
        }
      }

      return {
        success: Boolean(data.success),
        matchedCount,
        loggedCount,
        notificationPayload: payload,
      };
    } catch (err) {
      console.warn('Automatic expiry check failed:', err);
      return null;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

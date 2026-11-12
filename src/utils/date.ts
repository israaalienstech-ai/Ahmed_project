/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats an ISO date string or Date object into DD/MM/YYYY
 * strictly in the Asia/Kuwait timezone with Western digits (0-9).
 */
export function formatKuwaitDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';

    // Format strictly using Asia/Kuwait timezone and Latin/Western numerals (en-GB or en-US)
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuwait',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return formatter.format(date); // Output format: DD/MM/YYYY (e.g. 15/04/2026)
  } catch (err) {
    return '—';
  }
}

/**
 * Validates that passport expiry date is strictly after passport issue date.
 */
export function isPassportExpiryValid(issueDateStr: string, expiryDateStr: string): boolean {
  if (!issueDateStr || !expiryDateStr) return false;
  const issue = new Date(issueDateStr);
  const expiry = new Date(expiryDateStr);
  if (isNaN(issue.getTime()) || isNaN(expiry.getTime())) return false;
  return expiry.getTime() > issue.getTime();
}

/**
 * Converts a standard HTML date input value (YYYY-MM-DD) safely
 */
export function toInputDateFormat(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ExpiryStatus = 'valid' | 'expiring_soon' | 'expired';

export interface RecordItem {
  id: string;
  name?: string;
  full_name?: string;
  unique_number: string;
  unique_number_expiry_date?: string;
  unique_number_expiry?: string;
  passport_number: string;
  nationality: string;
  passport_issue_date?: string;
  passport_expiry_date?: string;
  passport_expiry?: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  // Computed fields from view records_with_status
  unique_number_status?: ExpiryStatus;
  passport_status?: ExpiryStatus;
  unique_number_days_left?: number | null;
  passport_days_left?: number | null;
}

export type DocType = 'id_front' | 'id_back' | 'passport' | 'pam';

export interface DocumentItem {
  id?: string;
  record_id: string;
  doc_type: DocType;
  storage_path: string;
  uploaded_at?: string;
}

export interface Profile {
  id: string;
  role?: string;
  is_admin?: boolean;
}

export interface AppSettings {
  company_name?: string;
}

export interface NotificationLogItem {
  id: string;
  recipient_email?: string;
  notification_type?: string;
  status?: string;
  summary?: string;
  sent_at?: string;
  created_at?: string;
}

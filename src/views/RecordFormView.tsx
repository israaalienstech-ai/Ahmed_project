/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Save,
  X,
  Upload,
  FileCheck,
  Eye,
  AlertCircle,
  CheckCircle2,
  Globe,
  FileText,
  User,
  Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DocType, DocumentItem } from '../types';
import { ARABIC_NATIONALITIES } from '../data/nationalities';
import { toInputDateFormat, isPassportExpiryValid } from '../utils/date';
import { translateErrorMessage } from '../utils/errors';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { usePreferences } from '../context/PreferencesContext';
import { triggerAutomaticExpiryCheck } from '../utils/autoAlertTrigger';
import { computeKuwaitDaysLeft } from '../utils/deviceNotifications';

interface RecordFormViewProps {
  recordId?: string | null;
  onBack: () => void;
  onSaved: () => void;
}

interface DocSlotConfig {
  type: DocType;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}

const DOC_SLOTS: DocSlotConfig[] = [
  {
    type: 'id_front',
    labelAr: 'البطاقة المدنية (الوجه)',
    labelEn: 'Civil ID (Front)',
    descAr: 'صورة الوجه الأمامي للبطاقة المدنية',
    descEn: 'Front side of the Civil ID card',
  },
  {
    type: 'id_back',
    labelAr: 'البطاقة المدنية (الظهر)',
    labelEn: 'Civil ID (Back)',
    descAr: 'صورة الوجه الخلفي للبطاقة المدنية',
    descEn: 'Back side of the Civil ID card',
  },
  {
    type: 'passport',
    labelAr: 'جواز السفر',
    labelEn: 'Passport',
    descAr: 'صفحة البيانات الرئيسية لجواز السفر',
    descEn: 'Main passport bio-data page',
  },
  {
    type: 'pam',
    labelAr: 'اعتماد التوقيع (PAM)',
    labelEn: 'Work Permit / PAM',
    descAr: 'شهادة اعتماد التوقيع أو إذن العمل',
    descEn: 'Authorized signatory or work permit certificate',
  },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB strictly
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

export const RecordFormView: React.FC<RecordFormViewProps> = ({
  recordId,
  onBack,
  onSaved,
}) => {
  const isEditing = Boolean(recordId);
  const { lang, isRtl } = usePreferences();
  const isAr = lang === 'ar';

  const [fullName, setFullName] = useState('');
  const [civilId, setCivilId] = useState('');
  const [civilIdExpiry, setCivilIdExpiry] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [nationality, setNationality] = useState('');
  const [passportIssueDate, setPassportIssueDate] = useState('');
  const [passportExpiryDate, setPassportExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  const [nationalityQuery, setNationalityQuery] = useState('');
  const [isNationalityOpen, setIsNationalityOpen] = useState(false);
  const nationalityDropdownRef = useRef<HTMLDivElement>(null);

  const [existingDocs, setExistingDocs] = useState<Record<DocType, DocumentItem | null>>({
    id_front: null,
    id_back: null,
    passport: null,
    pam: null,
  });

  const [pendingFiles, setPendingFiles] = useState<Record<DocType, File | null>>({
    id_front: null,
    id_back: null,
    passport: null,
    pam: null,
  });

  const [loadingRecord, setLoadingRecord] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [previewDoc, setPreviewDoc] = useState<{ title: string; storagePath: string } | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        nationalityDropdownRef.current &&
        !nationalityDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNationalityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!recordId) return;

    async function loadData() {
      setLoadingRecord(true);
      setErrorMessage(null);
      try {
        const { data: recordData, error: recordErr } = await supabase
          .from('records')
          .select('*')
          .eq('id', recordId)
          .single();

        if (recordErr) throw recordErr;

        if (recordData) {
          setFullName(recordData.full_name || recordData.name || '');
          setCivilId(recordData.unique_number || '');
          setCivilIdExpiry(
            toInputDateFormat(
              recordData.unique_number_expiry_date || recordData.unique_number_expiry
            )
          );
          setPassportNumber(recordData.passport_number || '');
          setNationality(recordData.nationality || '');
          setPassportIssueDate(toInputDateFormat(recordData.passport_issue_date));
          setPassportExpiryDate(
            toInputDateFormat(
              recordData.passport_expiry_date || recordData.passport_expiry
            )
          );
          setNotes(recordData.notes || '');
        }

        const { data: docsData, error: docsErr } = await supabase
          .from('documents')
          .select('id, record_id, doc_type, storage_path, uploaded_at')
          .eq('record_id', recordId);

        if (!docsErr && docsData) {
          const map: Record<DocType, DocumentItem | null> = {
            id_front: null,
            id_back: null,
            passport: null,
            pam: null,
          };
          docsData.forEach((doc: any) => {
            if (doc.doc_type && map[doc.doc_type as DocType] !== undefined) {
              map[doc.doc_type as DocType] = doc;
            }
          });
          setExistingDocs(map);
        }
      } catch (err: any) {
        setErrorMessage(translateErrorMessage(err, lang));
      } finally {
        setLoadingRecord(false);
      }
    }

    loadData();
  }, [recordId, lang]);

  const filteredNationalities = useMemo(() => {
    if (!nationalityQuery.trim()) return ARABIC_NATIONALITIES;
    const q = nationalityQuery.trim().toLowerCase();
    return ARABIC_NATIONALITIES.filter(
      (n) => n.name.includes(nationalityQuery.trim()) || n.code.toLowerCase().includes(q)
    );
  }, [nationalityQuery]);

  const handleFileSelect = (docType: DocType, file: File | null) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(
        isAr
          ? `الملف (${file.name}) يتجاوز الحد الأقصى المسموح به وهو 5 ميجابايت.`
          : `File (${file.name}) exceeds the 5 MB size limit.`
      );
      return;
    }

    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExt) && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrorMessage(
        isAr
          ? `نوع الملف (${file.name}) غير مدعوم. الصيغ المسموحة هي: JPG أو PNG أو PDF فقط.`
          : `Unsupported file type (${file.name}). Allowed formats: JPG, PNG, PDF.`
      );
      return;
    }

    setErrorMessage(null);
    setPendingFiles((prev) => ({ ...prev, [docType]: file }));
  };

  const validateForm = (): string | null => {
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) {
      return isAr
        ? 'يجب إدخال الاسم الرباعي كاملاً (4 كلمات على الأقل).'
        : 'Full name must include at least 4 words.';
    }

    if (!civilId.trim()) {
      return isAr ? 'الرقم المدني مطلوب.' : 'Civil ID is required.';
    }
    if (!/^\d+$/.test(civilId.trim())) {
      return isAr
        ? 'يجب أن يتكون الرقم المدني من أرقام فقط بدون حروف أو رموز.'
        : 'Civil ID must contain digits only.';
    }

    if (!civilIdExpiry) {
      return isAr ? 'يرجى تحديد تاريخ انتهاء الرقم المدني.' : 'Please select Civil ID expiry date.';
    }

    if (!passportNumber.trim()) {
      return isAr ? 'يرجى إدخال رقم جواز السفر.' : 'Please enter passport number.';
    }

    if (!nationality.trim()) {
      return isAr ? 'يرجى اختيار الجنسية من القائمة.' : 'Please select nationality.';
    }

    if (!passportIssueDate) {
      return isAr ? 'يرجى تحديد تاريخ إصدار جواز السفر.' : 'Please select passport issue date.';
    }
    if (!passportExpiryDate) {
      return isAr ? 'يرجى تحديد تاريخ انتهاء جواز السفر.' : 'Please select passport expiry date.';
    }

    if (!isPassportExpiryValid(passportIssueDate, passportExpiryDate)) {
      return isAr
        ? 'تاريخ انتهاء جواز السفر يجب أن يكون بعد تاريخ الإصدار.'
        : 'Passport expiry date must be after issue date.';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSaving(true);
    try {
      const targetRecordId = recordId || crypto.randomUUID();

      const recordPayload = {
        id: targetRecordId,
        full_name: fullName.trim(),
        name: fullName.trim(),
        unique_number: civilId.trim(),
        unique_number_expiry_date: civilIdExpiry,
        passport_number: passportNumber.trim(),
        nationality: nationality.trim(),
        passport_issue_date: passportIssueDate,
        passport_expiry_date: passportExpiryDate,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let saveRecordError;
      if (isEditing) {
        const { error } = await supabase
          .from('records')
          .update(recordPayload)
          .eq('id', targetRecordId);
        saveRecordError = error;
      } else {
        const { error } = await supabase.from('records').insert({
          ...recordPayload,
          created_at: new Date().toISOString(),
        });
        saveRecordError = error;
      }

      if (saveRecordError) {
        throw saveRecordError;
      }

      const docTypeKeys = Object.keys(pendingFiles) as DocType[];

      for (const docType of docTypeKeys) {
        const file = pendingFiles[docType];
        if (!file) continue;

        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const storagePath = `records/${targetRecordId}/${docType}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, {
            upsert: true,
            contentType: file.type,
          });

        if (uploadErr) {
          console.error(`Failed to upload ${docType}:`, uploadErr);
          throw new Error(
            isAr
              ? `فشل رفع وثيقة ${docType}: ${uploadErr.message}`
              : `Failed to upload ${docType}: ${uploadErr.message}`
          );
        }

        const { error: docDbErr } = await supabase
          .from('documents')
          .upsert(
            {
              record_id: targetRecordId,
              doc_type: docType,
              storage_path: storagePath,
              uploaded_at: new Date().toISOString(),
            },
            { onConflict: 'record_id,doc_type' }
          );

        if (docDbErr) {
          console.error(`Failed to register document in DB:`, docDbErr);
          throw docDbErr;
        }
      }

      let autoAlertMsg = '';
      if (computeKuwaitDaysLeft(civilIdExpiry) === 30) {
        const alertRes = await triggerAutomaticExpiryCheck({ lang });
        if (alertRes && alertRes.matchedCount > 0) {
          autoAlertMsg = isAr
            ? ' وتم إرسال البريد الإلكتروني والإشعار تلقائياً.'
            : ' Automatic email and notification sent.';
        }
      }

      setSuccessToast(
        (isEditing
          ? isAr
            ? 'تم تحديث السجل بنجاح!'
            : 'Record updated successfully!'
          : isAr
          ? 'تم إنشاء السجل والوثائق بنجاح!'
          : 'Record and documents saved successfully!') + autoAlertMsg
      );
      setTimeout(() => {
        onSaved();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(translateErrorMessage(err, lang));
    } finally {
      setSaving(false);
    }
  };

  if (loadingRecord) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-slate-900 rounded-xl border border-[#E2E8F0] dark:border-slate-800 p-12">
        <div className="w-8 h-8 border-3 border-[#0F766E]/30 border-t-[#0F766E] rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {isAr ? 'جاري تحميل بيانات السجل...' : 'Loading record details...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
      {successToast && (
        <div className="fixed bottom-6 start-6 z-50 flex items-center gap-2 px-5 py-3.5 bg-emerald-800 text-white rounded-xl shadow-xl border border-emerald-700 animate-fade-in text-sm font-bold">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            title={isAr ? 'الرجوع إلى القائمة' : 'Back to list'}
          >
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {isEditing
                ? isAr
                  ? 'تعديل بيانات السجل'
                  : 'Edit Record'
                : isAr
                ? 'إضافة سجل جديد'
                : 'Add New Record'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'أدخل البيانات الأساسية وأرفق الوثائق الرسمية المطلوبة بدقة'
                : 'Enter personal information and attach required official documents'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 min-h-[44px] px-6 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isAr ? 'حفظ السجل' : 'Save Record'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-4 bg-[#FEE2E2] dark:bg-red-950/60 border border-[#FECACA] dark:border-red-800 rounded-xl text-sm text-red-900 dark:text-red-200">
          <AlertCircle className="w-5 h-5 text-[#B91C1C] dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 dark:text-red-300 hover:text-red-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Section 1: Main Personal Data & Civil ID */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <User className="w-5 h-5 text-[#0F766E] dark:text-teal-400" />
            <span>{isAr ? 'البيانات الشخصية والرقم المدني' : 'Personal Info & Civil ID'}</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* الاسم (رباعي) */}
            <div className="md:col-span-2">
              <label
                htmlFor="field-fullname"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'الاسم (رباعي)' : 'Full Name (4 words)'} <span className="text-red-500">*</span>
              </label>
              <input
                id="field-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={
                  isAr
                    ? 'أدخل الاسم الرباعي كاملاً كما هو مدون في الأوراق الرسمية...'
                    : 'Enter full name as shown on official documents...'
                }
                className="w-full min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {isAr
                  ? 'يشترط إدخال 4 كلمات على الأقل (مثال: محمد أحمد علي الكندري).'
                  : 'At least 4 words are required.'}
              </p>
            </div>

            {/* الرقم المدني (digits only) */}
            <div>
              <label
                htmlFor="field-unique-number"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'الرقم المدني' : 'Civil ID'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="field-unique-number"
                  type="text"
                  inputMode="numeric"
                  required
                  value={civilId}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setCivilId(val);
                  }}
                  placeholder={isAr ? 'أرقام فقط (مثال: 290010101234)' : 'Digits only (e.g. 290010101234)'}
                  className="w-full min-h-[44px] px-3.5 pe-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] font-mono tabular-nums text-sm"
                  dir="ltr"
                />
                <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {isAr
                  ? 'أرقام فقط بدون فواصل أو مسافات. يجب أن يكون فريداً وغير مكرر.'
                  : 'Digits only, no spaces or dashes. Must be unique.'}
              </p>
            </div>

            {/* تاريخ انتهاء الرقم المدني */}
            <div>
              <label
                htmlFor="field-unique-expiry"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'تاريخ انتهاء الرقم المدني' : 'Civil ID Expiry Date'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="field-unique-expiry"
                  type="date"
                  required
                  value={civilIdExpiry}
                  onChange={(e) => setCivilIdExpiry(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {isAr ? 'تاريخ انتهاء صلاحية البطاقة المدنية.' : 'Civil ID card expiration date.'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Passport & Nationality */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Globe className="w-5 h-5 text-[#0F766E] dark:text-teal-400" />
            <span>{isAr ? 'بيانات جواز السفر والجنسية' : 'Passport & Nationality'}</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="field-passport-number"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'رقم الجواز' : 'Passport Number'} <span className="text-red-500">*</span>
              </label>
              <input
                id="field-passport-number"
                type="text"
                required
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder={isAr ? 'أدخل رقم جواز السفر...' : 'Enter passport number...'}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] font-mono tabular-nums text-sm"
              />
            </div>

            <div className="relative" ref={nationalityDropdownRef}>
              <label
                htmlFor="field-nationality"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'الجنسية' : 'Nationality'} <span className="text-red-500">*</span>
              </label>
              <div
                onClick={() => setIsNationalityOpen(true)}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white flex items-center justify-between cursor-pointer text-sm hover:border-[#0F766E]"
              >
                <span>
                  {nationality || (isAr ? 'اختر الجنسية من القائمة...' : 'Select nationality...')}
                </span>
                <Globe className="w-4 h-4 text-slate-400" />
              </div>

              {isNationalityOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                    <input
                      type="text"
                      autoFocus
                      placeholder={isAr ? 'ابحث عن الجنسية...' : 'Search nationality...'}
                      value={nationalityQuery}
                      onChange={(e) => setNationalityQuery(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-[#0F766E]"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredNationalities.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 text-center">
                        {isAr ? 'لا توجد نتائج مطابقة' : 'No matching results'}
                      </div>
                    ) : (
                      filteredNationalities.map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => {
                            setNationality(item.name);
                            setIsNationalityOpen(false);
                            setNationalityQuery('');
                          }}
                          className={`w-full text-start px-4 py-2.5 text-xs hover:bg-teal-50 dark:hover:bg-teal-950/60 transition-colors flex items-center justify-between cursor-pointer ${
                            nationality === item.name
                              ? 'bg-teal-50 dark:bg-teal-950/80 font-bold text-[#0F766E] dark:text-teal-300'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <span>{item.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">{item.code}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="field-passport-issue"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'تاريخ إصدار الجواز' : 'Passport Issue Date'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="field-passport-issue"
                type="date"
                required
                value={passportIssueDate}
                onChange={(e) => setPassportIssueDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="field-passport-expiry"
                className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2"
              >
                {isAr ? 'تاريخ انتهاء الجواز' : 'Passport Expiry Date'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="field-passport-expiry"
                type="date"
                required
                value={passportExpiryDate}
                onChange={(e) => setPassportExpiryDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {isAr
                  ? 'يجب أن يكون تاريخ الانتهاء لاحقاً لتاريخ الإصدار.'
                  : 'Expiry date must be later than issue date.'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Document Attachments (4 slots) */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0F766E] dark:text-teal-400" />
              <span>
                {isAr ? 'المستندات والوثائق المرفقة (4 وثائق)' : 'Attached Documents (4 Slots)'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isAr
                ? 'الحد الأقصى لحجم كل ملف: 5 ميجابايت (JPG، PNG، PDF). تُحفظ الوثائق مشفرة في مجلد خاص.'
                : 'Max 5 MB per file (JPG, PNG, PDF). Stored encrypted in private storage.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {DOC_SLOTS.map((slot) => {
              const existing = existingDocs[slot.type];
              const pending = pendingFiles[slot.type];
              const label = isAr ? slot.labelAr : slot.labelEn;
              const description = isAr ? slot.descAr : slot.descEn;

              return (
                <div
                  key={slot.type}
                  className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">{label}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {description}
                      </p>
                    </div>

                    {pending ? (
                      <span className="text-[11px] font-bold text-teal-800 dark:text-teal-300 bg-teal-100 dark:bg-teal-950/70 px-2 py-0.5 rounded shrink-0">
                        {isAr ? 'جاهز للرفع' : 'Ready'}
                      </span>
                    ) : existing ? (
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                        <FileCheck className="w-3.5 h-3.5" />
                        {isAr ? 'تم الرفع' : 'Uploaded'}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                        {isAr ? 'غير مرفق' : 'Empty'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <label className="flex-1 flex items-center justify-center gap-2 min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors shadow-xs">
                      <Upload className="w-4 h-4 text-[#0F766E] dark:text-teal-400" />
                      <span>
                        {existing || pending
                          ? isAr
                            ? 'استبدال الملف'
                            : 'Replace File'
                          : isAr
                          ? 'اختيار ملف...'
                          : 'Choose File...'}
                      </span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          handleFileSelect(slot.type, file);
                        }}
                      />
                    </label>

                    {existing && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: label,
                            storagePath: existing.storage_path,
                          })
                        }
                        className="flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#0F766E] dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors cursor-pointer"
                        title={isAr ? 'معاينة آمنة برابط مشفر' : 'Secure preview'}
                      >
                        <Eye className="w-4 h-4" />
                        <span>{isAr ? 'معاينة' : 'Preview'}</span>
                      </button>
                    )}
                  </div>

                  {pending && (
                    <p
                      className="text-[11px] text-teal-700 dark:text-teal-400 mt-2 font-mono truncate"
                      dir="ltr"
                    >
                      {isAr ? 'الملف الجديد:' : 'New file:'} {pending.name} (
                      {(pending.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Notes */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[12px] shadow-xs space-y-4">
          <label
            htmlFor="field-notes"
            className="block text-sm font-semibold text-slate-700 dark:text-slate-200"
          >
            {isAr ? 'ملاحظات إضافية (اختياري)' : 'Additional Notes (Optional)'}
          </label>
          <textarea
            id="field-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isAr
                ? 'أدخل أي ملاحظات خاصة بالموظف أو الإجراءات الإدارية...'
                : 'Enter any notes regarding this person or administrative actions...'
            }
            className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
          />
        </div>

        {/* Bottom save actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 min-h-[44px] px-8 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {previewDoc && (
        <DocumentPreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.title}
          storagePath={previewDoc.storagePath}
        />
      )}
    </div>
  );
};

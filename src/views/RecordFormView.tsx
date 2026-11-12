/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRight,
  Save,
  X,
  Upload,
  FileCheck,
  Eye,
  AlertCircle,
  CheckCircle2,
  Calendar,
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

interface RecordFormViewProps {
  recordId?: string | null; // null for new record
  onBack: () => void;
  onSaved: () => void;
}

interface DocSlotConfig {
  type: DocType;
  label: string;
  description: string;
}

const DOC_SLOTS: DocSlotConfig[] = [
  { type: 'id_front', label: 'البطاقة المدنية (الوجه)', description: 'صورة الوجه الأمامي للبطاقة المدنية' },
  { type: 'id_back', label: 'البطاقة المدنية (الظهر)', description: 'صورة الوجه الخلفي للبطاقة المدنية' },
  { type: 'passport', label: 'جواز السفر', description: 'صفحة البيانات الرئيسية لجواز السفر' },
  { type: 'pam', label: 'اعتماد التوقيع (PAM)', description: 'شهادة اعتماد التوقيع أو إذن العمل' },
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

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [uniqueNumber, setUniqueNumber] = useState('');
  const [uniqueNumberExpiry, setUniqueNumberExpiry] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [nationality, setNationality] = useState('');
  const [passportIssueDate, setPassportIssueDate] = useState('');
  const [passportExpiryDate, setPassportExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  // Nationality search state
  const [nationalityQuery, setNationalityQuery] = useState('');
  const [isNationalityOpen, setIsNationalityOpen] = useState(false);
  const nationalityDropdownRef = useRef<HTMLDivElement>(null);

  // Documents state: existing uploaded documents and newly selected local files
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

  // UI States
  const [loadingRecord, setLoadingRecord] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<{ title: string; storagePath: string } | null>(null);

  // Close nationality dropdown when clicked outside
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

  // Load existing record and documents if editing
  useEffect(() => {
    if (!recordId) return;

    async function loadData() {
      setLoadingRecord(true);
      setErrorMessage(null);
      try {
        // 1. Fetch record from records table
        const { data: recordData, error: recordErr } = await supabase
          .from('records')
          .select('*')
          .eq('id', recordId)
          .single();

        if (recordErr) throw recordErr;

        if (recordData) {
          setFullName(recordData.full_name || recordData.name || '');
          setUniqueNumber(recordData.unique_number || '');
          setUniqueNumberExpiry(
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

        // 2. Fetch existing documents for this record
        // Columns strictly: id, record_id, doc_type, storage_path, uploaded_at
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
        setErrorMessage(translateErrorMessage(err));
      } finally {
        setLoadingRecord(false);
      }
    }

    loadData();
  }, [recordId]);

  // Filtered nationalities list
  const filteredNationalities = useMemo(() => {
    if (!nationalityQuery.trim()) return ARABIC_NATIONALITIES;
    return ARABIC_NATIONALITIES.filter((n) =>
      n.name.includes(nationalityQuery.trim())
    );
  }, [nationalityQuery]);

  // Handle local file selection with strict 5MB and extension validation
  const handleFileSelect = (docType: DocType, file: File | null) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(`الملف (${file.name}) يتجاوز الحد الأقصى المسموح به وهو 5 ميجابايت.`);
      return;
    }

    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExt) && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrorMessage(`نوع الملف (${file.name}) غير مدعوم. الصيغ المسموحة هي: JPG أو PNG أو PDF فقط.`);
      return;
    }

    setErrorMessage(null);
    setPendingFiles((prev) => ({ ...prev, [docType]: file }));
  };

  // Validation function with Arabic messages
  const validateForm = (): string | null => {
    // 1. Name must have at least 4 words (الاسم رباعي)
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) {
      return 'يجب إدخال الاسم الرباعي كاملاً (4 كلمات على الأقل).';
    }

    // 2. Unique number: digits only
    if (!uniqueNumber.trim()) {
      return 'الرقم المميز مطلوب.';
    }
    if (!/^\d+$/.test(uniqueNumber.trim())) {
      return 'يجب أن يتكون الرقم المميز من أرقام فقط بدون حروف أو رموز.';
    }

    // 3. Unique number expiry date required
    if (!uniqueNumberExpiry) {
      return 'يرجى تحديد تاريخ انتهاء الرقم المميز.';
    }

    // 4. Passport number required
    if (!passportNumber.trim()) {
      return 'يرجى إدخال رقم جواز السفر.';
    }

    // 5. Nationality required
    if (!nationality.trim()) {
      return 'يرجى اختيار الجنسية من القائمة.';
    }

    // 6. Passport dates required
    if (!passportIssueDate) {
      return 'يرجى تحديد تاريخ إصدار جواز السفر.';
    }
    if (!passportExpiryDate) {
      return 'يرجى تحديد تاريخ انتهاء جواز السفر.';
    }

    // 7. Passport expiry must be after issue date
    if (!isPassportExpiryValid(passportIssueDate, passportExpiryDate)) {
      return 'تاريخ انتهاء جواز السفر يجب أن يكون بعد تاريخ الإصدار.';
    }

    return null;
  };

  // Submit Handler
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
      // Step A: Upsert/Insert record in records table
      const targetRecordId = recordId || crypto.randomUUID();

      // Normalize record payload
      const recordPayload = {
        id: targetRecordId,
        full_name: fullName.trim(),
        name: fullName.trim(), // support both common column names
        unique_number: uniqueNumber.trim(),
        unique_number_expiry_date: uniqueNumberExpiry,
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
        const { error } = await supabase
          .from('records')
          .insert({
            ...recordPayload,
            created_at: new Date().toISOString(),
          });
        saveRecordError = error;
      }

      if (saveRecordError) {
        throw saveRecordError;
      }

      // Step B: Upload pending documents to private storage bucket 'documents'
      // Path: records/{record_id}/{doc_type}.{ext}
      // Save row in documents table via upsert on (record_id, doc_type)
      // Columns strictly: id, record_id, doc_type, storage_path, uploaded_at
      const docTypeKeys = Object.keys(pendingFiles) as DocType[];

      for (const docType of docTypeKeys) {
        const file = pendingFiles[docType];
        if (!file) continue;

        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const storagePath = `records/${targetRecordId}/${docType}.${fileExt}`;

        // 1. Upload to Supabase Storage bucket 'documents' (private)
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, {
            upsert: true,
            contentType: file.type,
          });

        if (uploadErr) {
          console.error(`Failed to upload ${docType}:`, uploadErr);
          throw new Error(`فشل رفع وثيقة ${docType}: ${uploadErr.message}`);
        }

        // 2. Upsert row in documents table
        // Strictly use columns: record_id, doc_type, storage_path, uploaded_at
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

      setSuccessToast(isEditing ? 'تم تحديث السجل بنجاح!' : 'تم إنشاء السجل والوثائق بنجاح!');
      setTimeout(() => {
        onSaved();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(translateErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loadingRecord) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-[#E2E8F0] p-12">
        <div className="w-8 h-8 border-3 border-[#0F766E]/30 border-t-[#0F766E] rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">جاري تحميل بيانات السجل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-5 py-3.5 bg-emerald-800 text-white rounded-xl shadow-xl border border-emerald-700 animate-fade-in text-sm font-bold">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-[#E2E8F0] rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
            title="الرجوع إلى القائمة"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {isEditing ? 'تعديل بيانات السجل' : 'إضافة سجل جديد'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              أدخل البيانات الأساسية وأرفق الوثائق الرسمية المطلوبة بدقة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            إلغاء
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
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>حفظ السجل</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-4 bg-[#FEE2E2] border border-[#FECACA] rounded-xl text-sm text-red-900">
          <AlertCircle className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Section 1: Main Persona Data */}
        <div className="p-6 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-5 h-5 text-[#0F766E]" />
            <span>البيانات الشخصية والرقم المميز</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* الاسم (رباعي) */}
            <div className="md:col-span-2">
              <label htmlFor="field-fullname" className="block text-sm font-semibold text-slate-700 mb-2">
                الاسم (رباعي) <span className="text-red-500">*</span>
              </label>
              <input
                id="field-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="أدخل الاسم الرباعي كاملاً كما هو مدون في الأوراق الرسمية..."
                className="w-full min-h-[44px] px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                يشترط إدخال 4 كلمات على الأقل (مثال: محمد أحمد علي الكندري).
              </p>
            </div>

            {/* الرقم المميز (digits only) */}
            <div>
              <label htmlFor="field-unique-number" className="block text-sm font-semibold text-slate-700 mb-2">
                الرقم المميز <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="field-unique-number"
                  type="text"
                  inputMode="numeric"
                  required
                  value={uniqueNumber}
                  onChange={(e) => {
                    // Only allow digits
                    const val = e.target.value.replace(/\D/g, '');
                    setUniqueNumber(val);
                  }}
                  placeholder="أرقام فقط (مثال: 290010101234)"
                  className="w-full min-h-[44px] px-3.5 pr-10 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] font-mono tabular-nums text-sm"
                  dir="ltr"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                أرقام فقط بدون فواصل أو مسافات. يجب أن يكون فريداً وغير مكرر.
              </p>
            </div>

            {/* تاريخ انتهاء الرقم المميز */}
            <div>
              <label htmlFor="field-unique-expiry" className="block text-sm font-semibold text-slate-700 mb-2">
                تاريخ انتهاء الرقم المميز <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="field-unique-expiry"
                  type="date"
                  required
                  value={uniqueNumberExpiry}
                  onChange={(e) => setUniqueNumberExpiry(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">تاريخ انتهاء صلاحية البطاقة المدنية.</p>
            </div>
          </div>
        </div>

        {/* Section 2: Passport & Nationality */}
        <div className="p-6 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Globe className="w-5 h-5 text-[#0F766E]" />
            <span>بيانات جواز السفر والجنسية</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* رقم الجواز (free text) */}
            <div>
              <label htmlFor="field-passport-number" className="block text-sm font-semibold text-slate-700 mb-2">
                رقم الجواز <span className="text-red-500">*</span>
              </label>
              <input
                id="field-passport-number"
                type="text"
                required
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="أدخل رقم جواز السفر..."
                className="w-full min-h-[44px] px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] font-mono tabular-nums text-sm"
              />
            </div>

            {/* الجنسية (Searchable dropdown) */}
            <div className="relative" ref={nationalityDropdownRef}>
              <label htmlFor="field-nationality" className="block text-sm font-semibold text-slate-700 mb-2">
                الجنسية <span className="text-red-500">*</span>
              </label>
              <div
                onClick={() => setIsNationalityOpen(true)}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 flex items-center justify-between cursor-pointer text-sm hover:border-[#0F766E]"
              >
                <span>{nationality || 'اختر الجنسية من القائمة...'}</span>
                <Globe className="w-4 h-4 text-slate-400" />
              </div>

              {/* Dropdown panel */}
              {isNationalityOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      type="text"
                      autoFocus
                      placeholder="ابحث عن الجنسية..."
                      value={nationalityQuery}
                      onChange={(e) => setNationalityQuery(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#0F766E]"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
                    {filteredNationalities.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 text-center">لا توجد نتائج مطابقة</div>
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
                          className={`w-full text-right px-4 py-2.5 text-xs hover:bg-teal-50 transition-colors flex items-center justify-between ${
                            nationality === item.name ? 'bg-teal-50 font-bold text-[#0F766E]' : 'text-slate-700'
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

            {/* تاريخ إصدار الجواز */}
            <div>
              <label htmlFor="field-passport-issue" className="block text-sm font-semibold text-slate-700 mb-2">
                تاريخ إصدار الجواز <span className="text-red-500">*</span>
              </label>
              <input
                id="field-passport-issue"
                type="date"
                required
                value={passportIssueDate}
                onChange={(e) => setPassportIssueDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
              />
            </div>

            {/* تاريخ انتهاء الجواز */}
            <div>
              <label htmlFor="field-passport-expiry" className="block text-sm font-semibold text-slate-700 mb-2">
                تاريخ انتهاء الجواز <span className="text-red-500">*</span>
              </label>
              <input
                id="field-passport-expiry"
                type="date"
                required
                value={passportExpiryDate}
                onChange={(e) => setPassportExpiryDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                يجب أن يكون تاريخ الانتهاء لاحقاً لتاريخ الإصدار.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Document Attachments (4 slots) */}
        <div className="p-6 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0F766E]" />
              <span>المستندات والوثائق المرفقة (4 وثائق)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              الحد الأقصى لحجم كل ملف: 5 ميجابايت (JPG، PNG، PDF). تُحفظ الوثائق مشفرة في مجلد خاص.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {DOC_SLOTS.map((slot) => {
              const existing = existingDocs[slot.type];
              const pending = pendingFiles[slot.type];

              return (
                <div
                  key={slot.type}
                  className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{slot.label}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{slot.description}</p>
                    </div>

                    {/* Status badge */}
                    {pending ? (
                      <span className="text-[11px] font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                        جاهز للرفع
                      </span>
                    ) : existing ? (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                        <FileCheck className="w-3.5 h-3.5" />
                        تم الرفع
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded">
                        غير مرفق
                      </span>
                    )}
                  </div>

                  {/* Actions & File Input */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                    <label className="flex-1 flex items-center justify-center gap-2 min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors shadow-xs">
                      <Upload className="w-4 h-4 text-[#0F766E]" />
                      <span>{existing || pending ? 'استبدال الملف' : 'اختيار ملف...'}</span>
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

                    {/* Preview Button for existing uploaded file */}
                    {existing && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: slot.label,
                            storagePath: existing.storage_path,
                          })
                        }
                        className="flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#0F766E] bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer"
                        title="معاينة آمنة برابط مشفر"
                      >
                        <Eye className="w-4 h-4" />
                        <span>معاينة</span>
                      </button>
                    )}
                  </div>

                  {/* Pending file name note */}
                  {pending && (
                    <p className="text-[11px] text-teal-700 mt-2 font-mono truncate" dir="ltr">
                      الملف الجديد: {pending.name} ({(pending.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Notes (Optional) */}
        <div className="p-6 bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs space-y-4">
          <label htmlFor="field-notes" className="block text-sm font-semibold text-slate-700">
            ملاحظات إضافية (اختياري)
          </label>
          <textarea
            id="field-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أدخل أي ملاحظات خاصة بالموظف أو الإجراءات الإدارية..."
            className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-[#0F766E] text-sm"
          />
        </div>

        {/* Bottom save actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 min-h-[44px] px-8 py-2.5 bg-[#0F766E] hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>حفظ التعديلات</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Interactive Document Preview Modal */}
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

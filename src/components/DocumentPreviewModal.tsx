/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, RefreshCw, Download, FileText, AlertCircle } from 'lucide-react';
import { getSignedDocumentUrl } from '../lib/supabase';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  storagePath?: string | null;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  storagePath,
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const isPdf = storagePath ? storagePath.toLowerCase().endsWith('.pdf') : false;

  const fetchSignedUrl = useCallback(async () => {
    if (!storagePath) return;
    setLoading(true);
    setError(null);
    setSecondsRemaining(60);

    const { url, error: err } = await getSignedDocumentUrl(storagePath, 60);
    setLoading(false);

    if (err || !url) {
      setError('تعذر إنشاء رابط المعاينة الآمن أو انتهت صلاحيته.');
    } else {
      setSignedUrl(url);
    }
  }, [storagePath]);

  useEffect(() => {
    if (isOpen && storagePath) {
      setZoom(1);
      setRotation(0);
      fetchSignedUrl();
    } else {
      setSignedUrl(null);
    }
  }, [isOpen, storagePath, fetchSignedUrl]);

  // 60-second countdown timer for signed URL
  useEffect(() => {
    if (!isOpen || !signedUrl) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, signedUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 text-[#0F766E] rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 font-mono" dir="ltr">
                {storagePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Countdown & Refresh badge */}
            <div className="flex items-center gap-2 px-3 py-1 text-xs bg-slate-100 rounded-lg text-slate-600">
              <span>صلاحية الرابط:</span>
              <span className={`font-mono tabular-nums font-bold ${secondsRemaining <= 10 ? 'text-red-600' : 'text-slate-800'}`}>
                {secondsRemaining} ثانية
              </span>
              <button
                type="button"
                onClick={fetchSignedUrl}
                title="تحديث الرابط الآمن"
                className="p-1 hover:text-[#0F766E] transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {signedUrl && (
              <a
                href={signedUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>تحميل</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zoom & Rotation Controls for images */}
        {!isPdf && signedUrl && !error && (
          <div className="flex items-center justify-center gap-4 py-2 bg-slate-100 border-b border-slate-200 text-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50"
            >
              <ZoomOut className="w-3.5 h-3.5" />
              <span>تصغير</span>
            </button>
            <span className="font-mono tabular-nums font-semibold">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>تكبير</span>
            </button>
            <div className="h-4 w-px bg-slate-300" />
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>تدوير</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setRotation(0);
              }}
              className="px-2.5 py-1 text-slate-500 hover:text-slate-800"
            >
              إعادة ضبط
            </button>
          </div>
        )}

        {/* Body Viewer */}
        <div className="relative flex-1 flex items-center justify-center p-4 bg-slate-900/5 min-h-[400px] overflow-auto">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E]" />
              <p className="text-sm font-medium">جاري إنشاء رابط المعاينة الآمن...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 p-6 text-center max-w-md">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-semibold text-slate-800">{error}</p>
              <button
                type="button"
                onClick={fetchSignedUrl}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-teal-800 transition-colors"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {!loading && !error && signedUrl && (
            <>
              {isPdf ? (
                <iframe
                  src={signedUrl}
                  title={title}
                  className="w-full h-[65vh] border-0 rounded-lg bg-white shadow-inner"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full min-h-[350px] overflow-auto">
                  <img
                    src={signedUrl}
                    alt={title}
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: 'transform 0.15s ease-out',
                    }}
                    className="max-h-[65vh] max-w-full object-contain rounded shadow-md select-none"
                  />
                </div>
              )}
            </>
          )}

          {!loading && !error && !signedUrl && (
            <p className="text-sm text-slate-500">لا يوجد ملف متاح للمعاينة.</p>
          )}
        </div>

        {/* Footer info note */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>الرابط مشفر وخاص، وينتهي تلقائياً بعد 60 ثانية لحماية خصوصية الوثائق.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

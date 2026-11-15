/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, RefreshCw, Download, FileText, AlertCircle } from 'lucide-react';
import { getSignedDocumentUrl } from '../lib/supabase';
import { usePreferences } from '../context/PreferencesContext';

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
  const { lang } = usePreferences();
  const isAr = lang === 'ar';

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const lowerPath = storagePath ? storagePath.toLowerCase() : '';
  const isPdf = lowerPath.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(lowerPath);

  const fetchSignedUrl = useCallback(async () => {
    if (!storagePath) return;
    setLoading(true);
    setError(null);
    setSecondsRemaining(60);

    const { url, error: err } = await getSignedDocumentUrl(storagePath, 60);
    setLoading(false);

    if (err || !url) {
      setError(
        isAr
          ? 'تعذر إنشاء رابط المعاينة الآمن أو انتهت صلاحيته.'
          : 'Failed to generate secure preview URL or it has expired.'
      );
    } else {
      setSignedUrl(url);
    }
  }, [storagePath, isAr]);

  useEffect(() => {
    if (isOpen && storagePath) {
      setZoom(1);
      setRotation(0);
      fetchSignedUrl();
    } else {
      setSignedUrl(null);
    }
  }, [isOpen, storagePath, fetchSignedUrl]);

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
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/60 text-[#0F766E] dark:text-teal-400 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono" dir="ltr">
                {storagePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1 text-xs bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
              <span>{isAr ? 'صلاحية الرابط:' : 'Expires in:'}</span>
              <span
                className={`font-mono tabular-nums font-bold ${
                  secondsRemaining <= 10
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                {secondsRemaining} {isAr ? 'ثانية' : 's'}
              </span>
              <button
                type="button"
                onClick={fetchSignedUrl}
                title={isAr ? 'تحديث الرابط الآمن' : 'Refresh secure link'}
                className="p-1 hover:text-[#0F766E] dark:hover:text-teal-400 transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{isAr ? 'تحميل' : 'Download'}</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zoom & Rotation Controls */}
        {isImage && signedUrl && !error && (
          <div className="flex items-center justify-center gap-4 py-2 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصغير' : 'Zoom Out'}</span>
            </button>
            <span className="font-mono tabular-nums font-semibold">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>{isAr ? 'تكبير' : 'Zoom In'}</span>
            </button>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{isAr ? 'تدوير' : 'Rotate'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setRotation(0);
              }}
              className="px-2.5 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              {isAr ? 'إعادة ضبط' : 'Reset'}
            </button>
          </div>
        )}

        {/* Body Viewer */}
        <div className="relative flex-1 flex items-center justify-center p-4 bg-slate-900/5 dark:bg-slate-950/60 min-h-[400px] overflow-auto">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E] dark:text-teal-400" />
              <p className="text-sm font-medium">
                {isAr ? 'جاري إنشاء رابط المعاينة الآمن...' : 'Generating secure preview URL...'}
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 p-6 text-center max-w-md">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{error}</p>
              <button
                type="button"
                onClick={fetchSignedUrl}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
              >
                {isAr ? 'إعادة المحاولة' : 'Try Again'}
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
              ) : isImage ? (
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
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="p-4 bg-teal-50 dark:bg-teal-950/60 text-[#0F766E] dark:text-teal-400 rounded-2xl">
                    <FileText className="w-10 h-10" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900 dark:text-white mb-1">
                      {title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isAr
                        ? 'هذا النوع من الملفات غير قابل للعرض المباشر داخل المتصفح. يمكنك تحميله الآن.'
                        : 'This file type cannot be previewed inline. You can download it below.'}
                    </p>
                  </div>
                  <a
                    href={signedUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#0F766E] hover:bg-teal-800 rounded-xl shadow-xs transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isAr ? 'تحميل الملف' : 'Download File'}</span>
                  </a>
                </div>
              )}
            </>
          )}

          {!loading && !error && !signedUrl && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isAr ? 'لا يوجد ملف متاح للمعاينة.' : 'No file available for preview.'}
            </p>
          )}
        </div>

        {/* Footer info note */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>
            {isAr
              ? 'الرابط مشفر وخاص، وينتهي تلقائياً بعد 60 ثانية لحماية خصوصية الوثائق.'
              : 'Private encrypted URL — expires automatically after 60 seconds.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

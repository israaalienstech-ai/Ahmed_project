/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const COMPRESS_THRESHOLD_BYTES = 350 * 1024; // Only compress images larger than 350 KB
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Compresses large JPEG/PNG/WebP images client-side before upload so high-res
 * camera photos upload in < 1 second instead of timing out or hanging.
 * Non-image files (PDF, Word, Excel, etc.) and small images are returned untouched.
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Skip SVGs, GIFs, and already-small images
  if (
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    file.size <= COMPRESS_THRESHOLD_BYTES
  ) {
    return file;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to decode image'));
        image.src = objectUrl;
      });

      let { width, height } = img;
      if (width <= 0 || height <= 0) return file;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;

      // White background ensures transparent PNGs convert cleanly to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      );

      if (!blob || blob.size >= file.size) {
        return file;
      }

      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return new File([blob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return file;
  }
}

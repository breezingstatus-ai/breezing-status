// Client-side high-fidelity media processing engine

import { WatermarkSettings } from '../types';

/**
 * Loads an image file safely into an HTMLImageElement
 */
export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file. The format may be unsupported or corrupted.'));
    };
    img.src = url;
  });
}

/**
 * Loads a watermark image from a URL or data URL
 */
export async function loadWatermarkImage(logoUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback to minimal programmatic watermark icon if logo URL fails to load
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#173B2A';
        ctx.roundRect(0, 0, 240, 64, 12);
        ctx.fill();
        ctx.fillStyle = '#58C994';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('breezing HD', 20, 38);
      }
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.src = canvas.toDataURL();
    };
    img.src = logoUrl;
  });
}

/**
 * Applies a gentle unsharp mask sharpening filter using a 3x3 convolution kernel
 * Subtle enhancement without halo artifacts or noisy edges
 */
function applyGentleSharpen(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number = 0.22) {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const src = imgData.data;
    const output = ctx.createImageData(width, height);
    const dst = output.data;

    // Kernel:
    // [  0,   -a,   0  ]
    // [ -a, 1+4a,  -a  ]
    // [  0,   -a,   0  ]
    const center = 1 + 4 * amount;
    const neg = -amount;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          const top = src[((y - 1) * width + x) * 4 + c];
          const bottom = src[((y + 1) * width + x) * 4 + c];
          const left = src[(y * width + (x - 1)) * 4 + c];
          const right = src[(y * width + (x + 1)) * 4 + c];
          const mid = src[idx + c];

          const val = mid * center + (top + bottom + left + right) * neg;
          dst[idx + c] = Math.min(255, Math.max(0, val));
        }
        dst[idx + 3] = src[idx + 3]; // Alpha unchanged
      }
    }

    // Copy border pixels directly to avoid edge distortion
    for (let x = 0; x < width; x++) {
      const topIdx = x * 4;
      const botIdx = ((height - 1) * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        dst[topIdx + c] = src[topIdx + c];
        dst[botIdx + c] = src[botIdx + c];
      }
    }
    for (let y = 0; y < height; y++) {
      const leftIdx = (y * width) * 4;
      const rightIdx = (y * width + (width - 1)) * 4;
      for (let c = 0; c < 4; c++) {
        dst[leftIdx + c] = src[leftIdx + c];
        dst[rightIdx + c] = src[rightIdx + c];
      }
    }

    ctx.putImageData(output, 0, 0);
  } catch (err) {
    // If browser security restricts getImageData (e.g. cross-origin canvas), safely bypass
    console.warn('Canvas sharpening bypassed due to security context', err);
  }
}

/**
 * Renders watermark overlay onto the canvas based on configurable placement
 */
function renderWatermark(
  ctx: CanvasRenderingContext2D,
  watermarkImg: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  settings: WatermarkSettings
) {
  const { position, relative_size, opacity, padding_pixels } = settings;

  // Scale watermark proportionally to image width
  const wmAspect = watermarkImg.width / (watermarkImg.height || 1);
  const targetWidth = Math.max(80, Math.min(canvasWidth * relative_size, 450));
  const targetHeight = targetWidth / wmAspect;

  let x = padding_pixels;
  let y = padding_pixels;

  switch (position) {
    case 'bottom-right':
      x = canvasWidth - targetWidth - padding_pixels;
      y = canvasHeight - targetHeight - padding_pixels;
      break;
    case 'bottom-left':
      x = padding_pixels;
      y = canvasHeight - targetHeight - padding_pixels;
      break;
    case 'top-right':
      x = canvasWidth - targetWidth - padding_pixels;
      y = padding_pixels;
      break;
    case 'top-left':
      x = padding_pixels;
      y = padding_pixels;
      break;
    case 'center':
      x = (canvasWidth - targetWidth) / 2;
      y = (canvasHeight - targetHeight) / 2;
      break;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0.1, Math.min(1.0, opacity));
  ctx.drawImage(watermarkImg, x, y, targetWidth, targetHeight);
  ctx.restore();
}

/**
 * Processes a photograph for WhatsApp Status:
 * - Preserves original width & height
 * - Gentle sharpening
 * - Watermark overlay (if required)
 * - High quality JPEG (0.95 quality)
 * - Strips sensitive metadata
 */
export async function processStatusPhotograph(
  file: File,
  watermarkSettings: WatermarkSettings,
  applyWatermark: boolean,
  onProgress?: (step: string) => void
): Promise<{ blob: Blob; width: number; height: number; previewUrl: string }> {
  onProgress?.('Reading image');
  const img = await loadImageFromFile(file);

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // Use OffscreenCanvas or standard Canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Unable to initialize canvas rendering context.');
  }

  onProgress?.('Preparing image canvas');
  ctx.drawImage(img, 0, 0, width, height);

  onProgress?.('Enhancing HD sharpness');
  // Gentle subtle sharpening
  applyGentleSharpen(ctx, width, height, 0.22);

  if (applyWatermark) {
    onProgress?.('Adding configured watermark');
    try {
      const wmImg = await loadWatermarkImage(watermarkSettings.logo_url);
      renderWatermark(ctx, wmImg, width, height, watermarkSettings);
    } catch (wmErr) {
      console.warn('Watermark rendering skipped due to error:', wmErr);
    }
  }

  onProgress?.('Exporting pristine HD JPEG');
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to generate JPEG blob from canvas.'));
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        resolve({
          blob,
          width,
          height,
          previewUrl,
        });
      },
      'image/jpeg',
      0.95 // JPEG output quality ~0.95 as mandated
    );
  });
}

/**
 * Validates and inspects video files
 */
export async function inspectVideoFile(
  file: File,
  maxSizeMb: number = 20,
  maxDurationSeconds: number = 60
): Promise<{ duration: number; width: number; height: number; posterUrl: string }> {
  // Check size first
  const fileMb = file.size / (1024 * 1024);
  if (fileMb > maxSizeMb) {
    throw new Error(`Video file size (${fileMb.toFixed(1)} MB) exceeds the package limit of ${maxSizeMb} MB.`);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (duration > maxDurationSeconds) {
        URL.revokeObjectURL(url);
        reject(
          new Error(
            `Video duration (${Math.round(duration)}s) exceeds maximum allowed duration of ${maxDurationSeconds}s.`
          )
        );
        return;
      }

      // Seek to 1s to capture poster
      video.currentTime = Math.min(1, duration / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const posterUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            posterUrl,
          });
        } else {
          resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            posterUrl: url,
          });
        }
      } catch (err) {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          posterUrl: url,
        });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read or decode video file. Please ensure it is a supported MP4 or WebM video.'));
    };

    video.src = url;
  });
}

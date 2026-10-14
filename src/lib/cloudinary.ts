// Cloudinary Media Storage Integration
// Production media uploader supporting direct unsigned preset and signed Supabase edge function flows.

import { supabase, isSupabaseConfigured } from './supabase';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  format: string;
  asset_id?: string;
  isSimulated?: boolean;
}

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'scaycidy';
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';

export const isCloudinaryConfigured = (): boolean => {
  return Boolean(
    cloudName &&
    !cloudName.includes('your-cloud-name')
  );
};

/**
 * Uploads an image or video to Cloudinary.
 * Uses real Cloudinary API with progress tracking.
 * Throws genuine errors on network, configuration, or API rejection.
 */
export async function uploadToCloudinary(
  fileOrBlob: File | Blob,
  resourceType: 'image' | 'video' = 'image',
  fileName: string = 'media_asset',
  onProgress?: (percent: number) => void,
  reservation?: { token: string; count: number; index?: number }
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Please define VITE_CLOUDINARY_CLOUD_NAME in your environment.'
    );
  }

  // 1. Direct Unsigned Upload Preset (if configured)
  if (!isSupabaseConfigured() && uploadPreset && !uploadPreset.includes('your-upload-preset')) {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
    const formData = new FormData();
    formData.append('file', fileOrBlob, fileName);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'breezing_hd_status');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve({
              public_id: res.public_id,
              secure_url: res.secure_url,
              bytes: res.bytes || fileOrBlob.size,
              width: res.width,
              height: res.height,
              duration: res.duration,
              format: res.format || (resourceType === 'image' ? 'jpg' : 'mp4'),
              asset_id: res.asset_id,
              isSimulated: false,
            });
          } catch (e: any) {
            reject(new Error(`Failed to parse Cloudinary response: ${e.message}`));
          }
        } else {
          let errText = 'Cloudinary upload failed';
          try {
            const errRes = JSON.parse(xhr.responseText);
            errText = errRes.error?.message || errText;
          } catch {}
          reject(new Error(`Cloudinary error (${xhr.status}): ${errText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during Cloudinary upload. Please check your connection.'));
      xhr.send(formData);
    });
  }

  // 2. Signed Upload via Supabase Edge Function (if available)
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Please sign in again before uploading media.');
      }
      const { data: signData, error: signError } = await supabase.functions.invoke('sign-cloudinary-upload', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { mediaType: resourceType, count: reservation?.count || 1, reservationToken: reservation?.token, assetIndex: reservation?.index ?? 0 },
      });

      if (signError) {
        const body = signError.context instanceof Response
          ? await signError.context.json().catch(() => null) : null;
        throw new Error(body?.error || signError.message);
      }
      if (!signData?.signature || !signData?.apiKey) {
        throw new Error(signData?.error || 'The upload service did not return signing credentials.');
      }

      if (!signError && signData?.signature && signData?.apiKey) {
        const url = `https://api.cloudinary.com/v1_1/${signData.cloudName || cloudName}/${resourceType}/upload`;
        const formData = new FormData();
        formData.append('file', fileOrBlob, fileName);
        formData.append('api_key', signData.apiKey);
        formData.append('timestamp', String(signData.timestamp));
        formData.append('signature', signData.signature);
        formData.append('folder', signData.folder);
        if (signData.publicId) {
          formData.append('public_id', signData.publicId);
          formData.append('overwrite', 'false');
          formData.append('allowed_formats', signData.allowedFormats);
        }

        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                resolve({
                  public_id: res.public_id,
                  secure_url: res.secure_url,
                  bytes: res.bytes || fileOrBlob.size,
                  width: res.width,
                  height: res.height,
                  duration: res.duration,
                  format: res.format || (resourceType === 'image' ? 'jpg' : 'mp4'),
                  asset_id: res.asset_id,
                  isSimulated: false,
                });
              } catch (e: any) {
                reject(new Error(`Failed to parse Cloudinary response: ${e.message}`));
              }
            } else {
              let errText = 'Signed Cloudinary upload failed';
              try {
                const errRes = JSON.parse(xhr.responseText);
                errText = errRes.error?.message || errText;
              } catch {}
              reject(new Error(`Cloudinary error (${xhr.status}): ${errText}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network connection error during Cloudinary upload.'));
          xhr.send(formData);
        });
      }
    } catch (e: any) {
      throw e;
    }
  }

  // If no upload preset is configured and signed flow cannot proceed, show genuine error
  throw new Error(
    'Cloudinary upload preset is missing. Please set VITE_CLOUDINARY_UPLOAD_PRESET in your environment settings (or deploy the Supabase sign-cloudinary-upload function).'
  );
}

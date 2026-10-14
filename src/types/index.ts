export type UserRole = 'customer' | 'admin';
export type MediaType = 'image' | 'video';
export type RequestStatus = 'pending' | 'processing' | 'downloaded' | 'sent' | 'failed' | 'expired';
export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'custom';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  whatsapp_number: string;
  country_code: string;
  whatsapp_consent: boolean;
  role: UserRole;
  package_id: string;
  package_expiry?: string | null;
  status: 'active' | 'suspended';
  avatar_url?: string | null;
  avatar_thumbnail_url?: string | null;
  theme_preference?: 'light' | 'dark';
  created_at: string;
  updated_at?: string;
}

export interface SubscriptionPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  monthly_pictures: number;
  monthly_videos: number;
  max_video_size_mb: number;
  max_video_duration_seconds?: number;
  watermark_required: boolean;
  description: string;
  is_active: boolean;
}

export interface UsageQuota {
  user_id: string;
  month_year: string;
  pictures_used: number;
  videos_used: number;
  pictures_reserved: number;
  videos_reserved: number;
  last_updated: string;
}

export interface MediaAsset {
  id: string;
  request_id: string;
  user_id: string;
  cloudinary_public_id: string;
  cloudinary_asset_id?: string;
  resource_type: MediaType;
  secure_url: string;
  thumbnail_url?: string;
  original_filename: string;
  file_size_bytes: number;
  width?: number;
  height?: number;
  duration_seconds?: number;
  format: string;
  is_deleted: boolean;
  expires_at: string;
  created_at: string;
}

export interface UploadRequest {
  id: string;
  request_code: string;
  user_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  package_id: string;
  package_name: string;
  media_type: MediaType;
  media_count: number;
  watermark_applied: boolean;
  status: RequestStatus;
  admin_notes?: string;
  expires_at: string;
  created_at: string;
  assets?: MediaAsset[];
}

export interface WatermarkSettings {
  id: number;
  logo_url: string;
  position: WatermarkPosition;
  relative_size: number; // e.g. 0.15 = 15% of image width
  opacity: number; // 0.1 to 1.0
  padding_pixels: number;
  enabled_for_free: boolean;
  offset_x_percent?: number;
  offset_y_percent?: number;
  updated_at?: string;
}

export interface ServiceNotice { key: string; title: string; message: string; }

export interface AppSettings {
  service_notice_key?: string;
  service_notices?: ServiceNotice[];
  id: number;
  app_name: string;
  service_available: boolean;
  maintenance_mode: boolean;
  delivery_estimate_text: string;
  delivery_estimate_busy_text: string;
  retention_hours: number;
  admin_email: string;
  email_alerts_enabled: boolean;
  official_whatsapp_number: string;
  official_contact_name: string;
  official_country_code: string;
  payment_demo_mode: boolean;
}

export interface PaymentRequest {
  id: string;
  user_id: string;
  package_id: string;
  package_name?: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference_number: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  customer_name?: string;
  is_demo?: boolean;
  created_at: string;
}

export interface AdminUserListItem extends UserProfile {
  requests_count: number;
  pictures_used: number;
  videos_used: number;
  pictures_allowed: number;
  videos_allowed: number;
}

export interface ProcessedMediaFile {
  file: File;
  previewUrl: string;
  originalWidth?: number;
  originalHeight?: number;
  processedBlob?: Blob;
  duration?: number;
  status: 'idle' | 'processing' | 'ready' | 'error';
  errorMessage?: string;
}

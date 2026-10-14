-- ==============================================================================
-- 01_initial_schema.sql
-- Breezing Status HD — Production Initial Database Schema
-- Run this FIRST in the Supabase SQL Editor on a fresh database.
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. User Profiles Table
-- Customer profiles linked 1:1 with auth.users.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    whatsapp_number TEXT NOT NULL DEFAULT '',
    country_code TEXT NOT NULL DEFAULT '+265',
    whatsapp_consent BOOLEAN NOT NULL DEFAULT false, -- Explicit customer consent required
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    package_id TEXT NOT NULL DEFAULT 'free',
    package_expiry TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    avatar_url TEXT,
    avatar_thumbnail_url TEXT,
    avatar_cloudinary_id TEXT, -- Preserved permanently; isolated from temporary 24h request media
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Protected Administrator Roles Table
-- The SOLE trusted authority for administrator capabilities.
-- profiles.role alone NEVER grants administrative access.
CREATE TABLE IF NOT EXISTS public.admin_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
    assigned_by TEXT NOT NULL DEFAULT 'system_provisioning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Subscription Packages Table
CREATE TABLE IF NOT EXISTS public.packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'MWK',
    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),
    monthly_pictures INTEGER NOT NULL DEFAULT 30 CHECK (monthly_pictures >= 0),
    monthly_videos INTEGER NOT NULL DEFAULT 2 CHECK (monthly_videos >= 0),
    max_video_size_mb INTEGER NOT NULL DEFAULT 20 CHECK (max_video_size_mb > 0),
    watermark_required BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Monthly Usage Quotas Table
-- Concurrency-safe monthly quota balances tracked in Africa/Blantyre timezone.
CREATE TABLE IF NOT EXISTS public.usage_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month_year TEXT NOT NULL, -- Format: YYYY-MM
    pictures_used INTEGER NOT NULL DEFAULT 0 CHECK (pictures_used >= 0),
    videos_used INTEGER NOT NULL DEFAULT 0 CHECK (videos_used >= 0),
    pictures_reserved INTEGER NOT NULL DEFAULT 0 CHECK (pictures_reserved >= 0),
    videos_reserved INTEGER NOT NULL DEFAULT 0 CHECK (videos_reserved >= 0),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_user_month UNIQUE (user_id, month_year)
);

-- 6. Quota Reservations Table (Idempotent Pre-Upload Ledger)
-- Prevents simultaneous-upload quota bypasses and repeated finalizations.
-- Explicitly links to the associated upload request when submitted.
CREATE TABLE IF NOT EXISTS public.quota_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    request_id UUID,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    count INTEGER NOT NULL CHECK (count > 0 AND count <= 50),
    month_year TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finalized', 'released', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '1 hour'),
    finalized_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Upload Requests Table
CREATE TABLE IF NOT EXISTS public.upload_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_code TEXT NOT NULL UNIQUE, -- e.g. 'BRZ-10842'
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reservation_token TEXT, -- Links back to the authorising quota reservation
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    package_id TEXT NOT NULL REFERENCES public.packages(id),
    package_name TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    media_count INTEGER NOT NULL DEFAULT 1 CHECK (media_count > 0),
    watermark_applied BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'downloaded', 'sent', 'failed', 'expired')),
    processing_stage INTEGER NOT NULL DEFAULT 1 CHECK (processing_stage BETWEEN 1 AND 6),
    verified_at TIMESTAMPTZ,
    enhanced_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    admin_notes TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Link quota reservations to upload requests with safe constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_quota_res_request'
    ) THEN
        ALTER TABLE public.quota_reservations 
            ADD CONSTRAINT fk_quota_res_request 
            FOREIGN KEY (request_id) REFERENCES public.upload_requests(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 8. Media Assets Table
-- Temporary customer uploads in Cloudinary. Purged automatically after 24 hours.
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.upload_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cloudinary_public_id TEXT NOT NULL,
    cloudinary_asset_id TEXT,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('image', 'video')),
    secure_url TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
    width INTEGER,
    height INTEGER,
    duration_seconds NUMERIC(6, 2),
    format TEXT NOT NULL DEFAULT 'jpg',
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deletion_status TEXT NOT NULL DEFAULT 'active' CHECK (deletion_status IN ('active', 'pending_deletion', 'deleted', 'failed')),
    deletion_attempts INTEGER NOT NULL DEFAULT 0,
    last_deletion_error TEXT,
    deleted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Manual Payment Requests Table
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL REFERENCES public.packages(id),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'MWK',
    payment_method TEXT NOT NULL, -- e.g. 'Airtel Money', 'Mpamba', 'Bank Transfer'
    reference_number TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. Watermark Settings Table (Single global row)
CREATE TABLE IF NOT EXISTS public.watermark_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    logo_url TEXT NOT NULL DEFAULT '/watermark-logo.png',
    position TEXT NOT NULL DEFAULT 'bottom-right' CHECK (position IN ('bottom-right', 'bottom-left', 'top-right', 'top-left', 'center')),
    relative_size NUMERIC(4, 2) NOT NULL DEFAULT 0.15,
    opacity NUMERIC(3, 2) NOT NULL DEFAULT 0.85,
    padding_pixels INTEGER NOT NULL DEFAULT 32,
    enabled_for_free BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. Application Settings Table (Public-Safe Configuration)
-- Exposes public operational flags, delivery estimates, and official WhatsApp contact.
-- Contains NO confidential administrator emails or internal notification routing.
CREATE TABLE IF NOT EXISTS public.app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    app_name TEXT NOT NULL DEFAULT 'breezing status HD',
    service_available BOOLEAN NOT NULL DEFAULT true,
    maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    delivery_estimate_text TEXT NOT NULL DEFAULT 'Usually ready in 5–10 minutes. Please allow up to 1 hour.',
    delivery_estimate_busy_text TEXT NOT NULL DEFAULT 'High traffic. Delivery may take 20–45 minutes.',
    retention_hours INTEGER NOT NULL DEFAULT 24 CHECK (retention_hours > 0),
    official_whatsapp_number TEXT NOT NULL DEFAULT '+265 99 374 1274',
    official_contact_name TEXT NOT NULL DEFAULT 'Breezing Status HD',
    official_country_code TEXT NOT NULL DEFAULT '+265',
    payment_demo_mode BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11b. Administrator Private Settings Table (Administrator-Only)
-- Confidentially isolates administrator alert emails and operational notification configuration.
CREATE TABLE IF NOT EXISTS public.admin_private_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    admin_email TEXT NOT NULL DEFAULT 'breezingstatus@gmail.com',
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11c. Public-Safe Settings View Interface
-- Clean, secure interface for anonymous visitors and customers.
CREATE OR REPLACE VIEW public.public_app_settings WITH (security_invoker = false) AS
SELECT 
    id,
    app_name,
    service_available,
    maintenance_mode,
    delivery_estimate_text,
    delivery_estimate_busy_text,
    retention_hours,
    official_whatsapp_number,
    official_contact_name,
    official_country_code,
    payment_demo_mode,
    updated_at
FROM public.app_settings
WHERE id = 1;

-- Forward declaration of is_admin helper to allow secure view creation with invoker checks in script 01.
-- Fully defined and secured with admin_roles table lookup in script 02.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT false;
$$;

-- 11d. Administrator Unified Settings View
-- Combines public application settings and private admin channels for administrators.
-- Uses security_invoker = true so PostgreSQL invokes the view with the querying user's security context.
-- In addition, includes an explicit WHERE public.is_admin() filter so non-administrators cannot read admin_email or private settings.
CREATE OR REPLACE VIEW public.admin_full_settings WITH (security_invoker = true) AS
SELECT 
    s.id,
    s.app_name,
    s.service_available,
    s.maintenance_mode,
    s.delivery_estimate_text,
    s.delivery_estimate_busy_text,
    s.retention_hours,
    p.admin_email,
    p.email_alerts_enabled,
    s.official_whatsapp_number,
    s.official_contact_name,
    s.official_country_code,
    s.payment_demo_mode,
    s.updated_at
FROM public.app_settings s
LEFT JOIN public.admin_private_settings p ON p.id = s.id
WHERE s.id = 1 AND public.is_admin();

-- 12. Notification Logs Table
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID REFERENCES public.upload_requests(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. Administrator Audit Logs Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 14. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp ON public.profiles(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

CREATE INDEX IF NOT EXISTS idx_admin_roles_email ON public.admin_roles(email);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON public.admin_roles(role);

CREATE INDEX IF NOT EXISTS idx_quota_res_user ON public.quota_reservations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quota_res_token ON public.quota_reservations(reservation_token);
CREATE INDEX IF NOT EXISTS idx_quota_res_request ON public.quota_reservations(request_id);
CREATE INDEX IF NOT EXISTS idx_quota_res_expiry ON public.quota_reservations(expires_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_upload_requests_user ON public.upload_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_requests_token ON public.upload_requests(reservation_token);
CREATE INDEX IF NOT EXISTS idx_upload_requests_status ON public.upload_requests(status);
CREATE INDEX IF NOT EXISTS idx_upload_requests_created ON public.upload_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_requests_expires ON public.upload_requests(expires_at) WHERE status != 'expired';

CREATE INDEX IF NOT EXISTS idx_media_assets_request ON public.media_assets(request_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_user ON public.media_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_cleanup ON public.media_assets(expires_at) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_media_assets_del_status ON public.media_assets(deletion_status);

CREATE INDEX IF NOT EXISTS idx_usage_quotas_lookup ON public.usage_quotas(user_id, month_year);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON public.payment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON public.payment_requests(user_id);

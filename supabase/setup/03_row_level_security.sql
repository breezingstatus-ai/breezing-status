-- ==============================================================================
-- 03_row_level_security.sql
-- Breezing Status HD — Row Level Security (RLS) & Granular Access Control
-- Run this THIRD in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Revoke Default Public Privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- 2. Explicit Least-Privilege Grants
-- Anonymous visitors can read baseline active packages and public-safe application settings:
GRANT SELECT ON public.packages TO anon;
GRANT SELECT ON public.watermark_settings TO anon;
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.public_app_settings TO anon;

-- Authenticated users (customers and administrators):
-- Note: PostgreSQL evaluates table-level grants first, then applies RLS.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watermark_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_private_settings TO authenticated;
GRANT SELECT ON public.public_app_settings TO authenticated;
GRANT SELECT ON public.admin_full_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_quotas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quota_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_roles TO authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT SELECT ON public.admin_audit_logs TO authenticated;

-- Backend Service Role has complete operational access:
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3. Enable RLS on All Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watermark_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_private_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. Table RLS Policies
-- ==============================================================================

-- A. PROFILES
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());
    -- Note: Role, package_id, package_expiry, and Google-linked email are frozen by trg_protect_profile_fields.

DROP POLICY IF EXISTS "Direct profile deletion blocked for users" ON public.profiles;
CREATE POLICY "Direct profile deletion blocked for users"
    ON public.profiles FOR DELETE
    USING (public.is_super_admin());
    -- Customers must use the delete-account Edge Function to ensure Cloudinary assets are destroyed first.

-- B. ADMIN ROLES
-- Only active administrators can view the administrator registry.
DROP POLICY IF EXISTS "Admins view admin_roles" ON public.admin_roles;
CREATE POLICY "Admins view admin_roles"
    ON public.admin_roles FOR SELECT
    USING (public.is_admin());

-- STRICT: ONLY super_admin can create, update, or revoke administrator roles.
-- Ordinary administrators CANNOT create or elevate other administrators.
DROP POLICY IF EXISTS "Super admins manage admin_roles" ON public.admin_roles;
CREATE POLICY "Super admins manage admin_roles"
    ON public.admin_roles FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- C. PACKAGES
-- Anonymous visitors and customers can freely read active packages without requiring
-- execute permissions on administrator checking functions:
DROP POLICY IF EXISTS "Anyone can read active packages" ON public.packages;
CREATE POLICY "Anyone can read active packages"
    ON public.packages FOR SELECT
    USING (is_active = true);

-- Authenticated administrators can read all packages (including inactive/draft packages):
DROP POLICY IF EXISTS "Admins can read all packages" ON public.packages;
CREATE POLICY "Admins can read all packages"
    ON public.packages FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Authenticated administrators can create, update, and delete packages:
DROP POLICY IF EXISTS "Admins manage packages" ON public.packages;
CREATE POLICY "Admins manage packages"
    ON public.packages FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- D. USAGE QUOTAS
DROP POLICY IF EXISTS "Users can read own quota" ON public.usage_quotas;
CREATE POLICY "Users can read own quota"
    ON public.usage_quotas FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage quotas" ON public.usage_quotas;
CREATE POLICY "Admins manage quotas"
    ON public.usage_quotas FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- E. QUOTA RESERVATIONS
DROP POLICY IF EXISTS "Users view own reservations" ON public.quota_reservations;
CREATE POLICY "Users view own reservations"
    ON public.quota_reservations FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage reservations" ON public.quota_reservations;
CREATE POLICY "Admins manage reservations"
    ON public.quota_reservations FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- F. UPLOAD REQUESTS
DROP POLICY IF EXISTS "Users read own upload requests" ON public.upload_requests;
CREATE POLICY "Users read own upload requests"
    ON public.upload_requests FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

-- Direct customer insertion is strictly blocked to prevent unverified or forged records.
-- Official customer upload requests are created exclusively by the trusted finalize-request Edge Function (service_role).
-- Active administrators may insert records for testing and support.
DROP POLICY IF EXISTS "Verified request insertion only" ON public.upload_requests;
CREATE POLICY "Verified request insertion only"
    ON public.upload_requests FOR INSERT
    WITH CHECK (public.is_admin());

-- Only administrators can update status (processing, downloaded, sent) or admin notes:
DROP POLICY IF EXISTS "Admins update upload requests" ON public.upload_requests;
CREATE POLICY "Admins update upload requests"
    ON public.upload_requests FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete upload requests" ON public.upload_requests;
CREATE POLICY "Admins delete upload requests"
    ON public.upload_requests FOR DELETE
    USING (public.is_admin());

-- G. MEDIA ASSETS
DROP POLICY IF EXISTS "Users view own media assets" ON public.media_assets;
CREATE POLICY "Users view own media assets"
    ON public.media_assets FOR SELECT
    USING ((auth.uid() = user_id AND is_deleted = false) OR public.is_admin());

-- Direct customer insertion is blocked. Media records must be inserted through the finalize-request Edge Function
-- after physical verification of Cloudinary uploads.
DROP POLICY IF EXISTS "Verified media insertion only" ON public.media_assets;
CREATE POLICY "Verified media insertion only"
    ON public.media_assets FOR INSERT
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage media assets" ON public.media_assets;
CREATE POLICY "Admins manage media assets"
    ON public.media_assets FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- H. PAYMENT REQUESTS
DROP POLICY IF EXISTS "Users view own payment requests" ON public.payment_requests;
CREATE POLICY "Users view own payment requests"
    ON public.payment_requests FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

-- Customers can submit payment requests with status 'pending' only; price is locked by trigger
DROP POLICY IF EXISTS "Users submit payment requests" ON public.payment_requests;
CREATE POLICY "Users submit payment requests"
    ON public.payment_requests FOR INSERT
    WITH CHECK (
        (auth.uid() = user_id AND status = 'pending' AND approved_by IS NULL AND approved_at IS NULL)
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Admins manage payment requests" ON public.payment_requests;
CREATE POLICY "Admins manage payment requests"
    ON public.payment_requests FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- I. WATERMARK SETTINGS
DROP POLICY IF EXISTS "Anyone read watermark settings" ON public.watermark_settings;
CREATE POLICY "Anyone read watermark settings"
    ON public.watermark_settings FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins manage watermark settings" ON public.watermark_settings;
CREATE POLICY "Admins manage watermark settings"
    ON public.watermark_settings FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- J. APPLICATION SETTINGS (Public Operational Configuration)
-- Exposes operational flags, delivery estimate texts, and official WhatsApp number.
-- Publicly readable by anyone with NO private administrator emails.
DROP POLICY IF EXISTS "Anyone read app settings" ON public.app_settings;
CREATE POLICY "Anyone read app settings"
    ON public.app_settings FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_settings;
CREATE POLICY "Admins manage app settings"
    ON public.app_settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- J2. ADMINISTRATOR PRIVATE SETTINGS (Confidential Notification & Alert Settings)
-- Strictly isolated to verified active administrators only.
-- Anonymous visitors and customers are completely barred from viewing or editing these records.
DROP POLICY IF EXISTS "Admins view private settings" ON public.admin_private_settings;
CREATE POLICY "Admins view private settings"
    ON public.admin_private_settings FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage private settings" ON public.admin_private_settings;
CREATE POLICY "Admins manage private settings"
    ON public.admin_private_settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- K. NOTIFICATION & AUDIT LOGS (Admins only)
DROP POLICY IF EXISTS "Admins view notification logs" ON public.notification_logs;
CREATE POLICY "Admins view notification logs"
    ON public.notification_logs FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins view audit logs"
    ON public.admin_audit_logs FOR SELECT
    USING (public.is_admin());

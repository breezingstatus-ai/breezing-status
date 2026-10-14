-- ==============================================================================
-- 02_functions_and_triggers.sql
-- Breezing Status HD — Core Functions, Atomic Quotas, Audit & Security Triggers
-- Run this SECOND in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Helper: Get current month string in Africa/Blantyre timezone
CREATE OR REPLACE FUNCTION public.get_current_blantyre_month()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT to_char(timezone('Africa/Blantyre', now()), 'YYYY-MM');
$$;

-- 2. Server-side Administrator Verification Function
-- admin_roles is the SOLE trusted source of administrator privileges.
-- Verifies that the administrator account is active in profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE 
        WHEN auth.uid() IS NULL THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.admin_roles ar
            JOIN public.profiles p ON p.id = ar.user_id
            WHERE ar.user_id = auth.uid()
              AND p.status = 'active'
        )
    END;
$$;

-- 3. Super-Administrator Verification Function
-- Only super-administrators can assign, elevate, or revoke administrator roles.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE 
        WHEN auth.uid() IS NULL THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.admin_roles ar
            JOIN public.profiles p ON p.id = ar.user_id
            WHERE ar.user_id = auth.uid()
              AND ar.role = 'super_admin'
              AND p.status = 'active'
        )
    END;
$$;

-- 4. Super-Administrator Protection Trigger
-- Protects against unauthorized role modifications, privilege escalation,
-- and accidental removal/demotion of the last remaining super-administrator.
-- Controlled bootstrap allows initial setup ONLY via database administrator session or service_role.
-- Uses session_user (NOT current_user) to evaluate the authentic client session.
CREATE OR REPLACE FUNCTION public.protect_super_admin_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_count INTEGER;
    v_super_admin_count INTEGER;
    v_is_trusted_caller BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_admin_count FROM public.admin_roles;

    -- Controlled initial super-admin setup:
    -- When the table has 0 admins, allow bootstrap ONLY via direct database admin session
    -- (session_user IN ('postgres', 'supabase_admin') in SQL Editor / direct psql) or service_role.
    -- An ordinary customer connecting via PostgREST cannot self-assign super-admin.
    IF v_admin_count = 0 THEN
        IF auth.role() = 'service_role' OR session_user IN ('postgres', 'supabase_admin') THEN
            RETURN NEW;
        ELSE
            RAISE EXCEPTION 'Access denied: initial super-administrator setup must be performed via Supabase SQL Editor or service role';
        END IF;
    END IF;

    -- If administrators already exist, verify caller authorization:
    -- Check if the session is trusted backend, direct database admin, or active super-administrator
    v_is_trusted_caller := (
        auth.role() = 'service_role' OR
        session_user IN ('postgres', 'supabase_admin') OR
        public.is_super_admin()
    );

    IF NOT v_is_trusted_caller THEN
        RAISE EXCEPTION 'Access denied: only super-administrators can modify administrator roles';
    END IF;

    -- Prevent accidental deletion or demotion of the final super-administrator
    IF (TG_OP = 'DELETE' AND OLD.role = 'super_admin') OR 
       (TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND NEW.role <> 'super_admin') THEN
        SELECT COUNT(*) INTO v_super_admin_count
        FROM public.admin_roles
        WHERE role = 'super_admin';

        IF v_super_admin_count <= 1 THEN
            RAISE EXCEPTION 'Operation blocked: cannot delete or demote the last remaining super-administrator';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.admin_roles;
CREATE TRIGGER trg_protect_super_admin
    BEFORE INSERT OR UPDATE OR DELETE ON public.admin_roles
    FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_operations();

-- 5. Automatic Profile Creation Trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        whatsapp_number,
        country_code,
        whatsapp_consent,
        role,
        package_id,
        status
    ) VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Customer'),
        COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', ''),
        COALESCE(NEW.raw_user_meta_data->>'country_code', '+265'),
        false, -- WhatsApp consent must be explicitly granted by customer
        'customer',
        'free',
        'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Profile Field Lockdown Trigger
-- Customers may ONLY modify approved profile fields: full_name, whatsapp_number, country_code,
-- whatsapp_consent, avatar_url, avatar_thumbnail_url, and avatar_cloudinary_id.
-- Freezes Google-linked email, account role, status, and creation time.
-- Allows legitimate server-authorized subscription downgrades when expired.
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_expired BOOLEAN;
BEGIN
    -- Allow modification if caller is an active verified administrator or backend service_role
    IF public.is_admin() OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Check if customer's existing subscription has expired
    v_is_expired := (OLD.package_id <> 'free' 
                     AND OLD.package_expiry IS NOT NULL 
                     AND OLD.package_expiry < timezone('utc'::text, now()));

    -- Customer is updating profile:
    -- Strictly freeze ID, Google-linked email, account role, account status, and creation time
    NEW.id := OLD.id;
    NEW.email := OLD.email;
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.created_at := OLD.created_at;

    -- Subscription downgrade protection:
    -- If subscription has legitimately expired, allow server-authorized downgrade to 'free'
    IF v_is_expired AND NEW.package_id = 'free' THEN
        NEW.package_id := 'free';
    ELSE
        -- Otherwise, prevent customer from altering package_id or package_expiry directly
        NEW.package_id := OLD.package_id;
        NEW.package_expiry := OLD.package_expiry;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_immutable_fields();

-- 7. Automatic Timestamp Update Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_modtime ON public.profiles;
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_packages_modtime ON public.packages;
CREATE TRIGGER update_packages_modtime
    BEFORE UPDATE ON public.packages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_upload_requests_modtime ON public.upload_requests;
CREATE TRIGGER update_upload_requests_modtime
    BEFORE UPDATE ON public.upload_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_settings_modtime ON public.app_settings;
CREATE TRIGGER update_app_settings_modtime
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_private_settings_modtime ON public.admin_private_settings;
CREATE TRIGGER update_admin_private_settings_modtime
    BEFORE UPDATE ON public.admin_private_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_requests_modtime ON public.payment_requests;
CREATE TRIGGER update_payment_requests_modtime
    BEFORE UPDATE ON public.payment_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Atomic Quota Reservation Function
-- Verifies caller ownership, positive counts, package eligibility, subscription expiry,
-- and month boundaries. Enforces strict duplicate token validation.
CREATE OR REPLACE FUNCTION public.reserve_media_quota(
    p_user_id UUID,
    p_count INTEGER,
    p_media_type TEXT,
    p_reservation_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_month TEXT;
    v_package_id TEXT;
    v_package_expiry TIMESTAMPTZ;
    v_pkg public.packages%ROWTYPE;
    v_quota public.usage_quotas%ROWTYPE;
    v_existing public.quota_reservations%ROWTYPE;
    v_allowed INTEGER;
    v_current_total INTEGER;
BEGIN
    -- 1. Caller Authorization Check
    IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: cannot reserve quota for another customer';
    END IF;

    -- 2. Validate Parameters
    IF p_count <= 0 OR p_count > 50 THEN
        RAISE EXCEPTION 'Invalid count: must be between 1 and 50';
    END IF;

    IF p_media_type NOT IN ('image', 'video') THEN
        RAISE EXCEPTION 'Invalid media type: must be image or video';
    END IF;

    IF p_reservation_token IS NULL OR trim(p_reservation_token) = '' THEN
        RAISE EXCEPTION 'Reservation token is required for idempotency';
    END IF;

    -- 3. Strict Idempotency & Duplicate Token Validation
    SELECT * INTO v_existing FROM public.quota_reservations WHERE reservation_token = p_reservation_token;
    IF v_existing.id IS NOT NULL THEN
        -- Ownership verification: NEVER allow another customer to reuse or hijack a token
        IF v_existing.user_id <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: reservation token belongs to another customer';
        END IF;

        -- Verify matching media_type and count
        IF v_existing.media_type <> p_media_type OR v_existing.count <> p_count THEN
            RAISE EXCEPTION 'Reservation parameter mismatch for existing token';
        END IF;

        -- Check expiration
        IF v_existing.expires_at <= timezone('utc'::text, now()) THEN
            UPDATE public.quota_reservations SET status = 'expired' WHERE id = v_existing.id AND status = 'active';
            RAISE EXCEPTION 'Reservation token has expired';
        END IF;

        IF v_existing.status = 'active' THEN
            RETURN jsonb_build_object(
                'success', true,
                'reservation_token', v_existing.reservation_token,
                'reserved_count', v_existing.count,
                'is_idempotent_duplicate', true
            );
        ELSIF v_existing.status = 'finalized' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Reservation has already been finalized');
        ELSE
            RAISE EXCEPTION 'Reservation token is no longer active (status: %)', v_existing.status;
        END IF;
    END IF;

    v_month := public.get_current_blantyre_month();

    -- 4. Check Customer Package and Enforce Backend Subscription Expiration
    SELECT package_id, package_expiry INTO v_package_id, v_package_expiry 
    FROM public.profiles 
    WHERE id = p_user_id AND status = 'active';

    IF v_package_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Active customer profile not found');
    END IF;

    -- Backend Subscription Expiry Enforcement:
    -- If subscription has expired, automatically downgrade allowance to 'free'
    IF v_package_id <> 'free' AND v_package_expiry IS NOT NULL AND v_package_expiry < timezone('utc'::text, now()) THEN
        v_package_id := 'free';
        UPDATE public.profiles
        SET package_id = 'free',
            updated_at = timezone('utc'::text, now())
        WHERE id = p_user_id;
    END IF;

    SELECT * INTO v_pkg FROM public.packages WHERE id = v_package_id AND is_active = true;
    IF v_pkg.id IS NULL THEN
        SELECT * INTO v_pkg FROM public.packages WHERE id = 'free';
    END IF;

    -- 5. Lock Monthly Usage Quota Row
    INSERT INTO public.usage_quotas (user_id, month_year, pictures_used, videos_used, pictures_reserved, videos_reserved)
    VALUES (p_user_id, v_month, 0, 0, 0, 0)
    ON CONFLICT (user_id, month_year) DO NOTHING;

    SELECT * INTO v_quota
    FROM public.usage_quotas
    WHERE user_id = p_user_id AND month_year = v_month
    FOR UPDATE;

    -- 6. Evaluate Allowances
    IF p_media_type = 'image' THEN
        v_allowed := v_pkg.monthly_pictures;
        v_current_total := v_quota.pictures_used + v_quota.pictures_reserved;

        IF (v_current_total + p_count) > v_allowed THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Monthly picture quota exceeded',
                'allowed', v_allowed,
                'used', v_quota.pictures_used,
                'reserved', v_quota.pictures_reserved,
                'remaining', GREATEST(0, v_allowed - v_current_total)
            );
        END IF;

        UPDATE public.usage_quotas
        SET pictures_reserved = pictures_reserved + p_count,
            last_updated = timezone('utc'::text, now())
        WHERE id = v_quota.id;

    ELSIF p_media_type = 'video' THEN
        v_allowed := v_pkg.monthly_videos;
        v_current_total := v_quota.videos_used + v_quota.videos_reserved;

        IF (v_current_total + p_count) > v_allowed THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Monthly video quota exceeded',
                'allowed', v_allowed,
                'used', v_quota.videos_used,
                'reserved', v_quota.videos_reserved,
                'remaining', GREATEST(0, v_allowed - v_current_total)
            );
        END IF;

        UPDATE public.usage_quotas
        SET videos_reserved = videos_reserved + p_count,
            last_updated = timezone('utc'::text, now())
        WHERE id = v_quota.id;
    END IF;

    -- 7. Record In Reservation Ledger
    INSERT INTO public.quota_reservations (
        reservation_token,
        user_id,
        media_type,
        count,
        month_year,
        status,
        expires_at
    ) VALUES (
        p_reservation_token,
        p_user_id,
        p_media_type,
        p_count,
        v_month,
        'active',
        timezone('utc'::text, now()) + interval '1 hour'
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_token', p_reservation_token,
        'package_name', v_pkg.name,
        'watermark_required', v_pkg.watermark_required,
        'reserved_count', p_count
    );
END;
$$;

-- 9. Atomic Quota Finalization Function
-- Restricted to backend service_role and verified administrators.
-- Shifts reserved balance to used balance ONLY when an active reservation exists
-- and corresponding uploaded media records are explicitly linked to the reservation/request,
-- verifying exact request, file count, media type, customer ownership, and Cloudinary confirmation.
CREATE OR REPLACE FUNCTION public.finalize_media_quota(
    p_reservation_token TEXT,
    p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_res public.quota_reservations%ROWTYPE;
    v_req public.upload_requests%ROWTYPE;
    v_total_assets INTEGER;
    v_valid_confirmed_assets INTEGER;
BEGIN
    -- Strict privilege check: quota finalization is restricted to the verified backend workflow
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: quota finalization requires verified backend service execution';
    END IF;

    IF p_reservation_token IS NULL OR trim(p_reservation_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation token is required');
    END IF;

    -- 1. Lock and retrieve the reservation record
    SELECT * INTO v_res 
    FROM public.quota_reservations 
    WHERE reservation_token = p_reservation_token 
    FOR UPDATE;

    IF v_res.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation token not found');
    END IF;

    -- Idempotent return if already finalized
    IF v_res.status = 'finalized' THEN
        RETURN jsonb_build_object(
            'success', true, 
            'already_finalized', true,
            'reservation_token', v_res.reservation_token,
            'request_id', v_res.request_id
        );
    END IF;

    IF v_res.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation is not active (status: ' || v_res.status || ')');
    END IF;

    IF v_res.expires_at <= timezone('utc'::text, now()) THEN
        UPDATE public.quota_reservations SET status = 'expired' WHERE id = v_res.id;
        RETURN jsonb_build_object('success', false, 'error', 'Reservation has expired');
    END IF;

    -- 2. Identify the specific upload request linked to this reservation
    IF p_request_id IS NOT NULL THEN
        SELECT * INTO v_req FROM public.upload_requests WHERE id = p_request_id;
    ELSIF v_res.request_id IS NOT NULL THEN
        SELECT * INTO v_req FROM public.upload_requests WHERE id = v_res.request_id;
    ELSE
        SELECT * INTO v_req FROM public.upload_requests WHERE reservation_token = p_reservation_token;
    END IF;

    IF v_req.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No upload request found matching this reservation');
    END IF;

    -- 3. Verify exact ownership
    IF v_req.user_id <> v_res.user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Security violation: upload request owner does not match reservation');
    END IF;

    -- 4. Verify request status is not failed or expired
    IF v_req.status IN ('failed', 'expired') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Upload request is in invalid status: ' || v_req.status);
    END IF;

    -- 5. Verify exact file count on request matches reservation
    IF v_req.media_count <> v_res.count THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Request media count (' || v_req.media_count || ') does not match reserved count (' || v_res.count || ')'
        );
    END IF;

    -- 6. Verify exact media type on request matches reservation
    IF v_req.media_type <> v_res.media_type THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Request media type (' || v_req.media_type || ') does not match reserved type (' || v_res.media_type || ')'
        );
    END IF;

    -- 7. Verify uploaded media assets specifically linked to this request and reservation:
    -- Must verify exact count, matching media type, owner, and Cloudinary confirmation (public_id, secure_url, not deleted).
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (
            WHERE user_id = v_res.user_id
              AND resource_type = v_res.media_type
              AND is_deleted = false
              AND cloudinary_public_id IS NOT NULL 
              AND length(trim(cloudinary_public_id)) > 0
              AND secure_url IS NOT NULL 
              AND length(trim(secure_url)) > 0
        )
    INTO v_total_assets, v_valid_confirmed_assets
    FROM public.media_assets
    WHERE request_id = v_req.id;

    IF v_total_assets = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No media assets found linked to this specific upload request');
    END IF;

    IF v_total_assets <> v_res.count THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Uploaded asset count (' || v_total_assets || ') does not match reserved count (' || v_res.count || ')'
        );
    END IF;

    IF v_valid_confirmed_assets <> v_total_assets THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'One or more media assets lack valid Cloudinary confirmation, owner match, or type match'
        );
    END IF;

    -- 8. Explicitly link reservation and upload request bidirectionally
    UPDATE public.quota_reservations
    SET request_id = v_req.id,
        status = 'finalized',
        finalized_at = timezone('utc'::text, now())
    WHERE id = v_res.id;

    UPDATE public.upload_requests
    SET reservation_token = v_res.reservation_token
    WHERE id = v_req.id AND (reservation_token IS NULL OR reservation_token = v_res.reservation_token);

    -- 9. Shift reserved balance to used balance in usage_quotas
    IF v_res.media_type = 'image' THEN
        UPDATE public.usage_quotas
        SET pictures_reserved = GREATEST(0, pictures_reserved - v_res.count),
            pictures_used = pictures_used + v_res.count,
            last_updated = timezone('utc'::text, now())
        WHERE user_id = v_res.user_id AND month_year = v_res.month_year;
    ELSIF v_res.media_type = 'video' THEN
        UPDATE public.usage_quotas
        SET videos_reserved = GREATEST(0, videos_reserved - v_res.count),
            videos_used = videos_used + v_res.count,
            last_updated = timezone('utc'::text, now())
        WHERE user_id = v_res.user_id AND month_year = v_res.month_year;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_token', v_res.reservation_token,
        'request_id', v_req.id,
        'media_type', v_res.media_type,
        'verified_count', v_valid_confirmed_assets
    );
END;
$$;

-- 10. Atomic Quota Release Function
-- Releases reserved balance if upload fails, aborts, or expires.
CREATE OR REPLACE FUNCTION public.release_media_quota(
    p_reservation_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_res public.quota_reservations%ROWTYPE;
BEGIN
    IF p_reservation_token IS NULL OR trim(p_reservation_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation token is required');
    END IF;

    SELECT * INTO v_res FROM public.quota_reservations WHERE reservation_token = p_reservation_token FOR UPDATE;

    IF v_res.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation token not found');
    END IF;

    IF (auth.uid() IS NULL AND auth.role() <> 'service_role') OR 
       (auth.uid() IS NOT NULL AND auth.uid() <> v_res.user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized to release this reservation';
    END IF;

    IF v_res.status <> 'active' THEN
        RETURN jsonb_build_object('success', true, 'status', v_res.status);
    END IF;

    IF v_res.media_type = 'image' THEN
        UPDATE public.usage_quotas
        SET pictures_reserved = GREATEST(0, pictures_reserved - v_res.count),
            last_updated = timezone('utc'::text, now())
        WHERE user_id = v_res.user_id AND month_year = v_res.month_year;
    ELSIF v_res.media_type = 'video' THEN
        UPDATE public.usage_quotas
        SET videos_reserved = GREATEST(0, videos_reserved - v_res.count),
            last_updated = timezone('utc'::text, now())
        WHERE user_id = v_res.user_id AND month_year = v_res.month_year;
    END IF;

    UPDATE public.quota_reservations
    SET status = 'released',
        released_at = timezone('utc'::text, now())
    WHERE id = v_res.id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 11. Stale Quota Reservation Auto-Releaser
-- Releases expired active reservations and restores quota balances.
-- Safe to execute from background cron jobs without a customer JWT.
CREATE OR REPLACE FUNCTION public.release_stale_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_count INTEGER := 0;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role' OR
        session_user IN ('postgres', 'supabase_admin') OR
        public.is_admin()
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only service_role, administrators, or internal maintenance routines can trigger stale reservation cleanup';
    END IF;

    FOR v_res IN
        SELECT id, user_id, month_year, media_type, count, reservation_token
        FROM public.quota_reservations
        WHERE status = 'active'
          AND expires_at <= timezone('utc'::text, now())
        ORDER BY expires_at ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    LOOP
        IF v_res.media_type = 'image' THEN
            UPDATE public.usage_quotas
            SET pictures_reserved = GREATEST(0, pictures_reserved - v_res.count),
                last_updated = timezone('utc'::text, now())
            WHERE user_id = v_res.user_id AND month_year = v_res.month_year;
        ELSIF v_res.media_type = 'video' THEN
            UPDATE public.usage_quotas
            SET videos_reserved = GREATEST(0, videos_reserved - v_res.count),
                last_updated = timezone('utc'::text, now())
            WHERE user_id = v_res.user_id AND month_year = v_res.month_year;
        END IF;

        UPDATE public.quota_reservations
        SET status = 'expired',
            released_at = timezone('utc'::text, now())
        WHERE id = v_res.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- 12. Cloudinary Deletion Status Handler
-- Marks an asset deleted ONLY after Cloudinary confirms deletion.
-- Only marks a request expired when ALL its media files are confirmed deleted.
CREATE OR REPLACE FUNCTION public.record_asset_deletion_result(
    p_asset_id UUID,
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req_id UUID;
    v_remaining_count INTEGER;
BEGIN
    SELECT request_id INTO v_req_id FROM public.media_assets WHERE id = p_asset_id;
    IF v_req_id IS NULL THEN
        RETURN;
    END IF;

    IF p_success THEN
        UPDATE public.media_assets
        SET is_deleted = true,
            deletion_status = 'deleted',
            deleted_at = timezone('utc'::text, now()),
            last_deletion_error = NULL
        WHERE id = p_asset_id;

        -- Check if all assets belonging to this request are now deleted
        SELECT COUNT(*) INTO v_remaining_count
        FROM public.media_assets
        WHERE request_id = v_req_id AND is_deleted = false;

        -- Only mark request expired if ALL assets have been deleted and status is not 'sent'
        IF v_remaining_count = 0 THEN
            UPDATE public.upload_requests
            SET status = 'expired'
            WHERE id = v_req_id AND status NOT IN ('sent', 'expired');
        END IF;
    ELSE
        UPDATE public.media_assets
        SET deletion_attempts = deletion_attempts + 1,
            deletion_status = 'failed',
            last_deletion_error = p_error
        WHERE id = p_asset_id;
    END IF;
END;
$$;

-- 13. Payment Request Validation Trigger
-- Enforces server-side package pricing and prevents customer self-approval.
-- Completely separates INSERT and UPDATE branches; NEVER references OLD on INSERT.
CREATE OR REPLACE FUNCTION public.validate_payment_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pkg_price NUMERIC(10, 2);
    v_pkg_currency TEXT;
    v_pkg_days INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    -- 1. Enforce active package pricing and duration server-side
    SELECT price, currency, duration_days INTO v_pkg_price, v_pkg_currency, v_pkg_days
    FROM public.packages
    WHERE id = NEW.package_id AND is_active = true;

    IF v_pkg_price IS NULL THEN
        RAISE EXCEPTION 'Invalid or inactive package selected for payment';
    END IF;

    NEW.amount := v_pkg_price;
    NEW.currency := v_pkg_currency;

    v_is_admin := (public.is_admin() OR auth.role() = 'service_role');

    -- 2. Handle INSERT Branch (OLD record is indeterminate; NEVER reference OLD)
    IF TG_OP = 'INSERT' THEN
        IF NOT v_is_admin THEN
            -- Non-admin customer submission: force pending status, wipe any forged approvals
            NEW.status := 'pending';
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSE
            -- Admin or backend service_role insertion
            IF NEW.status = 'approved' THEN
                NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
                NEW.approved_at := COALESCE(NEW.approved_at, timezone('utc'::text, now()));

                -- Activate subscription package immediately on approved creation
                UPDATE public.profiles
                SET package_id = NEW.package_id,
                    package_expiry = timezone('utc'::text, now()) + (v_pkg_days || ' days')::interval,
                    updated_at = timezone('utc'::text, now())
                WHERE id = NEW.user_id;
            ELSE
                NEW.status := COALESCE(NEW.status, 'pending');
                NEW.approved_by := NULL;
                NEW.approved_at := NULL;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- 3. Handle UPDATE Branch (OLD record is safely accessible)
    IF TG_OP = 'UPDATE' THEN
        IF NOT v_is_admin THEN
            -- Regular customers are forbidden from updating approval status, amount, or package
            NEW.status := OLD.status;
            NEW.approved_by := OLD.approved_by;
            NEW.approved_at := OLD.approved_at;
            NEW.amount := OLD.amount;
            NEW.package_id := OLD.package_id;
            NEW.user_id := OLD.user_id;
        ELSE
            -- Verified administrator approval workflow
            IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
                NEW.approved_by := auth.uid();
                NEW.approved_at := timezone('utc'::text, now());

                -- Elevate customer subscription package and extend expiry
                UPDATE public.profiles
                SET package_id = NEW.package_id,
                    package_expiry = timezone('utc'::text, now()) + (v_pkg_days || ' days')::interval,
                    updated_at = timezone('utc'::text, now())
                WHERE id = NEW.user_id;
            ELSIF NEW.status <> 'approved' AND OLD.status = 'approved' THEN
                -- If approval is revoked or rejected
                NEW.approved_by := NULL;
                NEW.approved_at := NULL;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_request ON public.payment_requests;
CREATE TRIGGER trg_validate_payment_request
    BEFORE INSERT OR UPDATE ON public.payment_requests
    FOR EACH ROW EXECUTE FUNCTION public.validate_payment_request();

-- 14. Administrator Warning Function For Failed Deletions
-- Explicitly validates administrator privileges to prevent information leakage to customers.
CREATE OR REPLACE FUNCTION public.get_failed_deletion_assets(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    asset_id UUID,
    cloudinary_public_id TEXT,
    resource_type TEXT,
    request_id UUID,
    deletion_attempts INTEGER,
    last_deletion_error TEXT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Strict check: ordinary customers and anonymous callers are completely barred from calling this function
    IF NOT (
        public.is_admin() OR
        COALESCE(auth.role(), '') = 'service_role' OR
        session_user IN ('postgres', 'supabase_admin')
    ) THEN
        RAISE EXCEPTION 'Access denied: administrator privileges required';
    END IF;

    RETURN QUERY
    SELECT 
        ma.id,
        ma.cloudinary_public_id,
        ma.resource_type,
        ma.request_id,
        ma.deletion_attempts,
        ma.last_deletion_error,
        ma.expires_at
    FROM public.media_assets ma
    WHERE ma.is_deleted = false
      AND ma.deletion_attempts >= 3
    ORDER BY ma.deletion_attempts DESC
    LIMIT p_limit;
END;
$$;

-- 15. Audit Log Trigger for Administrator Role Changes
CREATE OR REPLACE FUNCTION public.log_admin_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        auth.uid(),
        TG_OP,
        'admin_roles',
        COALESCE(NEW.user_id, OLD.user_id)::TEXT,
        jsonb_build_object(
            'email', COALESCE(NEW.email, OLD.email),
            'role', COALESCE(NEW.role, OLD.role),
            'assigned_by', COALESCE(NEW.assigned_by, OLD.assigned_by)
        ),
        timezone('utc'::text, now())
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_admin_role_change ON public.admin_roles;
CREATE TRIGGER trg_audit_admin_role_change
    AFTER INSERT OR UPDATE OR DELETE ON public.admin_roles
    FOR EACH ROW EXECUTE FUNCTION public.log_admin_role_change();

-- 16. Public Settings Interface Function
-- Returns public-safe configuration as JSON for visitors and customers without exposing admin email.
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', id,
        'app_name', app_name,
        'service_available', service_available,
        'maintenance_mode', maintenance_mode,
        'delivery_estimate_text', delivery_estimate_text,
        'delivery_estimate_busy_text', delivery_estimate_busy_text,
        'retention_hours', retention_hours,
        'official_whatsapp_number', official_whatsapp_number,
        'official_contact_name', official_contact_name,
        'official_country_code', official_country_code,
        'payment_demo_mode', payment_demo_mode,
        'updated_at', updated_at
    )
    FROM public.app_settings
    WHERE id = 1;
$$;

-- 17. Expired Subscription Downgrade Routine
-- Downgrades any accounts whose Premium or Business subscriptions have elapsed to 'free'.
CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_downgraded_count INTEGER;
BEGIN
    -- Strict privilege check: callers must be service_role, genuine PostgreSQL scheduled jobs, or active admin
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role' OR
        session_user IN ('postgres', 'supabase_admin') OR
        public.is_admin()
    ) THEN
        RAISE EXCEPTION 'Access denied: downgrade_expired_subscriptions requires trusted backend operations';
    END IF;

    UPDATE public.profiles
    SET package_id = 'free',
        updated_at = timezone('utc'::text, now())
    WHERE package_id <> 'free'
      AND package_expiry IS NOT NULL
      AND package_expiry < timezone('utc'::text, now());

    GET DIAGNOSTICS v_downgraded_count = ROW_COUNT;
    RETURN v_downgraded_count;
END;
$$;

-- 18. Function Access Revocations & Least-Privilege Grants
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Public / Anonymous and Customer accessible functions:
-- Note: is_admin and is_super_admin safely return false for anonymous sessions without errors.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_blantyre_month() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_media_quota(UUID, INTEGER, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_media_quota(TEXT) TO authenticated, service_role;

-- Privileged functions strictly restricted to trusted backend service_role operations:
GRANT EXECUTE ON FUNCTION public.get_failed_deletion_assets(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_media_quota(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.downgrade_expired_subscriptions() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_asset_deletion_result(UUID, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_reservations() TO service_role;

-- Ensure UUID generation functions remain accessible if defined in public schema
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND p.proname = 'uuid_generate_v4'
    ) THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.uuid_generate_v4() TO anon, authenticated, service_role';
    END IF;
END $$;

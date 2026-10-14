BEGIN;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS service_notice_key TEXT NOT NULL DEFAULT 'maintenance';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS service_notices JSONB NOT NULL DEFAULT '[
 {"key":"maintenance","title":"Scheduled maintenance","message":"We are improving your experience. Uploads will return shortly."},
 {"key":"outage","title":"Temporarily out of service","message":"Our upload service is unavailable. Please try again later."},
 {"key":"construction","title":"Something better is on the way","message":"We are updating the studio. Uploads are paused while we finish."},
 {"key":"capacity","title":"Taking a short breather","message":"We are handling a high volume of requests. Please check back soon."},
 {"key":"holiday","title":"Currently away","message":"Our team is taking a break. Uploads will reopen when we return."},
 {"key":"incident","title":"Uploads temporarily on hold","message":"We are resolving a service issue. Thank you for your patience."}
]'::jsonb;
ALTER TABLE public.app_settings ADD CONSTRAINT service_notice_key_valid CHECK (service_notice_key IN ('maintenance','outage','construction','capacity','holiday','incident'));
ALTER TABLE public.app_settings ADD CONSTRAINT service_notices_bounded CHECK (jsonb_typeof(service_notices)='array' AND jsonb_array_length(service_notices)=6 AND octet_length(service_notices::text)<=8192);
CREATE OR REPLACE FUNCTION public.set_service_status(p_paused BOOLEAN,p_notice_key TEXT,p_notices JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_paused IS NULL OR p_notice_key NOT IN ('maintenance','outage','construction','capacity','holiday','incident') OR p_notice_key IS NULL THEN RAISE EXCEPTION 'Invalid service status'; END IF;
 IF p_notices IS NULL OR jsonb_typeof(p_notices)<>'array' OR jsonb_array_length(p_notices)<>6 OR octet_length(p_notices::text)>8192 THEN RAISE EXCEPTION 'Provide six short notice templates'; END IF;
 IF (SELECT count(DISTINCT item->>'key') FROM jsonb_array_elements(p_notices) item WHERE item->>'key' IN ('maintenance','outage','construction','capacity','holiday','incident') AND length(trim(item->>'title')) BETWEEN 1 AND 100 AND length(trim(item->>'message')) BETWEEN 1 AND 600)<>6 THEN RAISE EXCEPTION 'Every notice needs a unique reason, title and message'; END IF;
 UPDATE public.app_settings SET service_available=NOT p_paused,maintenance_mode=p_paused,service_notice_key=p_notice_key,service_notices=p_notices WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service settings unavailable'; END IF;
 RETURN jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION public.set_service_status(BOOLEAN,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_service_status(BOOLEAN,TEXT,JSONB) TO authenticated;
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
    -- Serialize the pause with accepted reservations/finalizations. Fail closed if settings are missing.
    PERFORM 1 FROM public.app_settings WHERE id=1 FOR SHARE;
    IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id=1 AND service_available AND NOT maintenance_mode) THEN
      RETURN jsonb_build_object('success',false,'error','Uploads are temporarily paused. Please check the service notice.','code','SERVICE_PAUSED');
    END IF;
    -- 1. Caller Authorization Check
    IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: cannot reserve quota for another customer';
    END IF;

    -- Serialize profile/package changes with upload authorization.
    PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user_id AND status='active'
      AND length(trim(full_name)) BETWEEN 2 AND 120
      AND whatsapp_number ~ '^\+[1-9][0-9]{7,14}$' AND whatsapp_consent=true) THEN
      RETURN jsonb_build_object('success',false,'error','Complete your name and WhatsApp delivery details before uploading');
    END IF;

    -- 2. Validate Parameters
    IF p_count IS NULL OR p_count <= 0 OR p_count > 50 THEN
        RAISE EXCEPTION 'Invalid count: must be between 1 and 50';
    END IF;

    IF p_media_type IS NULL OR p_media_type NOT IN ('image', 'video') THEN
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

        IF v_existing.month_year <> public.get_current_blantyre_month() THEN
            RETURN jsonb_build_object('success',false,'error','Reservation belongs to a previous month');
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
        RETURN jsonb_build_object('success',false,'error','Your package is unavailable');
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
    v_live_package public.packages%ROWTYPE;
    v_live_quota public.usage_quotas%ROWTYPE;
    v_req public.upload_requests%ROWTYPE;
    v_total_assets INTEGER;
    v_valid_confirmed_assets INTEGER;
BEGIN
    -- Serialize the pause with accepted reservations/finalizations. Fail closed if settings are missing.
    PERFORM 1 FROM public.app_settings WHERE id=1 FOR SHARE;
    IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id=1 AND service_available AND NOT maintenance_mode) THEN
      RETURN jsonb_build_object('success',false,'error','Uploads are temporarily paused. Please check the service notice.','code','SERVICE_PAUSED');
    END IF;
    PERFORM 1 FROM public.profiles WHERE id=(SELECT user_id FROM public.quota_reservations WHERE reservation_token=p_reservation_token) FOR UPDATE;
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
        IF p_request_id IS NOT NULL AND p_request_id IS DISTINCT FROM v_res.request_id THEN
          RETURN jsonb_build_object('success',false,'error','Reservation already belongs to another finalized request');
        END IF;
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

    IF v_res.month_year <> public.get_current_blantyre_month() THEN
      RETURN jsonb_build_object('success',false,'error','Reservation belongs to a previous month');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_res.user_id AND status='active'
      AND length(trim(full_name)) BETWEEN 2 AND 120
      AND whatsapp_number ~ '^\+[1-9][0-9]{7,14}$' AND whatsapp_consent=true) THEN
      RETURN jsonb_build_object('success',false,'error','Name and WhatsApp delivery details are required');
    END IF;
    UPDATE public.profiles SET package_id='free',package_expiry=NULL WHERE id=v_res.user_id AND package_id<>'free' AND package_expiry<now();
    SELECT * INTO v_live_package FROM public.packages WHERE id=(SELECT package_id FROM public.profiles WHERE id=v_res.user_id) AND is_active=true FOR SHARE;
    IF v_live_package.id IS NULL THEN RETURN jsonb_build_object('success',false,'error','Package unavailable'); END IF;
    SELECT * INTO v_live_quota FROM public.usage_quotas WHERE user_id=v_res.user_id AND month_year=v_res.month_year FOR UPDATE;
    IF (v_res.media_type='image' AND v_live_quota.pictures_used + v_live_quota.pictures_reserved > v_live_package.monthly_pictures)
      OR (v_res.media_type='video' AND v_live_quota.videos_used + v_live_quota.videos_reserved > v_live_package.monthly_videos) THEN
      RETURN jsonb_build_object('success',false,'error','The current package monthly limit has been reached');
    END IF;
    IF EXISTS (SELECT 1 FROM public.media_assets WHERE request_id=v_req.id AND
      ((resource_type='image' AND (file_size_bytes <= 0 OR file_size_bytes > 25*1024*1024)) OR
       (resource_type='video' AND (file_size_bytes <= 0 OR file_size_bytes > v_live_package.max_video_size_mb::bigint*1024*1024
         OR duration_seconds IS NULL OR duration_seconds <= 0 OR duration_seconds > v_live_package.max_video_duration_seconds)))) THEN
      RETURN jsonb_build_object('success',false,'error','Media exceeds the current package file size or duration limit');
    END IF;
    IF v_req.watermark_applied IS DISTINCT FROM v_live_package.watermark_required THEN
      RETURN jsonb_build_object('success',false,'error','Package watermark rules changed. Please retry your upload');
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

COMMIT;

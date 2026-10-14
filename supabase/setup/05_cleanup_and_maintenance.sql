-- ==============================================================================
-- 05_cleanup_and_maintenance.sql
-- Breezing Status HD — 24-Hour Media Retention, Purge Routines & Verification
-- Run this FIFTH in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Fetch Assets For Cloudinary Deletion Routine
-- Returns expired media assets that have not yet been destroyed in Cloudinary.
-- Excludes assets with repeated failed attempts to prevent infinite retry loops.
CREATE OR REPLACE FUNCTION public.get_expired_assets_for_cleanup(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    asset_id UUID,
    cloudinary_public_id TEXT,
    resource_type TEXT,
    request_id UUID,
    deletion_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Strict authorization check:
    -- Allow service_role, genuine PostgreSQL scheduled jobs/DB admin (session_user IN ('postgres', 'supabase_admin')),
    -- or active administrators.
    -- Explicitly verify that NULL or empty auth.role() cannot bypass security.
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role' OR
        session_user IN ('postgres', 'supabase_admin') OR
        public.is_admin()
    ) THEN
        RAISE EXCEPTION 'Access denied: caller is not authorized to query expired assets for cleanup';
    END IF;

    RETURN QUERY
    SELECT 
        ma.id,
        ma.cloudinary_public_id,
        ma.resource_type,
        ma.request_id,
        ma.deletion_attempts
    FROM public.media_assets ma
    WHERE ma.is_deleted = false
      AND ma.expires_at <= timezone('utc'::text, now())
      AND ma.deletion_attempts < 5
    ORDER BY ma.expires_at ASC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_expired_assets_for_cleanup(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_expired_assets_for_cleanup(INTEGER) TO service_role;

-- 2. Authenticated Edge Function Invoker For Scheduled Cleanup
-- Dispatches an authenticated HTTP call to the cleanup-expired-media Edge Function.
-- Retrieves credentials securely from Supabase Vault (vault.decrypted_secrets) or custom settings.
-- Clearly records missing credentials and dispatch errors in admin_audit_logs instead of appearing as a successful run.
CREATE OR REPLACE FUNCTION public.invoke_cleanup_expired_media()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_project_url TEXT;
    v_service_key TEXT;
    v_request_id BIGINT;
BEGIN
    -- Strict authorization check:
    -- Allow service_role, genuine PostgreSQL scheduled jobs (session_user IN ('postgres', 'supabase_admin')),
    -- or active administrators.
    -- Explicitly verify that NULL or empty auth.role() cannot bypass security.
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role' OR
        session_user IN ('postgres', 'supabase_admin') OR
        public.is_admin()
    ) THEN
        RAISE EXCEPTION 'Access denied: caller is not authorized to invoke cleanup routine';
    END IF;

    -- 1. Attempt to retrieve credentials from Supabase Vault
    BEGIN
        SELECT decrypted_secret INTO v_project_url 
        FROM vault.decrypted_secrets 
        WHERE name = 'project_url' 
        LIMIT 1;

        SELECT decrypted_secret INTO v_service_key 
        FROM vault.decrypted_secrets 
        WHERE name = 'service_role_key' 
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_project_url := NULL;
        v_service_key := NULL;
    END;

    -- 2. Fallback to custom database settings if vault secret not set
    IF v_project_url IS NULL OR v_project_url = '' THEN
        v_project_url := current_setting('app.settings.supabase_url', true);
    END IF;

    IF v_service_key IS NULL OR v_service_key = '' THEN
        v_service_key := current_setting('app.settings.service_role_key', true);
    END IF;

    -- 3. Clearly record and report missing Vault credentials (NEVER disguise as a successful run)
    IF v_project_url IS NULL OR v_project_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
        -- Record missing credentials failure incident in admin audit logs
        INSERT INTO public.admin_audit_logs (
            admin_id,
            action,
            target_type,
            target_id,
            details,
            created_at
        ) VALUES (
            auth.uid(),
            'cleanup_missing_vault_credentials',
            'system_configuration',
            'vault',
            jsonb_build_object(
                'error', 'Project URL or service_role_key secret not configured in Supabase Vault',
                'project_url_configured', (v_project_url IS NOT NULL AND v_project_url <> ''),
                'service_key_configured', (v_service_key IS NOT NULL AND v_service_key <> ''),
                'session_user', session_user,
                'caller_role', COALESCE(auth.role(), 'internal')
            ),
            timezone('utc'::text, now())
        );

        -- Still release stale reservations and subscriptions in database
        PERFORM public.release_stale_reservations();
        PERFORM public.downgrade_expired_subscriptions();

        RAISE WARNING 'Automatic media cleanup skipped: project_url or service_role_key not found in Supabase Vault. Incident recorded in admin_audit_logs.';

        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_vault_credentials',
            'message', 'Automated cleanup skipped: project_url or service_role_key not configured in Supabase Vault. See admin_audit_logs for details.'
        );
    END IF;

    -- 4. Dispatch authenticated HTTP POST via pg_net and handle dispatch errors
    BEGIN
        SELECT net.http_post(
            url := rtrim(v_project_url, '/') || '/functions/v1/cleanup-expired-media',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := '{"triggered_by": "pg_cron"}'::jsonb
        ) INTO v_request_id;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.admin_audit_logs (
            admin_id,
            action,
            target_type,
            target_id,
            details,
            created_at
        ) VALUES (
            auth.uid(),
            'cleanup_http_dispatch_failed',
            'pg_net',
            'cleanup-expired-media',
            jsonb_build_object(
                'error', SQLERRM,
                'project_url', rtrim(v_project_url, '/')
            ),
            timezone('utc'::text, now())
        );

        PERFORM public.release_stale_reservations();
        PERFORM public.downgrade_expired_subscriptions();

        RAISE WARNING 'Failed to dispatch cleanup HTTP request via pg_net: %', SQLERRM;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'http_dispatch_failed',
            'error', SQLERRM
        );
    END;

    -- 5. Release any expired quota reservations and downgrade expired subscriptions
    PERFORM public.release_stale_reservations();
    PERFORM public.downgrade_expired_subscriptions();

    RETURN jsonb_build_object(
        'success', true,
        'status', 'dispatched',
        'http_request_id', v_request_id,
        'timestamp', timezone('utc'::text, now())
    );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_cleanup_expired_media() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_cleanup_expired_media() TO service_role;

-- 3. Automated Scheduling via pg_cron & pg_net
-- Configures the 30-minute automated schedule for the cleanup routine.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

        PERFORM cron.unschedule('cleanup-expired-media-job')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-media-job');

        PERFORM cron.schedule(
            'cleanup-expired-media-job',
            '*/30 * * * *',
            'SELECT public.invoke_cleanup_expired_media();'
        );

        RAISE NOTICE 'Scheduled cleanup-expired-media-job successfully (every 30 minutes).';
    ELSE
        RAISE WARNING 'pg_cron or pg_net extension not enabled. Enable pg_cron and pg_net under Project Settings -> Database -> Extensions to activate automatic scheduling.';
    END IF;
END $$;

-- ==============================================================================
-- 4. Comprehensive Database Verification Checks
-- ==============================================================================
-- Execute these queries after running scripts 01 through 05 to verify setup integrity:

-- Check A: Verify all tables have Row Level Security active
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'profiles', 'admin_roles', 'packages', 'usage_quotas', 'quota_reservations',
    'upload_requests', 'media_assets', 'payment_requests', 'watermark_settings', 
    'app_settings', 'admin_private_settings', 'notification_logs', 'admin_audit_logs'
  )
ORDER BY tablename ASC;

-- Check B: Verify is_admin() and is_super_admin() return false for anonymous calls
SELECT 
    public.is_admin() AS anon_is_admin,
    public.is_super_admin() AS anon_is_super_admin;

-- Check C: Verify baseline subscription packages are present
SELECT id, name, price, monthly_pictures, monthly_videos, watermark_required 
FROM public.packages 
ORDER BY price ASC;

-- Check D: Verify official application settings
SELECT app_name, official_whatsapp_number, official_contact_name, official_country_code 
FROM public.app_settings 
WHERE id = 1;

-- Check E: Verify publication contains required tables for Realtime
SELECT pubname, schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename ASC;

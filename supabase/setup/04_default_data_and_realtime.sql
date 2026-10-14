-- ==============================================================================
-- 04_default_data_and_realtime.sql
-- Breezing Status HD — Production Seeds, Idempotent Realtime & Admin Setup
-- Run this FOURTH in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Default Packages Seed
-- ON CONFLICT DO NOTHING guarantees that administrator customizations to pricing
-- or quotas are NEVER overwritten if this setup script is rerun.
INSERT INTO public.packages (
    id, name, price, currency, duration_days, monthly_pictures, monthly_videos, 
    max_video_size_mb, watermark_required, description, is_active
) VALUES 
    (
        'free',
        'Free',
        0.00,
        'MWK',
        30,
        30,
        2,
        20,
        true,
        'Starter plan for personal WhatsApp status. 30 HD pictures & 2 videos monthly with watermark.',
        true
    ),
    (
        'premium',
        'Premium',
        3500.00,
        'MWK',
        30,
        100,
        10,
        20,
        false,
        'Crystal-clear HD media without watermark. 100 pictures & 10 videos with priority delivery.',
        true
    ),
    (
        'business',
        'Business Pro',
        8000.00,
        'MWK',
        30,
        300,
        35,
        35,
        false,
        'For brands, influencers & power users. 300 pictures, 35 videos, no watermark & VIP fast queue.',
        true
    )
ON CONFLICT (id) DO NOTHING;

-- 2. Default Watermark Settings Seed
-- ON CONFLICT DO NOTHING preserves admin branding and positioning choices.
INSERT INTO public.watermark_settings (
    id, logo_url, position, relative_size, opacity, padding_pixels, enabled_for_free
) VALUES (
    1,
    '/watermark-logo.png',
    'bottom-right',
    0.15,
    0.85,
    32,
    true
)
ON CONFLICT (id) DO NOTHING;

-- 3. Default Application Settings Seed (Public Configuration)
-- Preserves business contact information and operational flags on repeat executions.
INSERT INTO public.app_settings (
    id, app_name, service_available, maintenance_mode, delivery_estimate_text,
    delivery_estimate_busy_text, retention_hours, 
    official_whatsapp_number, official_contact_name, official_country_code, payment_demo_mode
) VALUES (
    1,
    'breezing status HD',
    true,
    false,
    'Usually ready in 5–10 minutes. Please allow up to 1 hour.',
    'High traffic. Delivery may take 20–45 minutes.',
    24,
    '+265 99 374 1274',
    'Breezing Status HD',
    '+265',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 3b. Default Administrator Private Settings Seed (Administrator-Only)
-- Preserves private administrator alert email and notification flags.
INSERT INTO public.admin_private_settings (
    id, admin_email, email_alerts_enabled
) VALUES (
    1,
    'breezingstatus@gmail.com',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Idempotent Realtime Publication Setup
-- Safely creates the publication if missing, and inspects existing tables before adding
-- to completely prevent duplicate-table errors upon rerun.
DO $$
DECLARE
    v_tbl text;
    v_tables text[] := ARRAY['packages', 'watermark_settings', 'app_settings', 'upload_requests', 'usage_quotas'];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH v_tbl IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = v_tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 5. Initial Super-Administrator Provisioning Instruction
-- ==============================================================================
-- To grant super-administrator privileges to your own account, complete Google 
-- Sign-In once on the web app to create your auth.users record.
-- Then execute the following query in the Supabase SQL Editor with your email:
--
-- INSERT INTO public.admin_roles (user_id, email, role, assigned_by)
-- SELECT id, email, 'super_admin', 'initial_database_setup'
-- FROM auth.users
-- WHERE email = 'YOUR_EMAIL@gmail.com'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'YOUR_EMAIL@gmail.com';

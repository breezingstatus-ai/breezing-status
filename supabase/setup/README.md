# Breezing Status HD — Supabase Database Installation Guide

This folder (`supabase/setup/`) is the **single official source of truth** for setting up the Supabase PostgreSQL database from zero.

---

## 📋 SQL Execution Order

Execute each script sequentially in the **Supabase Dashboard → SQL Editor** (New Query):

1. **`01_initial_schema.sql`**
   - Enables `uuid-ossp` and `pgcrypto`.
   - Creates all 12 core tables: `profiles`, `admin_roles`, `packages`, `usage_quotas`, `quota_reservations`, `upload_requests`, `media_assets`, `payment_requests`, `watermark_settings`, `app_settings`, `notification_logs`, `admin_audit_logs`.
   - Sets default `whatsapp_consent` to `false` and isolates profile avatars from temporary request media.
   - Creates performance indexes on all foreign keys, status fields, and query timestamps.

2. **`02_functions_and_triggers.sql`**
   - Establishes `admin_roles` as the sole trusted source for administrative authority.
   - Protects against accidental removal of the final super-administrator (`protect_super_admin_operations`).
   - Locks down customer profile updates to prevent forging Google-linked email, account role, or subscription (`protect_profile_immutable_fields`).
   - Enforces backend subscription expiry check inside `reserve_media_quota` (automatically falls back to Free allowance if expired).
   - Protects quota finalization (`finalize_media_quota` is granted strictly to `service_role`).
   - Protects `get_failed_deletion_assets` with an internal `is_admin()` check to prevent customer information exposure.
   - Enforces official package pricing on payment submissions (`validate_payment_request`).

3. **`03_row_level_security.sql`**
   - Revokes default public table access.
   - Enables Row Level Security on all 12 tables.
   - Grants appropriate table privileges so administrator actions and customer queries function properly under RLS.
   - Blocks direct customer insertion into `upload_requests` and `media_assets` (enforcing verified creation via the `finalize-request` Edge Function).
   - Locks down role creation strictly to `super_admin`.

4. **`04_default_data_and_realtime.sql`**
   - Seeds baseline packages (`Free`, `Premium`, `Business Pro`) using `ON CONFLICT (id) DO NOTHING` so customizations are never overwritten on repeat runs.
   - Seeds official application contact (`+265 99 374 1274`) and watermark settings.
   - Safely creates and populates the `supabase_realtime` publication with duplicate-table protection.

5. **`05_cleanup_and_maintenance.sql`**
   - Installs batch asset retrieval functions (`get_expired_assets_for_cleanup` and `invoke_cleanup_expired_media`).
   - Configures the automated 30-minute `pg_cron` schedule with Supabase Vault integration.
   - Runs 5 automated database verification checks (RLS status, anonymous isolation, packages, settings, and Realtime).

---

## 👑 Assigning Super-Administrator Privileges

After running the 5 SQL scripts:

1. Visit the Breezing Status HD web application and sign in with your Google account.
2. In the Supabase SQL Editor, run this query replacing `'YOUR_EMAIL@gmail.com'` with your actual email:

```sql
INSERT INTO public.admin_roles (user_id, email, role, assigned_by)
SELECT id, email, 'super_admin', 'initial_database_setup'
FROM auth.users
WHERE email = 'YOUR_EMAIL@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'YOUR_EMAIL@gmail.com';
```

---

## 🔒 Supabase Vault Setup for Automated Cleanup Cron

To enable the automated 30-minute Cloudinary media cleanup job via `pg_cron` and `pg_net`:

1. Ensure `pg_cron` and `pg_net` extensions are enabled in **Database → Extensions**.
2. Run this snippet in the SQL Editor with your Supabase Project details:

```sql
SELECT vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
```

---

## ⚡ Edge Functions Deployment

Deploy the four backend Edge Functions using the Supabase CLI:

```bash
supabase functions deploy delete-account
supabase functions deploy cleanup-expired-media
supabase functions deploy sign-cloudinary-upload
supabase functions deploy finalize-request
```

### Required Edge Function Secrets

Set your external credentials in the Supabase Dashboard under **Project Settings → Edge Functions → Secrets** (or via CLI):

```bash
supabase secrets set \
  CLOUDINARY_CLOUD_NAME="your_cloud_name" \
  CLOUDINARY_API_KEY="your_api_key" \
  CLOUDINARY_API_SECRET="your_api_secret" \
  RESEND_API_KEY="your_resend_api_key" \
  ADMIN_NOTIFICATION_EMAIL="breezingstatus@gmail.com" \
  RESEND_FROM_EMAIL="notifications@yourdomain.com"
```

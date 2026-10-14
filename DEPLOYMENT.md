# BREEZING STATUS HD — DEVELOPER & DEPLOYMENT GUIDE

This document contains backend deployment, environment configuration, and hosting instructions for **Breezing Status HD**.

---

## 1. Hosting Architecture Overview

- **Frontend Hosting**: Cloudflare Pages / Cloudflare Workers with Static Assets (output directory `dist`, build command `npm run build`, configured via `wrangler.toml`).
- **Database & Auth**: Supabase PostgreSQL, Supabase Google OAuth, Supabase Realtime, and Supabase Edge Functions.
- **Media Storage**: Cloudinary (temporary 24-hour authenticated storage with automated purge).
- **Transactional Notifications**: Resend API (`breezingstatus@gmail.com`).

---

## 2. Supabase PostgreSQL Migrations

Execute the migration scripts in `/supabase/migrations/` in sequential order in your Supabase SQL Editor:

1. `001_schema.sql` — Core database tables (profiles, packages, usage_quotas, upload_requests, media_assets, payment_requests, watermark_settings, app_settings, notification_logs, admin_audit_logs).
2. `002_security_policies.sql` — Row Level Security (RLS) policies and initial `is_admin()` function.
3. `003_functions_and_triggers.sql` — Triggers for auth profile creation, timestamp updates, and atomic quota functions.
4. `004_default_settings.sql` — Initial packages (Free, Premium, Business Pro), default watermark parameters, and global app settings.
5. `005_indexes_and_constraints.sql` — Performance indexes for rapid lookups and expiration cleanup queries.
6. `006_cleanup_schedule.sql` — Automated 24-hour media expiration query functions and pg_cron integration.
7. `007_realtime_configuration.sql` — Realtime publication setup for instant live synchronization of packages, watermark settings, quotas, and upload requests.
8. `008_security_tests.sql` — Security test assertions validating RLS rules and timezone calculations.
9. `009_official_contact.sql` — Dynamic official business contact settings.
10. `010_admin_roles_and_pin_removal.sql` — **NEW**: Completely removes obsolete admin PIN, creates protected `admin_roles` table for server-side Google account authorization, reinforces `is_admin()` security definer function, updates official WhatsApp number to `+265 99 374 1274`, and adds processing stage tracking columns.

---

## 3. Supabase Edge Functions

Deploy the Edge Functions via the Supabase CLI:

```bash
# 1. Generate secure signed upload tokens for Cloudinary
supabase functions deploy sign-cloudinary-upload

# 2. Finalize media submission, atomic quota commit, and Resend alert
supabase functions deploy finalize-request

# 3. Automated 24-hour purge of expired Cloudinary assets
supabase functions deploy cleanup-expired-media
```

### Edge Function Environment Secrets (Set in Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets):
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDINARY_API_KEY`: Your Cloudinary API key
- `CLOUDINARY_API_SECRET`: Your Cloudinary API secret
- `CLOUDINARY_CLOUD_NAME`: `scaycidy`
- `RESEND_API_KEY`: Your Resend API key
- `ADMIN_NOTIFICATION_EMAIL`: `breezingstatus@gmail.com`
- `RESEND_FROM_EMAIL`: `notifications@breezing.com`
- `ADMIN_BOOTSTRAP_EMAILS`: `breezingstatus@gmail.com`
- `APP_URL`: Your production Cloudflare URL

---

## 4. Cloudflare Deployment Resolution

The repository is configured with `wrangler.toml` at the root to prevent the error:
`Could not detect a directory containing static files (e.g. html, css and js) for the project.`

### When using Cloudflare Pages:
1. Connect Git repository in Cloudflare Pages Dashboard.
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Root directory: `/` (or leave blank)
5. Environment Variables in Cloudflare Pages Dashboard:
   - `VITE_APP_NAME`: `breezing status HD`
   - `VITE_APP_ENV`: `production`
   - `VITE_SUPABASE_URL`: `https://mzmnjrrgnqvzzxzupydx.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable key or anon JWT
   - `VITE_CLOUDINARY_CLOUD_NAME`: `scaycidy`
   - `VITE_DEFAULT_THEME`: `light`
   - `VITE_PAYMENT_DEMO_MODE`: `true`

### When deploying via Wrangler CLI:
```bash
npm run deploy
# or for Pages directly:
npm run deploy:pages
```

---

## 5. Google OAuth Configuration in Supabase

1. Go to **Google Cloud Console** -> **APIs & Services** -> **Credentials**.
2. In **Authorized redirect URIs**, add your Supabase Auth callback:
   `https://mzmnjrrgnqvzzxzupydx.supabase.co/auth/v1/callback`
3. In **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Google**:
   - Enable Google provider.
   - Enter your Client ID and Client Secret.
   - Save changes.

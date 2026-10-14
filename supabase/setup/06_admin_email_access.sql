-- Apply after the standard setup. Only verified owner emails get admin access.
-- The email comes from auth.users, never editable user metadata or a browser cache.
BEGIN;
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id = u.id
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
      AND p.status = 'active'
      AND lower(u.email) IN (
        'breezingpix@gmail.com', 'mphepobenedict@gmail.com', 'breezingstatus@gmail.com'
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;
UPDATE public.watermark_settings SET logo_url = '/watermark-logo.svg'
WHERE id = 1 AND logo_url = '/watermark-logo.png';
COMMIT;

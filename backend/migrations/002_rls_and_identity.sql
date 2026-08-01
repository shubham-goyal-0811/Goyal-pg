-- 002_rls_and_identity.sql
-- STATUS: NOT YET APPLIED. Run this in the Supabase SQL editor.
--
-- Fixes two things:
--   A. No Row Level Security. The frontend ships the anon key (it is public by
--      design — it's in the JS bundle). Without RLS, anyone holding it can talk
--      to PostgREST directly and read every tenant's Aadhaar number, or run
--      `update users set role='admin'` and then pass every backend roleCheck
--      legitimately. Express RBAC is bypassed entirely.
--   B. public.users.id drifting away from auth.users.id, which made the backend
--      (looked up by email) and the frontend (looks up by id) disagree.
--
-- Design: the backend uses the service_role key, which bypasses RLS, so every
-- API route keeps working untouched. The browser needs exactly ONE thing —
-- reading its own role — so that is the only policy we grant. Everything else
-- is RLS-on with zero policies, i.e. denied.

BEGIN;

-- ── A. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings            ENABLE ROW LEVEL SECURITY;

-- Start from a known-clean slate. This repo defines no policies, so anything
-- present was added ad hoc in the dashboard and is not tracked anywhere.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users','rooms','tenants','tenant_documents','rent_payments',
                        'meter_readings','gate_log','police_verification','settings')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- The single policy the browser needs: read your OWN row, nothing else.
-- No INSERT/UPDATE/DELETE policy exists, so a user cannot promote themselves.
-- handle_new_user() is SECURITY DEFINER and bypasses this on signup.
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ── B. Keep public.users.id aligned with auth.users.id ───────────────────────

-- Repair any existing drift (from the old ON CONFLICT DO NOTHING behaviour).
UPDATE public.users u
SET id = a.id
FROM auth.users a
WHERE u.email = a.email
  AND u.id IS DISTINCT FROM a.id;

-- Re-point the row on re-signup instead of silently leaving a stale id.
-- `role` is deliberately never overwritten, so promotions survive.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'viewer'  -- New sign-ins get no access; promote manually
  )
  ON CONFLICT (email) DO UPDATE
    SET id        = EXCLUDED.id,
        full_name = EXCLUDED.full_name
    WHERE public.users.id IS DISTINCT FROM EXCLUDED.id;
  RETURN new;
END;
$$;

-- ── C. Storage ───────────────────────────────────────────────────────────────
-- ID scans live here. The backend signs short-lived URLs with the service key,
-- so the bucket never needs to be public.
UPDATE storage.buckets SET public = false WHERE id = 'Goyal-pg';

COMMIT;

-- ── Verification — run these after and eyeball the output ────────────────────
--
-- 1. Every app table should report rowsecurity = true:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--
-- 2. Exactly one policy should exist, users_select_own:
--    SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='public';
--
-- 3. No id drift left:
--    SELECT u.email FROM public.users u JOIN auth.users a USING (email) WHERE u.id <> a.id;
--
-- 4. Confirm who is actually privileged — anyone unexpected here is a live admin:
--    SELECT email, role FROM public.users ORDER BY role;
--
-- 5. Check for stray storage policies granting anon access:
--    SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='storage';

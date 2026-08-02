-- ============================================================
-- 004_tenant_portal.sql
-- STATUS: NOT YET APPLIED. Run this in the Supabase SQL editor.
--
-- Opens the app to two audiences it has never had:
--
--   A. Residents. The `tenant` value has sat in the user_role enum since day
--      one doing nothing (seed.sql called it "legacy"). To make it real, a
--      tenants row needs to know which auth account belongs to it. Two new
--      columns do that: login_email is what an ADMIN types in, user_id is what
--      the backend fills in the first time that person actually signs in.
--
--      Splitting it across two columns is deliberate. login_email alone would
--      mean re-matching a string on every request; user_id alone would give an
--      admin no way to grant access before the tenant has ever logged in.
--
--   B. Prospective residents. The public landing page needs somewhere to put
--      enquiries. That is the only table in this schema a stranger can cause a
--      write to, so it holds no references to anything else.
--
-- Idempotent — safe to re-run.
-- ============================================================

BEGIN;

-- ── A. Tenant portal identity ────────────────────────────────────────────────

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS login_email text;

-- ON DELETE SET NULL: removing an auth account should revoke portal access,
-- not block the delete or orphan the tenant record. The tenant row is the
-- property's record of a resident and outlives any login.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- One auth account maps to at most one tenant row. Without this, a mis-typed
-- login_email on two records could point both at the same person, and /me
-- would return whichever row Postgres happened to hand back first.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_user_id_key
  ON public.tenants (user_id)
  WHERE user_id IS NOT NULL;

-- Two ACTIVE tenants must never claim the same email — that is the ambiguity
-- the linker in routes/me.js cannot resolve safely. Vacated rows are exempt on
-- purpose: a resident who leaves and comes back gets a fresh tenants row with
-- the same address, and their old row must not block it.
--
-- Guard first: the index build fails outright on an existing collision, and a
-- bare "could not create unique index" tells you nothing about which rows.
DO $$
DECLARE dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(login_email)
    FROM public.tenants
    WHERE status = 'active' AND login_email IS NOT NULL
    GROUP BY lower(login_email)
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Found % email(s) shared by more than one ACTIVE tenant. Resolve these before indexing.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_login_email_active_key
  ON public.tenants (lower(login_email))
  WHERE status = 'active' AND login_email IS NOT NULL;

-- The linker looks tenants up by user_id on every portal request.
CREATE INDEX IF NOT EXISTS tenants_user_id_idx ON public.tenants (user_id);

-- ── B. Enquiries from the public landing page ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enquiry_status') THEN
    CREATE TYPE enquiry_status AS ENUM ('new', 'contacted', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.enquiries (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  phone      text NOT NULL,
  email      text,
  message    text,
  status     enquiry_status NOT NULL DEFAULT 'new',
  created_at timestamp with time zone DEFAULT now()
);

-- The admin inbox reads newest-first and filters on status.
CREATE INDEX IF NOT EXISTS enquiries_status_created_idx
  ON public.enquiries (status, created_at DESC);

-- Same posture as every other table: RLS on, zero policies, so anon and
-- authenticated are both denied. The only writer is the backend's
-- service_role key, which bypasses RLS. A public POST route in Express is a
-- deliberate, rate-limited door — it is NOT a reason to open PostgREST.
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── Verification — run these after and eyeball the output ────────────────────
--
-- 1. Both columns present:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='tenants'
--      AND column_name IN ('login_email','user_id');
--
-- 2. Both partial unique indexes present:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname='public' AND tablename='tenants'
--      AND indexname LIKE 'tenants_%_key';
--
-- 3. enquiries locked down — expect rowsecurity = true and ZERO policies:
--    SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='enquiries';
--    SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='enquiries';
--
-- 4. Grant a test tenant portal access (replace both values):
--    UPDATE public.tenants SET login_email = lower('resident@example.com') WHERE id = 1;
--
-- 5. After that person signs in once, confirm the link landed:
--    SELECT t.id, t.full_name, t.login_email, u.email, u.role
--    FROM public.tenants t JOIN public.users u ON u.id = t.user_id
--    WHERE t.user_id IS NOT NULL;
--
-- 6. Anyone unexpectedly holding portal access — review this like the admin list:
--    SELECT id, full_name, login_email, user_id, status FROM public.tenants
--    WHERE login_email IS NOT NULL ORDER BY status, full_name;

-- ============================================================
-- verify_schema.sql — read-only. Changes nothing.
--
-- Run in the Supabase SQL editor to confirm every migration landed.
--
-- ONE statement on purpose: the SQL editor only renders the result of the last
-- statement it runs, so a file with two SELECTs silently drops the first one.
-- Schema checks and the access list are UNIONed into a single result instead.
--
-- Expect: every SCHEMA row reads PASS. Anything FAIL names the migration to
-- re-run. ACCESS rows list who can currently use the app.
-- ============================================================

WITH checks AS (
  -- ── 003_electricity_billing.sql ────────────────────────────────────────
  SELECT
    '003' AS migration,
    'rent_payments UNIQUE (tenant_id, billing_month)' AS check_name,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.rent_payments'::regclass
        AND conname  = 'rent_payments_tenant_month_key'
    ) AS ok

  UNION ALL SELECT '003',
    'meter_readings index on (room_id, reading_date)',
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'meter_readings_room_date_idx'
    )

  UNION ALL SELECT '003',
    'meter_readings CHECK reading_value >= 0',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.meter_readings'::regclass
        AND conname  = 'meter_readings_value_non_negative'
    )

  -- ── 001_roles_and_default_viewer.sql ───────────────────────────────────
  UNION ALL SELECT '001',
    'user_role enum contains gatekeeper',
    EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'gatekeeper'
    )

  UNION ALL SELECT '001',
    'user_role enum contains viewer',
    EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'viewer'
    )

  UNION ALL SELECT '001',
    'users.role DEFAULT is viewer (new sign-ins get no access)',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'role' AND column_default LIKE '%viewer%'
    )

  UNION ALL SELECT '001',
    'on_auth_user_created trigger present',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')

  -- ── 002_rls_and_identity.sql ───────────────────────────────────────────
  UNION ALL SELECT '002',
    'RLS enabled on all 9 public tables',
    (
      SELECT count(*) FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('users','rooms','tenants','tenant_documents','rent_payments',
                          'meter_readings','gate_log','police_verification','settings')
        AND rowsecurity
    ) = 9

  UNION ALL SELECT '002',
    'users_select_own policy exists',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_select_own'
    )

  UNION ALL SELECT '002',
    'no policies on any table except users (anon sees nothing)',
    NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename <> 'users'
    )

  UNION ALL SELECT '002',
    'no INSERT/UPDATE/DELETE policy on users (no self-promotion)',
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users' AND cmd <> 'SELECT'
    )

  UNION ALL SELECT '002',
    'storage bucket Goyal-pg is private',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'Goyal-pg' AND public = false)
),

report AS (
  SELECT
    1                                          AS grp,
    CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END   AS status,
    'SCHEMA'                                   AS kind,
    migration                                  AS ref,
    check_name                                 AS detail
  FROM checks

  UNION ALL

  -- Everyone here should be deliberate. Anyone unrecognised should go back to
  -- 'viewer': UPDATE public.users SET role = 'viewer' WHERE email = '...';
  SELECT
    2,
    upper(role::text),
    'ACCESS',
    to_char(created_at, 'YYYY-MM-DD'),
    email
  FROM public.users
)

SELECT status, kind, ref, detail
FROM report
ORDER BY
  grp,
  (status = 'PASS'),                  -- failures first
  CASE status WHEN 'ADMIN' THEN 1 WHEN 'GATEKEEPER' THEN 2 ELSE 3 END,
  ref,
  detail;

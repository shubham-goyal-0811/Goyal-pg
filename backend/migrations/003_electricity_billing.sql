-- ============================================================
-- 003_electricity_billing.sql
--
-- Makes rent generation actually run. Two problems:
--
-- 1. routes/tenants.js upserts rent_payments with
--    onConflict: 'tenant_id,billing_month', but no unique constraint on that
--    pair exists. Postgres rejects that outright:
--      42P10: there is no unique or exclusion constraint matching the
--             ON CONFLICT specification
--    i.e. EVERY call to generate rent errored out.
--
-- 2. services/electricity.js now looks up readings by (room_id, reading_date)
--    without a lower bound, so give it an index to walk.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- Guard: a duplicate (tenant_id, billing_month) pair would make the constraint
-- fail to build. There should never be one; surface it loudly if there is.
DO $$
DECLARE
  dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT tenant_id, billing_month
    FROM public.rent_payments
    GROUP BY tenant_id, billing_month
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Found % tenant/month pair(s) billed more than once. Resolve these before adding the unique constraint.', dupes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.rent_payments'::regclass
      AND conname  = 'rent_payments_tenant_month_key'
  ) THEN
    ALTER TABLE public.rent_payments
      ADD CONSTRAINT rent_payments_tenant_month_key UNIQUE (tenant_id, billing_month);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS meter_readings_room_date_idx
  ON public.meter_readings (room_id, reading_date);

-- A reading can never be negative. The API validates this, but the API is not
-- the only thing that can write here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meter_readings'::regclass
      AND conname  = 'meter_readings_value_non_negative'
  ) THEN
    ALTER TABLE public.meter_readings
      ADD CONSTRAINT meter_readings_value_non_negative CHECK (reading_value >= 0);
  END IF;
END $$;

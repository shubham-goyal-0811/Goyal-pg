-- Create tables
CREATE TABLE settings (
  id serial PRIMARY KEY,
  electricity_rate_per_unit decimal NOT NULL DEFAULT 8.0,
  total_parking_spots int NOT NULL DEFAULT 10,
  updated_at timestamp with time zone DEFAULT now()
);

-- 'staff' and 'tenant' are legacy/reserved and grant nothing.
-- Live vocabulary: admin (full access), gatekeeper (desk work), viewer (none).
-- Keep this in sync with backend/config/roles.js.
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'tenant', 'gatekeeper', 'viewer');
CREATE TABLE users (
  id uuid PRIMARY KEY, -- links to auth.users
  email text NOT NULL UNIQUE,
  google_id text,
  full_name text,
  role user_role NOT NULL DEFAULT 'viewer', -- new sign-ups get no access
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE rooms (
  id serial PRIMARY KEY,
  room_number text NOT NULL UNIQUE,
  floor int NOT NULL,
  capacity int NOT NULL,
  has_ac boolean NOT NULL,
  seat_rent decimal NOT NULL,
  ac_charge decimal NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TYPE tenant_status AS ENUM ('active', 'vacated');
CREATE TYPE id_proof_type_enum AS ENUM ('aadhaar', 'pan', 'passport', 'driving_license');

CREATE TABLE tenants (
  id serial PRIMARY KEY,
  room_id int REFERENCES rooms(id),
  full_name text NOT NULL,
  phone_number text NOT NULL,
  address text,
  id_proof_type id_proof_type_enum,
  id_proof_number text,
  ac_opted boolean DEFAULT false,
  has_vehicle boolean DEFAULT false,
  vehicle_number text,
  check_in_date date NOT NULL DEFAULT CURRENT_DATE,
  check_out_date date,
  status tenant_status NOT NULL DEFAULT 'active',
  security_deposit_amount decimal,
  parent_contact text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TYPE doc_type_enum AS ENUM ('id_proof_front', 'id_proof_back', 'photo', 'other');
CREATE TABLE tenant_documents (
  id serial PRIMARY KEY,
  tenant_id int REFERENCES tenants(id),
  doc_type doc_type_enum NOT NULL,
  file_url text NOT NULL,
  ocr_raw_data jsonb,
  uploaded_at timestamp with time zone DEFAULT now()
);

CREATE TYPE payment_status AS ENUM ('pending', 'paid');
CREATE TABLE rent_payments (
  id serial PRIMARY KEY,
  tenant_id int REFERENCES tenants(id),
  billing_month date NOT NULL,
  seat_rent decimal NOT NULL,
  ac_charge decimal NOT NULL,
  electricity_charge decimal NOT NULL,
  total_amount decimal NOT NULL,
  amount_paid decimal NOT NULL DEFAULT 0,
  status payment_status NOT NULL DEFAULT 'pending',
  paid_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  -- Rent generation upserts on this pair so re-running a month is safe.
  -- Without the constraint the upsert fails outright (42P10).
  CONSTRAINT rent_payments_tenant_month_key UNIQUE (tenant_id, billing_month)
);

CREATE TYPE reading_trigger AS ENUM ('routine', 'checkout');
CREATE TABLE meter_readings (
  id serial PRIMARY KEY,
  room_id int REFERENCES rooms(id),
  reading_date date NOT NULL,
  reading_value int NOT NULL CHECK (reading_value >= 0),
  active_tenant_ids int[] NOT NULL,
  triggered_by reading_trigger NOT NULL DEFAULT 'routine',
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX meter_readings_room_date_idx ON meter_readings (room_id, reading_date);

CREATE TABLE gate_log (
  id serial PRIMARY KEY,
  tenant_id int REFERENCES tenants(id),
  visitor_name text,
  in_time timestamp with time zone NOT NULL DEFAULT now(),
  out_time timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TYPE police_verif_status AS ENUM ('pending', 'submitted', 'verified');
CREATE TABLE police_verification (
  id serial PRIMARY KEY,
  tenant_id int REFERENCES tenants(id) UNIQUE,
  status police_verif_status NOT NULL DEFAULT 'pending',
  submitted_date date,
  verified_date date,
  reference_number text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Seed initial settings
INSERT INTO settings (electricity_rate_per_unit, total_parking_spots) VALUES (8.0, 10);

-- Seed initial rooms (5x 3-seater on floor 1, 1x 6-seater on terrace)
INSERT INTO rooms (room_number, floor, capacity, has_ac, seat_rent, ac_charge) VALUES
('101', 1, 3, true, 5000, 1000),
('102', 1, 3, true, 5000, 1000),
('103', 1, 3, true, 5000, 1000),
('104', 1, 3, false, 4500, 0),
('105', 1, 3, false, 4500, 0),
('201', 2, 6, true, 4000, 1000); -- Terrace / Floor 2

-- ============================================================
-- TRIGGER: auto-insert into public.users on first Google login
-- Run this in Supabase SQL Editor ONCE after creating tables.
--
-- Google OAuth accepts ANY Google account, so this must NOT hand out access.
-- New sign-ins land on 'viewer' (no access anywhere); promote deliberately:
--   UPDATE public.users SET role = 'admin' WHERE email = 'owner@example.com';
-- ============================================================
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
    'viewer'
  )
  -- Re-point the row if the auth user was deleted and recreated, otherwise a
  -- stale id makes the frontend (looks up by id) and backend disagree.
  -- `role` is never overwritten, so promotions survive.
  ON CONFLICT (email) DO UPDATE
    SET id        = EXCLUDED.id,
        full_name = EXCLUDED.full_name
    WHERE public.users.id IS DISTINCT FROM EXCLUDED.id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- The anon key is public (it ships in the JS bundle). Without RLS, anyone
-- holding it can hit PostgREST directly and bypass the Express RBAC entirely.
-- The backend uses the service_role key and bypasses RLS, so API routes are
-- unaffected. The browser needs exactly one thing: reading its own role.
-- ============================================================
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings            ENABLE ROW LEVEL SECURITY;

-- Only policy in the system. No INSERT/UPDATE/DELETE policy on users exists,
-- so a signed-in user cannot promote themselves. Every other table has RLS on
-- with zero policies, i.e. denied to anon and authenticated alike.
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

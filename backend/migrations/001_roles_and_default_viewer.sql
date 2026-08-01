-- 001_roles_and_default_viewer.sql
-- STATUS: already applied manually via the Supabase SQL editor.
-- Recorded here so the repo matches the live database.
--
-- Closes: "any Google account that signs in becomes an admin".
-- New sign-ins now land on 'viewer', which grants nothing anywhere.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS parent_contact text;

-- 1. Add the roles the application code actually references.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gatekeeper';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';

-- 2. Future signups default to no access.
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';

-- 3. Trigger enforces 'viewer' for new signups; promote manually.
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
  ON CONFLICT (email) DO NOTHING;
  RETURN new;
END;
$$;

-- Migration 001: Profiles and Roles
-- Adds user profiles with role system (gm / admin)
-- Replaces hardcoded admin UUID with proper role management

CREATE TYPE user_role AS ENUM ('gm', 'admin');

CREATE TABLE profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  role          user_role   NOT NULL DEFAULT 'gm',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-create a profile (role: gm) when a new user registers
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'gm'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Seed profile for the existing hardcoded admin user
-- The role can be updated via the admin UI; this is just the bootstrap
INSERT INTO profiles (id, display_name, role)
SELECT id, split_part(email, '@', 1), 'admin'
FROM auth.users
WHERE id = '8c324ca8-0da6-4216-8579-d02c4887dda3'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Seed profiles for any existing users that don't have one yet
INSERT INTO profiles (id, display_name, role)
SELECT id, split_part(email, '@', 1), 'gm'
FROM auth.users
WHERE id != '8c324ca8-0da6-4216-8579-d02c4887dda3'
ON CONFLICT (id) DO NOTHING;

-- Helper: check if the calling user is an admin (used in RLS policies)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admins can read all
CREATE POLICY "profiles: own read"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

-- Users can update their own display_name only (not role)
CREATE POLICY "profiles: own update display_name"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Only admins can change roles
CREATE POLICY "profiles: admin full access"
  ON profiles FOR ALL
  USING (is_admin());

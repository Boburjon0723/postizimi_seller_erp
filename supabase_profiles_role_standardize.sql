-- profiles.role yagona standart:
-- user | seller | erp | crm | admin

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE public.profiles
SET role = CASE
  WHEN LOWER(TRIM(COALESCE(role, ''))) IN ('admin', 'owner', 'superadmin') THEN 'admin'
  WHEN LOWER(TRIM(COALESCE(role, ''))) IN ('erp', 'manager', 'ceo') THEN 'erp'
  WHEN LOWER(TRIM(COALESCE(role, ''))) IN ('crm') THEN 'crm'
  WHEN LOWER(TRIM(COALESCE(role, ''))) IN ('seller', 'sotuvchi', 'pos') THEN 'seller'
  ELSE 'user'
END;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE public.profiles
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'seller', 'erp', 'crm', 'admin'));

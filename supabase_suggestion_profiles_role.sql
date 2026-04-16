-- Nuur ERP / CRM uchun umumiy rol: Supabase SQL Editor da bir marta ishga tushiring.
-- auth.users bilan bog‘langan profil — ikkala loyiha ham bir xil bazadan foydalanadi.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'seller' CHECK (role IN ('seller', 'erp')),
  full_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Avtomatik profil (yangi foydalanuvchi ro‘yxatdan o‘tganda); rol default seller
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nuur_role'), ''), 'seller'),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();

-- Mavjud foydalanuvchilar uchun profil qatorini qo‘lda INSERT qiling yoki:
-- INSERT INTO public.profiles (id, role) VALUES ('<user-uuid>', 'erp') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

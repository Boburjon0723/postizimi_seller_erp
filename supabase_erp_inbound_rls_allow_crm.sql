-- CRM → ERP: `erp_inbound_requests` ga yozish
-- Talab: avval `supabase_erp_roles_rls_hardening.sql` ishgan bo‘lsin (`public.has_internal_access()` mavjud).
--
-- Muammo: `supabase_erp_roles_rls_hardening.sql` dagi `erp_inbound_internal_all` faqat
--   seller / erp / admin uchun. CRM foydalanuvchilari `profiles.role = 'crm'` bo‘lsa,
--   INSERT Supabase tomonidan rad etiladi — ERP «Keltirilgan»da hech narsa ko‘rinmaydi.
--
-- Yechim: ichki rollar to‘liq huquqda qoladi; `crm` va `admin` SELECT + INSERT qiladi;
--   UPDATE/DELETE faqat ichki rollar (qabul/rad etish).

CREATE OR REPLACE FUNCTION public.has_crm_inbound_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('crm', 'admin')
  );
$$;

ALTER TABLE public.erp_inbound_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_inbound_internal_all" ON public.erp_inbound_requests;
DROP POLICY IF EXISTS "erp_inbound_authenticated_all" ON public.erp_inbound_requests;

CREATE POLICY "erp_inbound_select_internal_or_crm"
  ON public.erp_inbound_requests
  FOR SELECT
  TO authenticated
  USING (public.has_internal_access() OR public.has_crm_inbound_access());

CREATE POLICY "erp_inbound_insert_internal_or_crm"
  ON public.erp_inbound_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_internal_access() OR public.has_crm_inbound_access());

CREATE POLICY "erp_inbound_update_internal_only"
  ON public.erp_inbound_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_internal_access())
  WITH CHECK (public.has_internal_access());

CREATE POLICY "erp_inbound_delete_internal_only"
  ON public.erp_inbound_requests
  FOR DELETE
  TO authenticated
  USING (public.has_internal_access());

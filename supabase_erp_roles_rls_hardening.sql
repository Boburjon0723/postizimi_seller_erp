-- ERP RLS hardening (profiles.role asosida)
-- Ichki rollar: seller, erp, admin

CREATE OR REPLACE FUNCTION public.has_internal_access()
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
      AND p.role IN ('seller', 'erp', 'admin')
  );
$$;

ALTER TABLE public.erp_store_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_store_inventory_authenticated_all" ON public.erp_store_inventory;
CREATE POLICY "erp_store_inventory_internal_all"
  ON public.erp_store_inventory
  FOR ALL
  TO authenticated
  USING (public.has_internal_access())
  WITH CHECK (public.has_internal_access());

ALTER TABLE public.erp_sales_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_sales_orders_authenticated_all" ON public.erp_sales_orders;
CREATE POLICY "erp_sales_orders_internal_all"
  ON public.erp_sales_orders
  FOR ALL
  TO authenticated
  USING (public.has_internal_access())
  WITH CHECK (public.has_internal_access());

ALTER TABLE public.erp_sales_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_sales_order_items_authenticated_all" ON public.erp_sales_order_items;
CREATE POLICY "erp_sales_order_items_internal_all"
  ON public.erp_sales_order_items
  FOR ALL
  TO authenticated
  USING (public.has_internal_access())
  WITH CHECK (public.has_internal_access());

ALTER TABLE public.erp_inbound_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_inbound_authenticated_all" ON public.erp_inbound_requests;
CREATE POLICY "erp_inbound_internal_all"
  ON public.erp_inbound_requests
  FOR ALL
  TO authenticated
  USING (public.has_internal_access())
  WITH CHECK (public.has_internal_access());

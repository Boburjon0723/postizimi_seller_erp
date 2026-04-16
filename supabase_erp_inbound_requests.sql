-- CRM → ERP jo‘natish navbatchiligi: «Keltirilgan» sahifasida tasdiqlanguncha kutadi.
-- Qabul qilinganda `erp_store_inventory` yangilanadi.

CREATE TABLE IF NOT EXISTS public.erp_inbound_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  order_number_snapshot TEXT,
  customer_name_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_inbound_one_pending_per_order
  ON public.erp_inbound_requests (order_id)
  WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS idx_erp_inbound_status_created ON public.erp_inbound_requests (status, created_at DESC);

ALTER TABLE public.erp_inbound_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_inbound_authenticated_all" ON public.erp_inbound_requests;
CREATE POLICY "erp_inbound_authenticated_all"
  ON public.erp_inbound_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Do‘kon (ERP) zaxirasi — CRM ombor (`product_inventory`) dan MUSTAQIL.
-- ERP faqat shu jadvaldagi miqdorni ko‘radi/yangilaydi.
-- `product_inventory` — CRM markaziy ombor; aralashmaydi.

CREATE TABLE IF NOT EXISTS public.erp_store_inventory (
  product_id UUID PRIMARY KEY REFERENCES public.products (id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  stock_by_color JSONB,
  avg_cost_usd NUMERIC NOT NULL DEFAULT 0 CHECK (avg_cost_usd >= 0),
  stock_value_usd NUMERIC NOT NULL DEFAULT 0 CHECK (stock_value_usd >= 0),
  status TEXT NOT NULL DEFAULT 'tugagan',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_store_inventory_status ON public.erp_store_inventory (status);

ALTER TABLE public.erp_store_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_store_inventory_authenticated_all" ON public.erp_store_inventory;
CREATE POLICY "erp_store_inventory_authenticated_all"
  ON public.erp_store_inventory
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Barcha mahsulotlar uchun boshlang‘ich qator (0 dona). CRM ombor miqdori NUSXALANMAYDI.
INSERT INTO public.erp_store_inventory (
  product_id,
  quantity,
  stock_by_color,
  avg_cost_usd,
  stock_value_usd,
  status,
  updated_at
)
SELECT p.id, 0, NULL, 0, 0, 'tugagan', NOW()
FROM public.products p
ON CONFLICT (product_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_erp_store_inventory_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.erp_store_inventory (product_id, quantity, stock_by_color, avg_cost_usd, stock_value_usd, status)
  VALUES (NEW.id, 0, NULL, 0, 0, 'tugagan')
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_ensure_erp_store_inventory ON public.products;
CREATE TRIGGER trg_products_ensure_erp_store_inventory
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.ensure_erp_store_inventory_row();

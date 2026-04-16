-- CRM markaziy ombor: katalog `products` + miqdor `product_inventory`.
-- Do‘kon (ERP) zaxirasi alohida: `erp_store_inventory` (supabase_erp_store_inventory.sql).
-- Supabase SQL Editor da bir marta ishga tushiring.

CREATE TABLE IF NOT EXISTS public.product_inventory (
  product_id UUID PRIMARY KEY REFERENCES public.products (id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  stock_by_color JSONB,
  status TEXT NOT NULL DEFAULT 'sotuvda',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_inventory_status ON public.product_inventory (status);

ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_inventory_authenticated_all" ON public.product_inventory;
CREATE POLICY "product_inventory_authenticated_all"
  ON public.product_inventory
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Mavjud mahsulotlardan bir martalik ko‘chirish
INSERT INTO public.product_inventory (product_id, quantity, stock_by_color, status, updated_at)
SELECT
  p.id,
  GREATEST(0, COALESCE(p.stock, 0)::integer),
  p.stock_by_color,
  CASE
    WHEN COALESCE(p.stock, 0) <= 0 THEN 'tugagan'
    WHEN COALESCE(p.stock, 0) <= 5 THEN 'kam_qoldi'
    ELSE 'sotuvda'
  END,
  NOW()
FROM public.products p
ON CONFLICT (product_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  stock_by_color = COALESCE(EXCLUDED.stock_by_color, public.product_inventory.stock_by_color),
  status = EXCLUDED.status,
  updated_at = NOW();

-- Yangi mahsulot qo‘shilganda bo‘sh ombor qatori
CREATE OR REPLACE FUNCTION public.ensure_product_inventory_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_inventory (product_id, quantity, status)
  VALUES (NEW.id, 0, 'tugagan')
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_ensure_inventory ON public.products;
CREATE TRIGGER trg_products_ensure_inventory
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.ensure_product_inventory_row();

-- Do‘kon (ERP) narxi — CRM `products.sale_price` dan mustaqil.
-- Supabase SQL Editor da `erp_store_inventory` / `product_inventory` bilan birga ishga tushirish mumkin.

CREATE TABLE IF NOT EXISTS public.product_erp_pricing (
  product_id UUID PRIMARY KEY REFERENCES public.products (id) ON DELETE CASCADE,
  unit_price_uzs NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price_uzs >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_erp_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_erp_pricing_authenticated_all" ON public.product_erp_pricing;
CREATE POLICY "product_erp_pricing_authenticated_all"
  ON public.product_erp_pricing
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Boshlang‘ich qiymat: 0 (ERPda qo‘lda belgilanadi, CRM `sale_price` olinmaydi).
INSERT INTO public.product_erp_pricing (product_id, unit_price_uzs, updated_at)
SELECT
  p.id,
  0::numeric,
  NOW()
FROM public.products p
ON CONFLICT (product_id) DO NOTHING;

-- Yangi mahsulot uchun bo‘sh ERP narxi
CREATE OR REPLACE FUNCTION public.ensure_product_erp_pricing_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_erp_pricing (product_id, unit_price_uzs)
  VALUES (NEW.id, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_ensure_erp_pricing ON public.products;
CREATE TRIGGER trg_products_ensure_erp_pricing
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.ensure_product_erp_pricing_row();

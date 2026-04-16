-- ERP narxlarini CRM `sale_price` dan to‘liq ajratish.
-- Buni bir marta ishga tushiring.

BEGIN;

-- 1) Yangi mahsulot kelganda ERP narxini 0 qilib ochish (CRM narxini nusxalamaslik).
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

-- 2) Mavjud mahsulotlar uchun `product_erp_pricing` qatori bo‘lmasa 0 bilan yaratish.
INSERT INTO public.product_erp_pricing (product_id, unit_price_uzs, updated_at)
SELECT p.id, 0::numeric, NOW()
FROM public.products p
ON CONFLICT (product_id) DO NOTHING;

COMMIT;

-- Ixtiyoriy (AGAR barchasini 0 dan ERPda qayta qo‘lda belgilamoqchi bo‘lsangiz):
-- UPDATE public.product_erp_pricing
-- SET unit_price_uzs = 0, updated_at = NOW();

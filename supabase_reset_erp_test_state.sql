-- TEST RESET (ERP): omborni 0 holatiga qaytarish va keltirilgan so‘rovlarni tozalash.
-- Diqqat: bu script ERP test uchun, real prod holatda ehtiyot bo‘lib ishlating.
-- Supabase SQL Editor'da ishga tushiring.

BEGIN;

-- 1) ERP omborda barcha mahsulotlar uchun qator borligini ta'minlash.
INSERT INTO public.erp_store_inventory (
  product_id, quantity, stock_by_color, avg_cost_usd, stock_value_usd, status, updated_at
)
SELECT p.id, 0, NULL, 0, 0, 'tugagan', NOW()
FROM public.products p
ON CONFLICT (product_id) DO NOTHING;

-- 2) Barcha ERP ombor qoldiqlarini 0 qilish.
-- Rangli mahsulotlar uchun stock_by_color ham 0 map bo‘ladi.
UPDATE public.erp_store_inventory esi
SET
  quantity = 0,
  stock_by_color = CASE
    -- Bu bazada `products.colors` turi: text[] (jsonb emas)
    WHEN p.colors IS NOT NULL AND cardinality(p.colors) > 0 THEN (
      SELECT jsonb_object_agg(c.color_name, 0)
      FROM (
        SELECT DISTINCT NULLIF(TRIM(v), '') AS color_name
        FROM unnest(p.colors) AS v
      ) c
      WHERE c.color_name IS NOT NULL
    )
    WHEN NULLIF(TRIM(COALESCE(p.color, '')), '') IS NOT NULL THEN
      jsonb_build_object(TRIM(p.color), 0)
    ELSE NULL
  END,
  avg_cost_usd = 0,
  stock_value_usd = 0,
  status = 'tugagan',
  updated_at = NOW()
FROM public.products p
WHERE p.id = esi.product_id;

-- 3) ERP ga yuborilgan kirim navbatini tozalash (pending/accepted/rejected hammasi).
DELETE FROM public.erp_inbound_requests;

-- 4) (Ixtiyoriy) ERP kirim/sotuv loglarini tozalash kerak bo‘lsa commentni oching.
-- DELETE FROM public.stock_movements
-- WHERE reason ILIKE 'ERP kirimi:%'
--    OR reason ILIKE 'Sotuv: Do‘kon (ERP)%';

COMMIT;

-- Tekshiruv:
-- SELECT COUNT(*) AS inbound_left FROM public.erp_inbound_requests;
-- SELECT
--   COUNT(*) AS rows_total,
--   COALESCE(SUM(quantity), 0) AS qty_total
-- FROM public.erp_store_inventory;

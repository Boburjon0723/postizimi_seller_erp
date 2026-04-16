-- ERP ombor qiymati uchun cost-layer ustunlar.
-- `product_erp_pricing` (sotuv narxi) o‘zgarsa ham ombor qiymati sakramasligi uchun.

ALTER TABLE public.erp_store_inventory
  ADD COLUMN IF NOT EXISTS avg_cost_usd NUMERIC NOT NULL DEFAULT 0 CHECK (avg_cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS stock_value_usd NUMERIC NOT NULL DEFAULT 0 CHECK (stock_value_usd >= 0);

COMMENT ON COLUMN public.erp_store_inventory.avg_cost_usd
  IS 'Ombordagi joriy o‘rtacha tannarx (USD).';
COMMENT ON COLUMN public.erp_store_inventory.stock_value_usd
  IS 'Omborning jami qiymati (USD), narx o‘zgarishidan mustaqil.';

-- Mavjud yozuvlar uchun boshlang‘ich qiymat:
-- agar oldin qiymat yo‘q bo‘lsa, quantity * avg_cost_usd (yoki 0) ga tenglab qo‘yiladi.
UPDATE public.erp_store_inventory
SET
  avg_cost_usd = COALESCE(avg_cost_usd, 0),
  stock_value_usd = CASE
    WHEN COALESCE(stock_value_usd, 0) > 0 THEN stock_value_usd
    ELSE GREATEST(0, COALESCE(quantity, 0) * COALESCE(avg_cost_usd, 0))
  END;

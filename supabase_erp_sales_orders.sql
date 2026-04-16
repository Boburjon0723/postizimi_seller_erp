-- ERP Seller: to'lov qilingan buyurtmalar tarixini saqlash
-- Analitika (kategoriya / mijoz bo'yicha oylik USD) uchun manba

CREATE TABLE IF NOT EXISTS public.erp_sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID NULL,
  seller_email TEXT NULL,
  customer_name TEXT NULL,
  total_usd NUMERIC NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_paid_at
  ON public.erp_sales_orders (paid_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.erp_sales_orders(id) ON DELETE CASCADE,
  product_id UUID NULL,
  product_name TEXT NOT NULL,
  category_name TEXT NULL,
  color_name TEXT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price_usd NUMERIC NOT NULL DEFAULT 0,
  line_total_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_sales_order_items_order_id
  ON public.erp_sales_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_erp_sales_order_items_category
  ON public.erp_sales_order_items (category_name);

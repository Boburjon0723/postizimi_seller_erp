-- ERP seller buyurtmalar uchun status/tahrir ustunlari

ALTER TABLE public.erp_sales_orders
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_status
  ON public.erp_sales_orders (status);

CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_canceled_at
  ON public.erp_sales_orders (canceled_at DESC);

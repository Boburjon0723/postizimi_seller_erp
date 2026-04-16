-- Qabul vaqtidagi jami summa va par (oyma-oy hisobot uchun).
-- Migratsiyani Supabase SQL Editor yoki CLI orqali ishga tushiring.

ALTER TABLE public.erp_inbound_requests
  ADD COLUMN IF NOT EXISTS accepted_total_uzs NUMERIC,
  ADD COLUMN IF NOT EXISTS accepted_total_pieces INTEGER;

COMMENT ON COLUMN public.erp_inbound_requests.accepted_total_uzs IS 'Qabul paytidagi ERP (USD) narxlari bo''yicha jami; CRM sale_price / product_erp_pricing bilan mos.';
COMMENT ON COLUMN public.erp_inbound_requests.accepted_total_pieces IS 'Qabul paytidagi jami par (dona).';

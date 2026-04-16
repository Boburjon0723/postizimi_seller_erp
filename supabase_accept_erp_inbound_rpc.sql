-- ERP qabul qilishni server tomonga ko‘chirish (tez va atomik).
-- `acceptInboundRequest` endi ushbu RPC ni chaqiradi.

CREATE OR REPLACE FUNCTION public.accept_erp_inbound_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.erp_inbound_requests%ROWTYPE;
  v_now timestamptz := now();
  v_total_uzs numeric := 0;
  v_total_pieces integer := 0;
  v_total_add_value numeric := 0;
  v_current_value numeric := 0;
  v_new_value numeric := 0;
  v_new_avg_cost numeric := 0;
  v_reason text;

  r_prod record;
  r_color record;
  v_colors text[];
  v_legacy_color text;
  v_has_variants boolean;
  v_current_qty integer;
  v_new_qty integer;
  v_status text;
  v_stock_by_color jsonb;
  v_bucket text;
  v_matched boolean;
  v_unmatched_count integer;
  v_total_add integer;
  v_log_color_key text;
BEGIN
  SELECT *
  INTO v_req
  FROM public.erp_inbound_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'So‘rov topilmadi');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu so‘rov allaqachon qayta ishlangan');
  END IF;

  -- Kirim itemlarini vaqtinchalik jadvalga parse qilish.
  CREATE TEMP TABLE IF NOT EXISTS tmp_inbound_items (
    product_id uuid,
    raw_color text,
    qty integer,
    unit_price_usd numeric
  ) ON COMMIT DROP;
  TRUNCATE tmp_inbound_items;

  INSERT INTO tmp_inbound_items (product_id, raw_color, qty, unit_price_usd)
  SELECT
    NULLIF(trim(i->>'product_id'), '')::uuid AS product_id,
    NULLIF(trim(coalesce(i->>'color', '')), '') AS raw_color,
    GREATEST(0, floor(coalesce((i->>'quantity')::numeric, 0))::int) AS qty,
    CASE
      WHEN NULLIF(trim(coalesce(i->>'unit_price_usd', '')), '') IS NULL THEN NULL
      ELSE GREATEST(0, round((i->>'unit_price_usd')::numeric, 2))
    END AS unit_price_usd
  FROM jsonb_array_elements(coalesce(v_req.items, '[]'::jsonb)) i;

  DELETE FROM tmp_inbound_items
  WHERE product_id IS NULL OR qty <= 0;

  -- Mahsulot bo‘yicha omborga yozish (bitta so‘rov = bitta mahsulot).
  FOR r_prod IN
    SELECT
      t.product_id,
      SUM(t.qty)::int AS total_qty,
      p.name AS product_name,
      p.colors,
      p.color AS legacy_color,
      COALESCE(inv.quantity, 0)::int AS current_qty,
      inv.stock_by_color AS current_stock_by_color,
      COALESCE(inv.avg_cost_usd, 0)::numeric AS current_avg_cost_usd,
      COALESCE(inv.stock_value_usd, 0)::numeric AS current_stock_value_usd,
      COALESCE(pr.unit_price_uzs, 0)::numeric AS fallback_unit_usd
    FROM tmp_inbound_items t
    JOIN public.products p ON p.id = t.product_id
    LEFT JOIN public.erp_store_inventory inv ON inv.product_id = t.product_id
    LEFT JOIN public.product_erp_pricing pr ON pr.product_id = t.product_id
    GROUP BY
      t.product_id,
      p.name,
      p.colors,
      p.color,
      inv.quantity,
      inv.stock_by_color,
      inv.avg_cost_usd,
      inv.stock_value_usd,
      pr.unit_price_uzs
  LOOP
    v_colors := r_prod.colors;
    v_legacy_color := NULLIF(trim(coalesce(r_prod.legacy_color, '')), '');
    v_has_variants := (v_colors IS NOT NULL AND cardinality(v_colors) > 0) OR v_legacy_color IS NOT NULL;
    v_current_qty := COALESCE(r_prod.current_qty, 0);
    v_total_add := COALESCE(r_prod.total_qty, 0);
    v_current_value := GREATEST(
      0,
      COALESCE(r_prod.current_stock_value_usd, 0),
      COALESCE(r_prod.current_qty, 0) * COALESCE(r_prod.current_avg_cost_usd, 0)
    );

    SELECT COALESCE(
      ROUND(
        SUM(
          COALESCE(t.unit_price_usd, GREATEST(0, r_prod.fallback_unit_usd), 0) * t.qty
        )::numeric
      , 2)
    , 0)
    INTO v_total_add_value
    FROM tmp_inbound_items t
    WHERE t.product_id = r_prod.product_id;

    IF NOT v_has_variants THEN
      v_new_qty := v_current_qty + v_total_add;
      v_stock_by_color := NULL;
      v_unmatched_count := 0;
      v_log_color_key := NULL;
    ELSE
      v_stock_by_color := COALESCE(r_prod.current_stock_by_color, '{}'::jsonb);

      -- Rang map bo‘sh bo‘lsa, katalog ranglaridan seed qilish.
      IF v_stock_by_color = '{}'::jsonb THEN
        IF v_colors IS NOT NULL AND cardinality(v_colors) > 0 THEN
          SELECT COALESCE(jsonb_object_agg(c, 0), '{}'::jsonb)
          INTO v_stock_by_color
          FROM (
            SELECT DISTINCT NULLIF(trim(x), '') AS c
            FROM unnest(v_colors) x
            WHERE NULLIF(trim(x), '') IS NOT NULL
          ) s;
        ELSIF v_legacy_color IS NOT NULL THEN
          v_stock_by_color := jsonb_build_object(v_legacy_color, 0);
        END IF;
      END IF;

      v_unmatched_count := 0;
      v_log_color_key := NULL;

      FOR r_color IN
        SELECT raw_color, SUM(qty)::int AS qty
        FROM tmp_inbound_items
        WHERE product_id = r_prod.product_id
        GROUP BY raw_color
      LOOP
        v_bucket := NULL;
        v_matched := false;

        IF r_color.raw_color IS NOT NULL THEN
          IF v_colors IS NOT NULL AND cardinality(v_colors) > 0 THEN
            SELECT c
            INTO v_bucket
            FROM unnest(v_colors) c
            WHERE lower(trim(c)) = lower(trim(r_color.raw_color))
            LIMIT 1;
          END IF;

          IF v_bucket IS NULL
             AND v_legacy_color IS NOT NULL
             AND lower(trim(v_legacy_color)) = lower(trim(r_color.raw_color)) THEN
            v_bucket := v_legacy_color;
          END IF;
        END IF;

        IF v_bucket IS NOT NULL THEN
          v_matched := true;
        ELSE
          v_bucket := COALESCE(r_color.raw_color, 'Nomaʼlum rang');
          v_unmatched_count := v_unmatched_count + 1;
        END IF;

        v_stock_by_color :=
          jsonb_set(
            v_stock_by_color,
            ARRAY[v_bucket],
            to_jsonb(COALESCE((v_stock_by_color->>v_bucket)::int, 0) + COALESCE(r_color.qty, 0)),
            true
          );

        IF v_log_color_key IS NULL THEN
          v_log_color_key := v_bucket;
        ELSIF v_log_color_key <> v_bucket THEN
          v_log_color_key := NULL;
        END IF;
      END LOOP;

      SELECT COALESCE(SUM((e.value)::int), 0)::int
      INTO v_new_qty
      FROM jsonb_each_text(COALESCE(v_stock_by_color, '{}'::jsonb)) e;
    END IF;

    v_status :=
      CASE
        WHEN v_new_qty <= 0 THEN 'tugagan'
        WHEN v_new_qty <= 5 THEN 'kam_qoldi'
        ELSE 'sotuvda'
      END;

    v_new_value := ROUND((v_current_value + v_total_add_value)::numeric, 2);
    v_new_avg_cost := CASE WHEN v_new_qty > 0 THEN ROUND((v_new_value / v_new_qty)::numeric, 6) ELSE 0 END;

    INSERT INTO public.erp_store_inventory (
      product_id, quantity, stock_by_color, avg_cost_usd, stock_value_usd, status, updated_at
    )
    VALUES (r_prod.product_id, v_new_qty, v_stock_by_color, v_new_avg_cost, v_new_value, v_status, v_now)
    ON CONFLICT (product_id) DO UPDATE
    SET
      quantity = EXCLUDED.quantity,
      stock_by_color = EXCLUDED.stock_by_color,
      avg_cost_usd = EXCLUDED.avg_cost_usd,
      stock_value_usd = EXCLUDED.stock_value_usd,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at;

    v_reason :=
      format('ERP kirimi: CRM topshirig‘i №%s', coalesce(v_req.order_number_snapshot, v_req.order_id::text)) ||
      CASE WHEN v_unmatched_count > 0 THEN ' [Rang mos kelmadi — yangi rang bucket ochildi]' ELSE '' END;

    INSERT INTO public.stock_movements (
      product_id, change_amount, previous_stock, new_stock, reason, type, order_id, color_key
    )
    VALUES (
      r_prod.product_id,
      v_total_add,
      v_current_qty,
      v_new_qty,
      v_reason,
      'restock',
      v_req.order_id,
      v_log_color_key
    );
  END LOOP;

  -- Qabul summalari: item.unit_price_usd ustuvor, fallback product_erp_pricing.
  SELECT
    COALESCE(SUM(t.qty), 0)::int,
    COALESCE(
      ROUND(
        SUM(
          COALESCE(t.unit_price_usd, GREATEST(0, pr.unit_price_uzs), 0) * t.qty
        )::numeric
      , 2)
    , 0)
  INTO v_total_pieces, v_total_uzs
  FROM tmp_inbound_items t
  LEFT JOIN public.product_erp_pricing pr ON pr.product_id = t.product_id;

  UPDATE public.erp_inbound_requests
  SET
    status = 'accepted',
    accepted_at = v_now,
    accepted_total_uzs = v_total_uzs,
    accepted_total_pieces = v_total_pieces
  WHERE id = v_req.id AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'accepted_total_uzs', v_total_uzs,
    'accepted_total_pieces', v_total_pieces
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_erp_inbound_request(uuid) TO authenticated;

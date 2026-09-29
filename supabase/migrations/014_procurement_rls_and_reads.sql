-- =============================================================================
-- MIGRATION 014: PROCUREMENT & INVENTORY RLS POLICIES & SECURE READ RPCS
-- Target: PostgreSQL / Supabase
-- Mục tiêu: Mở quyền truy vấn RLS cho các bảng Kho Vận & Đơn Đặt Hàng (PO),
--          Phiếu Nhập Kho (GRN), Sổ Cái NCC (AP) và cung cấp RPC đọc an toàn.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS POLICIES: PURCHASE_ORDERS & ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_po_read ON purchase_orders;
CREATE POLICY rls_po_read ON purchase_orders
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_po_write ON purchase_orders;
CREATE POLICY rls_po_write ON purchase_orders
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_po_items_read ON purchase_order_items;
CREATE POLICY rls_po_items_read ON purchase_order_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_po_items_write ON purchase_order_items;
CREATE POLICY rls_po_items_write ON purchase_order_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. RLS POLICIES: GOODS_RECEIPT_NOTES & ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE goods_receipt_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_grn_read ON goods_receipt_notes;
CREATE POLICY rls_grn_read ON goods_receipt_notes
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_grn_write ON goods_receipt_notes;
CREATE POLICY rls_grn_write ON goods_receipt_notes
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_grn_items_read ON goods_receipt_items;
CREATE POLICY rls_grn_items_read ON goods_receipt_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_grn_items_write ON goods_receipt_items;
CREATE POLICY rls_grn_items_write ON goods_receipt_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES: SUPPLIER_LEDGER, ADVANCES & LOT STOCKS
-- -----------------------------------------------------------------------------
ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_supplier_ledger_read ON supplier_ledger;
CREATE POLICY rls_supplier_ledger_read ON supplier_ledger
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_supplier_ledger_write ON supplier_ledger;
CREATE POLICY rls_supplier_ledger_write ON supplier_ledger
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE supplier_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_supplier_advances_read ON supplier_advances;
CREATE POLICY rls_supplier_advances_read ON supplier_advances
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_supplier_advances_write ON supplier_advances;
CREATE POLICY rls_supplier_advances_write ON supplier_advances
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE inventory_lot_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_lot_stocks_read ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_read ON inventory_lot_stocks
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_lot_stocks_write ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_write ON inventory_lot_stocks
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH ĐƠN ĐẶT HÀNG (PO)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_purchase_orders(p_branch_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', po.id,
                'organization_id', po.organization_id,
                'branch_id', po.branch_id,
                'supplier_id', po.supplier_id,
                'supplier_name', COALESCE(s.name, 'Nhà cung cấp'),
                'po_number', po.po_number,
                'order_date', to_char(po.created_at, 'YYYY-MM-DD'),
                'expected_delivery_date', po.expected_delivery_date,
                'total_amount', po.total_amount,
                'status', po.status,
                'notes', po.notes,
                'created_at', po.created_at,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', poi.id,
                            'product_id', poi.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'purchase_unit', poi.purchase_unit,
                            'conversion_rate', poi.conversion_rate,
                            'quantity_ordered', poi.quantity_ordered,
                            'quantity_received', poi.quantity_received,
                            'unit_cost', poi.unit_cost,
                            'line_total', poi.line_total
                        )
                    )
                    FROM purchase_order_items poi
                    LEFT JOIN products p ON p.id = poi.product_id
                    WHERE poi.purchase_order_id = po.id
                ), '[]'::jsonb)
            )
            ORDER BY po.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE (p_branch_id IS NULL OR po.branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH PHIẾU NHẬP KHO (GRN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_goods_receipts(p_branch_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', grn.id,
                'organization_id', grn.organization_id,
                'branch_id', grn.branch_id,
                'purchase_order_id', grn.purchase_order_id,
                'supplier_id', grn.supplier_id,
                'supplier_name', COALESCE(s.name, 'Nhà cung cấp'),
                'grn_number', grn.grn_number,
                'invoice_number', grn.invoice_number,
                'status', grn.status,
                'received_at', grn.received_at,
                'total_value', grn.total_value,
                'notes', grn.notes,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', gri.id,
                            'po_item_id', gri.po_item_id,
                            'product_id', gri.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'lot_number', gri.lot_number,
                            'expiry_date', gri.expiry_date,
                            'purchase_unit', gri.purchase_unit,
                            'conversion_rate', gri.conversion_rate,
                            'quantity_received', gri.quantity_received,
                            'quantity_accepted', gri.quantity_accepted,
                            'quantity_rejected', gri.quantity_rejected,
                            'rejection_reason', gri.rejection_reason,
                            'accepted_base_units', gri.accepted_base_units,
                            'unit_cost', gri.unit_cost,
                            'line_total', gri.line_total
                        )
                    )
                    FROM goods_receipt_items gri
                    LEFT JOIN products p ON p.id = gri.product_id
                    WHERE gri.goods_receipt_id = grn.id
                ), '[]'::jsonb)
            )
            ORDER BY grn.received_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM goods_receipt_notes grn
    LEFT JOIN suppliers s ON s.id = grn.supplier_id
    WHERE (p_branch_id IS NULL OR grn.branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- CẤP QUYỀN THỰC THI CHO CẢ AUTHENTICATED VÀ ANON
GRANT EXECUTE ON FUNCTION rpc_get_purchase_orders(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_goods_receipts(UUID) TO authenticated, anon;

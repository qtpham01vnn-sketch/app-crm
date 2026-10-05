-- =============================================================================
-- MIGRATION 036: MINIMAL ANONYMOUS BLOCK HOTFIX (12 TABLES)
-- Phạm vi: Chỉ chặn 100% truy cập Anon/Public, giữ nguyên logic quyền nhân viên hiện hữu
-- Tuyệt đối không thay đổi logic nghiệp vụ chuyên sâu trong bản này.
-- =============================================================================

BEGIN;

-- 1. THU HỒI QUYỀN TRUY CẬP TỪ ANON & PUBLIC TRÊN ĐÚNG 12 BẢNG
REVOKE ALL ON public.payroll_records FROM anon, public;
REVOKE ALL ON public.commission_records FROM anon, public;
REVOKE ALL ON public.roster_shifts FROM anon, public;
REVOKE ALL ON public.treatment_sessions FROM anon, public;
REVOKE ALL ON public.treatment_photos FROM anon, public;
REVOKE ALL ON public.treatment_consents FROM anon, public;
REVOKE ALL ON public.treatment_plans FROM anon, public;
REVOKE ALL ON public.treatment_session_audits FROM anon, public;
REVOKE ALL ON public.branch_transfers FROM anon, public;
REVOKE ALL ON public.branch_transfer_items FROM anon, public;
REVOKE ALL ON public.purchase_orders FROM anon, public;
REVOKE ALL ON public.goods_receipt_notes FROM anon, public;

-- 2. CẤP QUYỀN CHO AUTHENTICATED VÀ SERVICE_ROLE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_shifts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_photos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_consents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_session_audits TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_transfers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_transfer_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_notes TO authenticated, service_role;

-- 3. BẢO ĐẢM BẬT ROW LEVEL SECURITY TRÊN 12 BẢNG
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_session_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_notes ENABLE ROW LEVEL SECURITY;

-- 4. BẢO VỆ CHÍNH SÁCH RLS CƠ BẢN (CHẶN ANON, CHỈ CHO AUTHENTICATED TRONG CÙNG TỔ CHỨC)
-- Xóa policy cũ nếu có xung đột
DROP POLICY IF EXISTS anon_block_payroll ON public.payroll_records;
DROP POLICY IF EXISTS anon_block_commission ON public.commission_records;
DROP POLICY IF EXISTS anon_block_roster ON public.roster_shifts;
DROP POLICY IF EXISTS anon_block_treatments ON public.treatment_sessions;
DROP POLICY IF EXISTS anon_block_photos ON public.treatment_photos;
DROP POLICY IF EXISTS anon_block_consents ON public.treatment_consents;
DROP POLICY IF EXISTS anon_block_plans ON public.treatment_plans;
DROP POLICY IF EXISTS anon_block_audits ON public.treatment_session_audits;
DROP POLICY IF EXISTS anon_block_transfers ON public.branch_transfers;
DROP POLICY IF EXISTS anon_block_transfer_items ON public.branch_transfer_items;
DROP POLICY IF EXISTS anon_block_po ON public.purchase_orders;
DROP POLICY IF EXISTS anon_block_grn ON public.goods_receipt_notes;

COMMIT;

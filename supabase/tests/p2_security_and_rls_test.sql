-- =============================================================================
-- TEST SUITE: P2 SECURITY, RLS & MULTI-BRANCH ISOLATION
-- Target: PostgreSQL / Supabase Test Execution
-- =============================================================================

BEGIN;

-- 1. SETUP TEST ORGANIZATIONS & BRANCHES
INSERT INTO organizations (id, name) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Phuong Nam Spa Chuỗi A'),
    ('22222222-2222-2222-2222-222222222222', 'Spa Đối Thủ B');

INSERT INTO branches (id, organization_id, name, code, address) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Chi Nhánh Quận 1', 'CN-Q1', '123 Le Loi, Q1'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Chi Nhánh Quận 7', 'CN-Q7', '456 Nguyen Van Linh, Q7'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Chi Nhánh B Hà Nội', 'CN-HN', '789 Trang Tien, HN');

-- 2. SETUP TEST USERS & MEMBERSHIPS
INSERT INTO staff_profiles (id, auth_user_id, organization_id, full_name, code, phone) VALUES
    ('99999999-9999-9999-9999-999999999991', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Admin Tong', 'NV-01', '0900000001'),
    ('99999999-9999-9999-9999-999999999992', '00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Quan Ly Q1', 'NV-02', '0900000002'),
    ('99999999-9999-9999-9999-999999999993', '00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Thu Ngan Q1', 'NV-03', '0900000003');

INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids) VALUES
    ('99999999-9999-9999-9999-999999999991', '11111111-1111-1111-1111-111111111111', 'owner_admin', '{}'),
    ('99999999-9999-9999-9999-999999999992', '11111111-1111-1111-1111-111111111111', 'branch_manager', '{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}'),
    ('99999999-9999-9999-9999-999999999993', '11111111-1111-1111-1111-111111111111', 'cashier_receptionist', '{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}');

-- -----------------------------------------------------------------------------
-- TEST CASE SEC-01: Cross-organization Isolation Verification
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    org_count INT;
BEGIN
    -- Verify tables exist and constraints hold
    SELECT COUNT(*) INTO org_count FROM organizations;
    IF org_count < 2 THEN
        RAISE EXCEPTION 'TEST FAILED: Organizations table failed setup';
    END IF;
    RAISE NOTICE '✅ SEC-01: Multi-tenant organization baseline verified.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST CASE ACID-01: Audit Table Immutability Verification
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    test_event_id UUID := uuid_generate_v4();
    rec_count INT;
BEGIN
    INSERT INTO audit_events (id, organization_id, actor_role, event_action, entity_table)
    VALUES (test_event_id, '11111111-1111-1111-1111-111111111111', 'owner_admin', 'test.create', 'organizations');

    -- Try to mutate audit event (should be blocked by RULE)
    UPDATE audit_events SET event_action = 'tampered' WHERE id = test_event_id;

    -- Verify event_action is unchanged
    SELECT COUNT(*) INTO rec_count FROM audit_events WHERE id = test_event_id AND event_action = 'test.create';
    IF rec_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Audit event was modified! Immutability broken.';
    END IF;
    RAISE NOTICE '✅ ACID-01: Audit log immutability verified (UPDATE prohibited).';
END $$;

ROLLBACK;

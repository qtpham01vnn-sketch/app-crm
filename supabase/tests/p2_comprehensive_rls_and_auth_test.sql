-- =============================================================================
-- TEST SUITE: P2 COMPREHENSIVE RLS, RBAC, MULTI-BRANCH & AUDIT VERIFICATION
-- Runs authenticated simulation using PostgreSQL request.jwt.claim.sub
-- =============================================================================

BEGIN;

-- 1. SETUP TWO SEPARATE ORGANIZATIONS (ORG A & ORG B)
INSERT INTO organizations (id, name, tax_code, phone) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Phuong Nam Clinic Org A', '0312345678', '0901234567'),
    ('22222222-2222-2222-2222-222222222222', 'Competitor Spa Org B', '0398765432', '0909999999')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. SETUP BRANCHES
INSERT INTO branches (id, organization_id, name, code, address) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'CN Q1 - Org A', 'CN-Q1', '123 Le Loi'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'CN Q7 - Org A', 'CN-Q7', '456 Nguyen Van Linh'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'CN HN - Org B', 'CN-HN', '789 Trang Tien')
ON CONFLICT (id) DO NOTHING;

-- 3. SETUP AUTH TEST USERS & MEMBERSHIPS
-- User 1: Owner Admin Org A (All branches)
INSERT INTO staff_profiles (id, auth_user_id, organization_id, full_name, code, phone) VALUES
    ('99999999-9999-9999-9999-999999999991', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Admin Tong', 'NV-ADMIN', '0900000001')
ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids) VALUES
    ('99999999-9999-9999-9999-999999999991', '11111111-1111-1111-1111-111111111111', 'owner_admin', ARRAY[]::UUID[])
ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = EXCLUDED.role, assigned_branch_ids = EXCLUDED.assigned_branch_ids;

-- User 2: Branch Manager Org A (Q1 only)
INSERT INTO staff_profiles (id, auth_user_id, organization_id, full_name, code, phone) VALUES
    ('99999999-9999-9999-9999-999999999992', '00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Quan Ly Q1', 'NV-QLQ1', '0900000002')
ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids) VALUES
    ('99999999-9999-9999-9999-999999999992', '11111111-1111-1111-1111-111111111111', 'branch_manager', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::UUID[])
ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = EXCLUDED.role, assigned_branch_ids = EXCLUDED.assigned_branch_ids;

-- User 3: Cashier Org A (Q1 only)
INSERT INTO staff_profiles (id, auth_user_id, organization_id, full_name, code, phone) VALUES
    ('99999999-9999-9999-9999-999999999993', '00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Thu Ngan Q1', 'NV-TNQ1', '0900000003')
ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids) VALUES
    ('99999999-9999-9999-9999-999999999993', '11111111-1111-1111-1111-111111111111', 'cashier_receptionist', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::UUID[])
ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = EXCLUDED.role, assigned_branch_ids = EXCLUDED.assigned_branch_ids;

-- User 4: Staff in Org B (Competitor)
INSERT INTO staff_profiles (id, auth_user_id, organization_id, full_name, code, phone) VALUES
    ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000099', '22222222-2222-2222-2222-222222222222', 'Nhan Vien Org B', 'NV-ORGB', '0909999999')
ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids) VALUES
    ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'owner_admin', ARRAY[]::UUID[])
ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = EXCLUDED.role, assigned_branch_ids = EXCLUDED.assigned_branch_ids;

-- 4. INSERT TEST SAMPLE RECORDS IN BOTH ORGS
INSERT INTO customers (id, organization_id, primary_branch_id, full_name, phone) VALUES
    ('77777777-7777-7777-7777-777777777771', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Khach Hang Org A', '0911111111'),
    ('77777777-7777-7777-7777-777777777779', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Khach Hang Org B', '0922222222')
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, organization_id, branch_id, customer_id, service_id, scheduled_at) VALUES
    ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777771', '55555555-5555-5555-5555-555555555551', NOW()),
    ('bbbbbbbb-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777771', '55555555-5555-5555-5555-555555555551', NOW())
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- RUNNING VERIFICATION ASSERTIONS
-- -----------------------------------------------------------------------------

-- Assertion 1: Helper functions resolve correctly for Admin Org A
DO $$
DECLARE
    v_org_id UUID;
    v_role user_role_enum;
    v_has_q1 BOOLEAN;
    v_has_q7 BOOLEAN;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
    v_org_id := get_current_user_org_id();
    v_role := get_current_user_role();
    v_has_q1 := has_branch_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    v_has_q7 := has_branch_access('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    IF v_org_id <> '11111111-1111-1111-1111-111111111111' OR v_role <> 'owner_admin' OR NOT (v_has_q1 AND v_has_q7) THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Admin Org A resolution mismatch (org=%, role=%, q1=%, q7=%)', v_org_id, v_role, v_has_q1, v_has_q7;
    END IF;
    RAISE NOTICE '✅ TEST 1 PASSED: Owner Admin has global access to Org A and all branches.';
END $$;

-- Assertion 2: Branch Manager Q1 only has access to Branch Q1, NOT Branch Q7
DO $$
DECLARE
    v_has_q1 BOOLEAN;
    v_has_q7 BOOLEAN;
    v_has_org_b BOOLEAN;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
    v_has_q1 := has_branch_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    v_has_q7 := has_branch_access('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    v_has_org_b := has_branch_access('cccccccc-cccc-cccc-cccc-cccccccccccc');

    IF NOT v_has_q1 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Manager Q1 must have access to Branch Q1';
    END IF;
    IF v_has_q7 THEN
        RAISE EXCEPTION 'TEST 2 FAILED (SECURITY BREACH): Manager Q1 was granted access to Branch Q7!';
    END IF;
    IF v_has_org_b THEN
        RAISE EXCEPTION 'TEST 2 FAILED (SECURITY BREACH): Manager Q1 was granted access to Competitor Org B!';
    END IF;
    RAISE NOTICE '✅ TEST 2 PASSED (SEC-01 Multi-branch): Manager Q1 is strictly isolated to Branch Q1.';
END $$;

-- Assertion 3: Cross-organization Isolation (Org B User cannot see Org A)
DO $$
DECLARE
    v_org_id UUID;
    v_has_q1 BOOLEAN;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', true);
    v_org_id := get_current_user_org_id();
    v_has_q1 := has_branch_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    IF v_org_id <> '22222222-2222-2222-2222-222222222222' THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Org B user org mismatch';
    END IF;
    IF v_has_q1 THEN
        RAISE EXCEPTION 'TEST 3 FAILED (CROSS-TENANT LEAK): Org B user accessed Org A Branch!';
    END IF;
    RAISE NOTICE '✅ TEST 3 PASSED (SEC-01 Multi-tenant): Org B is completely isolated from Org A.';
END $$;

-- Assertion 4: Audit Log Immutability (ACID-01)
DO $$
DECLARE
    v_test_event_id UUID := uuid_generate_v4();
    v_cnt INT;
BEGIN
    INSERT INTO audit_events (id, organization_id, actor_role, event_action, entity_table)
    VALUES (v_test_event_id, '11111111-1111-1111-1111-111111111111', 'cashier_receptionist', 'customer.create', 'customers');

    -- Attempt to modify audit log
    UPDATE audit_events SET event_action = 'tampered_action' WHERE id = v_test_event_id;

    -- Verify unchanged
    SELECT COUNT(*) INTO v_cnt FROM audit_events WHERE id = v_test_event_id AND event_action = 'customer.create';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Audit log was mutated!';
    END IF;

    -- Attempt to delete audit log
    DELETE FROM audit_events WHERE id = v_test_event_id;
    SELECT COUNT(*) INTO v_cnt FROM audit_events WHERE id = v_test_event_id;
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Audit log was deleted!';
    END IF;

    RAISE NOTICE '✅ TEST 4 PASSED (ACID-01 Audit Immutability): UPDATE and DELETE on audit_events blocked by RULE.';
END $$;

ROLLBACK;

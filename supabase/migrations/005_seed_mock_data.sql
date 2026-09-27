-- =============================================================================
-- MIGRATION 005: SEED MOCK DATA FOR DEVELOPMENT & TESTING
-- Target: PostgreSQL / Supabase
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_b1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_b2_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_b3_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    v_staff_admin UUID := '99999999-9999-9999-9999-999999999991';
    v_staff_mgr UUID := '99999999-9999-9999-9999-999999999992';
    v_staff_cashier UUID := '99999999-9999-9999-9999-999999999993';
    v_staff_doc UUID := '99999999-9999-9999-9999-999999999994';

    v_cust1_id UUID := '77777777-7777-7777-7777-777777777771';
    v_cust2_id UUID := '77777777-7777-7777-7777-777777777772';
    v_cust3_id UUID := '77777777-7777-7777-7777-777777777773';

    v_svc1_id UUID := '55555555-5555-5555-5555-555555555551';
    v_svc2_id UUID := '55555555-5555-5555-5555-555555555552';
    v_svc3_id UUID := '55555555-5555-5555-5555-555555555553';

    v_prod1_id UUID := '44444444-4444-4444-4444-444444444441';
    v_prod2_id UUID := '44444444-4444-4444-4444-444444444442';

    v_pkg1_id UUID := '66666666-6666-6666-6666-666666666661';
BEGIN
    -- 1. Insert Organization
    INSERT INTO organizations (id, name, tax_code, phone, email, address)
    VALUES (v_org_id, 'Phuong Nam Beauty & Dental Clinic', '0312345678', '0901234567', 'contact@phuongnamclinic.vn', '123 Lê Lợi, Bến Nghé, Quận 1, TP.HCM')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Insert Branches
    INSERT INTO branches (id, organization_id, name, code, phone, address, is_headquarters)
    VALUES 
        (v_b1_id, v_org_id, 'Chi Nhánh Quận 1 (Trụ sở)', 'CN-Q1', '02838221111', '123 Lê Lợi, P. Bến Nghé, Quận 1', TRUE),
        (v_b2_id, v_org_id, 'Chi Nhánh Quận 7 (Phú Mỹ Hưng)', 'CN-Q7', '02854112222', '456 Nguyễn Văn Linh, P. Tân Phong, Quận 7', FALSE),
        (v_b3_id, v_org_id, 'Chi Nhánh TP. Thủ Đức', 'CN-TD', '02873003333', '789 Võ Văn Ngân, TP. Thủ Đức', FALSE)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Insert Staff Profiles
    INSERT INTO staff_profiles (id, organization_id, full_name, code, phone, email, title)
    VALUES
        (v_staff_admin, v_org_id, 'Trần Phương Nam', 'NV-ADMIN', '0909000001', 'admin@phuongnam.vn', 'Tổng Giám Đốc'),
        (v_staff_mgr, v_org_id, 'Nguyễn Thị Hương', 'NV-QLQ1', '0909000002', 'huong.nguyen@phuongnam.vn', 'Quản Lý Chi Nhánh Q1'),
        (v_staff_cashier, v_org_id, 'Lê Thu Thảo', 'NV-LT01', '0909000003', 'thao.le@phuongnam.vn', 'Lễ Tân / Thu Ngân'),
        (v_staff_doc, v_org_id, 'BS. Phạm Minh Tuấn', 'NV-BS01', '0909000004', 'tuan.pham@phuongnam.vn', 'Bác Sĩ Trưởng Khoa Da Liễu')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Insert Organization Memberships
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids)
    VALUES
        (v_staff_admin, v_org_id, 'owner_admin', ARRAY[]::UUID[]),
        (v_staff_mgr, v_org_id, 'branch_manager', ARRAY[v_b1_id]::UUID[]),
        (v_staff_cashier, v_org_id, 'cashier_receptionist', ARRAY[v_b1_id]::UUID[]),
        (v_staff_doc, v_org_id, 'technician_doctor', ARRAY[v_b1_id, v_b2_id]::UUID[])
    ON CONFLICT (staff_id, organization_id) DO NOTHING;

    -- 5. Insert Services
    INSERT INTO services (id, organization_id, code, name, category, base_price, duration_minutes, default_commission_pct)
    VALUES
        (v_svc1_id, v_org_id, 'DV-001', 'Chăm sóc Da Mặt Chuyên Sâu Gold 24K', 'facial', 1200000, 75, 10),
        (v_svc2_id, v_org_id, 'DV-002', 'Laser Pico Trị Nám & Tàn Nhang', 'laser', 2500000, 60, 12),
        (v_svc3_id, v_org_id, 'DV-003', 'Tẩy Trắng Răng Laser Whitening', 'dental_care', 1800000, 45, 8)
    ON CONFLICT (id) DO NOTHING;

    -- 6. Insert Branch Service Prices
    INSERT INTO branch_service_prices (organization_id, branch_id, service_id, custom_price)
    VALUES
        (v_org_id, v_b1_id, v_svc1_id, 1200000),
        (v_org_id, v_b1_id, v_svc2_id, 2500000),
        (v_org_id, v_b2_id, v_svc1_id, 1350000)
    ON CONFLICT (branch_id, service_id) DO NOTHING;

    -- 7. Insert Products & Stocks
    INSERT INTO products (id, organization_id, code, name, category, unit, retail_price, cost_price, min_stock_alert)
    VALUES
        (v_prod1_id, v_org_id, 'SP-001', 'Serum Tế Bào Gốc HA Booster 50ml', 'skincare', 'chai', 850000, 420000, 5),
        (v_prod2_id, v_org_id, 'SP-002', 'Kem Chống Nắng Phổ Rộng SPF50+ 60ml', 'skincare', 'tuýp', 620000, 290000, 10)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
    VALUES
        (v_org_id, v_b1_id, v_prod1_id, 35),
        (v_org_id, v_b1_id, v_prod2_id, 48),
        (v_org_id, v_b2_id, v_prod1_id, 20)
    ON CONFLICT (branch_id, product_id) DO NOTHING;

    -- 8. Insert Packages
    INSERT INTO packages (id, organization_id, code, name, service_id, total_sessions, package_price, validity_days)
    VALUES
        (v_pkg1_id, v_org_id, 'PKG-01', 'Liệu Trình 10 Buổi Chăm Sóc Da Mặt Gold 24K', v_svc1_id, 10, 9600000, 365)
    ON CONFLICT (id) DO NOTHING;

    -- 9. Insert Customers
    INSERT INTO customers (id, organization_id, primary_branch_id, full_name, phone, tier, total_spent, debt_balance, medical_notes)
    VALUES
        (v_cust1_id, v_org_id, v_b1_id, 'Chị Mai Lan', '0918111222', 'vip', 28500000, 0, 'Da nhạy cảm, dị ứng cồn và hương liệu nồng'),
        (v_cust2_id, v_org_id, v_b1_id, 'Anh Hoàng Long', '0983333444', 'gold', 14200000, 1500000, 'Khách niềng răng trong suốt'),
        (v_cust3_id, v_org_id, v_b2_id, 'Chị Bích Trâm', '0907777888', 'silver', 5600000, 0, 'Đang điều trị nám má phải')
    ON CONFLICT (id) DO NOTHING;

    -- 10. Insert Customer Courses
    INSERT INTO customer_courses (id, organization_id, customer_id, package_id, service_id, total_sessions, used_sessions, status)
    VALUES
        ('88888888-8888-8888-8888-888888888881', v_org_id, v_cust1_id, v_pkg1_id, v_svc1_id, 10, 3, 'active')
    ON CONFLICT (id) DO NOTHING;

    -- 11. Insert Appointments
    INSERT INTO appointments (organization_id, branch_id, customer_id, staff_id, service_id, scheduled_at, duration_minutes, status, notes)
    VALUES
        (v_org_id, v_b1_id, v_cust1_id, v_staff_doc, v_svc1_id, NOW() + INTERVAL '1 hour', 75, 'confirmed', 'Khách hẹn buổi thứ 4 liệu trình Gold 24K'),
        (v_org_id, v_b1_id, v_cust2_id, v_staff_doc, v_svc3_id, NOW() + INTERVAL '3 hours', 45, 'booked', 'Tẩy trắng răng định kỳ');

    RAISE NOTICE '✅ MIGRATION 005: Seed mock data successfully loaded!';
END $$;

const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve('supabase/migrations');
const migrationFiles = [
  '001_core_organization_membership_rls.sql',
  '002_master_data_and_catalogs.sql',
  '003_operations_pos_and_courses.sql',
  '004_rls_security_policies.sql',
  '005_auth_sync_and_auto_link.sql',
  '005_seed_mock_data.sql',
  '006_auth_security_hardening.sql',
  '007_e1_services_pricing_skills_resources.sql',
  '008_multibranch_enhancements.sql',
  '009_appointment_dispatch_and_concurrency.sql',
  '010_pos_acid_checkout_and_financial_ledger.sql',
  '011_pos_refunds_deposits_bank_audit.sql',
  '012_p5_pos_hardening_and_procurement_a.sql',
  '013_inventory_phase_a_hardening.sql',
  '014_procurement_rls_and_reads.sql',
  '015_prevent_duplicate_grn_and_auto_close_po.sql',
  '016_po_auto_close_and_complete_cycle.sql',
  '017_inventory_stage_b_transfers.sql',
  '017_stage_b_functions_patch.sql',
  '018_inventory_stage_c_audits.sql',
  '019_inventory_difference_resolution_and_hardening.sql',
  '020_p6_staff_and_branch_assignments.sql',
  '021_p6_2_roster_and_shifts.sql',
  '022_p6_3_timesheets_and_attendance.sql',
  '023_p6_4_commissions_and_payroll.sql',
  '024_p7_1_sales_and_cashflow_analytics.sql',
  '025_p7_2_cogs_bom_and_gross_profit.sql',
  '026_p7_2_cogs_bom_and_variance_refinement.sql',
  '027_p7_2_cogs_snapshot_hardening_and_rls.sql',
  '028_p7_3_staff_and_resource_utilization.sql',
  '029_p7_4_customer_retention_and_cohort.sql',
  '030_p8_treatment_records_and_before_after.sql',
  '031_p9_loyalty_and_membership_tiers.sql',
  '032_p10_chatbox_and_cskh_inbox.sql',
  '033_p10_webhook_crm_bridge.sql',
  '034_security_hardening_rls_all_tables.sql',
  '035_loyalty_server_hardening_and_approval_guard.sql'
];

let bundleSql = `-- =============================================================================\n`;
bundleSql += `-- PHUONG NAM CRM — FULL STAGING DATABASE INITIALIZATION SCRIPT\n`;
bundleSql += `-- Target: Staging Project (yvwsitkgpujeqlgeiuge)\n`;
bundleSql += `-- Generated at: ${new Date().toISOString()}\n`;
bundleSql += `-- =============================================================================\n\n`;

for (const file of migrationFiles) {
  const filePath = path.join(migrationsDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace raw CREATE TYPE with safe DO blocks
    content = content.replace(
      /CREATE\s+TYPE\s+([a-zA-Z0-9_]+)\s+AS\s+ENUM\s*\(([\s\S]*?)\);/gi,
      (match, typeName, enumValues) => {
        return `DO $$ BEGIN CREATE TYPE ${typeName} AS ENUM (${enumValues}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
      }
    );

    bundleSql += `\n-- -----------------------------------------------------------------------------\n`;
    bundleSql += `-- FILE: ${file}\n`;
    bundleSql += `-- -----------------------------------------------------------------------------\n`;
    bundleSql += content + `\n\n`;
  }
}

// Thêm đoạn gán UID chính xác cho 4 user staging vừa tạo
bundleSql += `
-- -----------------------------------------------------------------------------
-- LINK 4 STAGING AUTH USERS DIRECTLY TO STAFF PROFILES & MEMBERSHIPS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_b1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    
    v_uid_admin UUID := '5cd9acc9-b242-47f9-994b-13424441383c';
    v_uid_mgr UUID := 'ab814e90-f2e4-47c7-bbc9-29928f9512ac';
    v_uid_rec UUID := 'f79f20ac-ea80-408e-bc97-0a5cafc46ca4';
    v_uid_doc UUID := 'a3dc50c6-b435-4710-ad08-fbb0a3e00630';

    v_staff_admin UUID := '99999999-9999-9999-9999-999999999991';
    v_staff_mgr UUID := '99999999-9999-9999-9999-999999999992';
    v_staff_cashier UUID := '99999999-9999-9999-9999-999999999993';
    v_staff_doc UUID := '99999999-9999-9999-9999-999999999994';
BEGIN
    -- 1. Admin (Chủ cơ sở)
    UPDATE staff_profiles SET auth_user_id = v_uid_admin, email = 'admin.staging@phuongnam.vn' WHERE id = v_staff_admin;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_admin, v_org_id, 'owner_admin', ARRAY[]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'owner_admin', assigned_branch_ids = ARRAY[]::UUID[], is_active = TRUE;

    -- 2. Manager Q1 (Quản lý Chi nhánh Q1)
    UPDATE staff_profiles SET auth_user_id = v_uid_mgr, email = 'manager.q1@phuongnam.vn' WHERE id = v_staff_mgr;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_mgr, v_org_id, 'branch_manager', ARRAY[v_b1_id]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'branch_manager', assigned_branch_ids = ARRAY[v_b1_id]::UUID[], is_active = TRUE;

    -- 3. Receptionist / Cashier Q1 (Lễ tân / Thu ngân Q1)
    UPDATE staff_profiles SET auth_user_id = v_uid_rec, email = 'reception.q1@phuongnam.vn' WHERE id = v_staff_cashier;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_cashier, v_org_id, 'cashier_receptionist', ARRAY[v_b1_id]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'cashier_receptionist', assigned_branch_ids = ARRAY[v_b1_id]::UUID[], is_active = TRUE;

    -- 4. Doctor Q1 (Bác sĩ / KTV Q1)
    UPDATE staff_profiles SET auth_user_id = v_uid_doc, email = 'doctor.tuan@phuongnam.vn' WHERE id = v_staff_doc;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_doc, v_org_id, 'technician_doctor', ARRAY[v_b1_id]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'technician_doctor', assigned_branch_ids = ARRAY[v_b1_id]::UUID[], is_active = TRUE;
END;
$$;
`;

const outputPath = path.resolve('supabase/staging_bundle.sql');
fs.writeFileSync(outputPath, bundleSql, 'utf8');
console.log(`✅ Đã tạo thành công file bundle an toàn: ${outputPath} (${(bundleSql.length / 1024).toFixed(1)} KB)`);

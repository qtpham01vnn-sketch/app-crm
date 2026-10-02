-- =============================================================================
-- ROLLBACK SCRIPT FOR MIGRATION 034 (SAFE RECOVERY)
-- Target: PostgreSQL / Supabase
-- NOTE: NEVER RESTORES ANONYMOUS ACCESS!
-- =============================================================================

-- Restore standard authenticated organization isolation if migration 034 needs rollback
DROP POLICY IF EXISTS treatment_sessions_select_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_insert_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_update_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_photos_select_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_write_policy ON treatment_photos;
DROP POLICY IF EXISTS payroll_records_select_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_records_admin_write ON payroll_records;
DROP POLICY IF EXISTS commission_records_select_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_admin_write ON commission_records;
DROP POLICY IF EXISTS branch_transfers_select_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_write_policy ON branch_transfers;

-- Fallback safe authenticated org-level policies
CREATE POLICY treatment_sessions_fallback ON treatment_sessions
    FOR ALL TO authenticated USING (organization_id = get_current_user_org_id());

CREATE POLICY payroll_records_fallback ON payroll_records
    FOR ALL TO authenticated USING (organization_id = get_current_user_org_id());

CREATE POLICY commission_records_fallback ON commission_records
    FOR ALL TO authenticated USING (organization_id = get_current_user_org_id());

CREATE POLICY branch_transfers_fallback ON branch_transfers
    FOR ALL TO authenticated USING (organization_id = get_current_user_org_id());

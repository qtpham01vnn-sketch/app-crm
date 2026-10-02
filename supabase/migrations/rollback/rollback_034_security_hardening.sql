-- =============================================================================
-- ROLLBACK SCRIPT FOR MIGRATION 034
-- Use ONLY if migration 034 causes unexpected disruption
-- =============================================================================

-- Disable RLS on extension tables if rollback is urgently required
ALTER TABLE IF EXISTS conversation_threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_consents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commission_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS branch_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stocktakes DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_role_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_admin_write_policy ON payroll_records;
DROP POLICY IF EXISTS commission_role_policy ON commission_records;
DROP POLICY IF EXISTS treatment_sessions_role_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_photos_role_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_consents_role_policy ON treatment_consents;
DROP POLICY IF EXISTS branch_transfers_access_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_mgr_write_policy ON branch_transfers;
DROP POLICY IF EXISTS threads_org_policy ON conversation_threads;
DROP POLICY IF EXISTS chat_messages_org_policy ON chat_messages;

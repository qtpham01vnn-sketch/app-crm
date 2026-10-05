-- =============================================================================
-- READ-ONLY SECURITY AUDIT QUERY FOR 12 TARGET TABLES (SUPABASE LIVE / STAGING)
-- An toàn 100%: Chỉ sử dụng SELECT trên PostgreSQL Catalog, tuyệt đối không sửa đổi dữ liệu.
-- =============================================================================

-- =============================================================================
-- TRUY VẤN 1: TỔNG HỢP TOÀN DIỆN DƯỚI DẠNG JSON (Copy 1 dòng duy nhất để gửi)
-- =============================================================================
WITH target_tables AS (
    SELECT unnest(ARRAY[
        'payroll_records', 'commission_records', 'roster_shifts',
        'treatment_sessions', 'treatment_photos', 'treatment_consents',
        'treatment_plans', 'treatment_session_audits', 'branch_transfers',
        'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
    ]) AS table_name
),
rls_status AS (
    SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (SELECT table_name FROM target_tables)
),
table_grants AS (
    SELECT 
        table_name,
        grantee,
        array_agg(privilege_type ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (SELECT table_name FROM target_tables)
      AND grantee IN ('anon', 'authenticated', 'public', 'service_role')
    GROUP BY table_name, grantee
),
policies_list AS (
    SELECT 
        tablename AS table_name,
        policyname AS policy_name,
        permissive,
        roles,
        cmd,
        qual AS using_expression,
        with_check AS with_check_expression
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (SELECT table_name FROM target_tables)
)
SELECT jsonb_pretty(jsonb_build_object(
    'audit_timestamp', now(),
    'tables_audit', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'table_name', t.table_name,
                'rls', (
                    SELECT jsonb_build_object(
                        'enabled', COALESCE(r.rls_enabled, false),
                        'forced', COALESCE(r.rls_forced, false)
                    )
                    FROM rls_status r WHERE r.table_name = t.table_name
                ),
                'grants', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'grantee', g.grantee,
                            'privileges', g.privileges
                        )
                    )
                    FROM table_grants g WHERE g.table_name = t.table_name
                ),
                'policies', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'policy_name', p.policy_name,
                            'permissive', p.permissive,
                            'roles', p.roles,
                            'cmd', p.cmd,
                            'using', p.using_expression,
                            'with_check', p.with_check_expression
                        )
                    )
                    FROM policies_list p WHERE p.table_name = t.table_name
                )
            ) ORDER BY t.table_name
        )
        FROM target_tables t
    )
)) AS live_security_configuration_json;

-- =============================================================================
-- TRUY VẤN 2: BẢNG CHI TIẾT TRẠNG THÁI RLS TỪNG BẢNG
-- =============================================================================
SELECT 
    c.relname AS table_name,
    CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED (VULNERABLE)' END AS rls_status,
    CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'NO' END AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'payroll_records', 'commission_records', 'roster_shifts',
    'treatment_sessions', 'treatment_photos', 'treatment_consents',
    'treatment_plans', 'treatment_session_audits', 'branch_transfers',
    'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
  )
ORDER BY c.relname;

-- =============================================================================
-- TRUY VẤN 3: BẢNG CHI TIẾT QUYỀN GRANTS (ANON, PUBLIC, AUTHENTICATED, SERVICE_ROLE)
-- =============================================================================
SELECT 
    table_name,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'payroll_records', 'commission_records', 'roster_shifts',
    'treatment_sessions', 'treatment_photos', 'treatment_consents',
    'treatment_plans', 'treatment_session_audits', 'branch_transfers',
    'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
  )
  AND grantee IN ('anon', 'authenticated', 'public', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- =============================================================================
-- TRUY VẤN 4: TOÀN BỘ DANH SÁCH POLICY VÀ ĐIỀU KIỆN (USING / WITH CHECK)
-- =============================================================================
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual AS using_condition,
    with_check AS with_check_condition
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'payroll_records', 'commission_records', 'roster_shifts',
    'treatment_sessions', 'treatment_photos', 'treatment_consents',
    'treatment_plans', 'treatment_session_audits', 'branch_transfers',
    'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
  )
ORDER BY tablename, policyname;

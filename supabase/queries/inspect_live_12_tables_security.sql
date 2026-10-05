-- =============================================================================
-- READ-ONLY SECURITY AUDIT QUERY FOR 12 TARGET TABLES (SUPABASE LIVE CATALOG)
-- 100% CHỈ ĐỌC: Sử dụng aclexplode(pg_class.relacl), pg_tables, pg_policies
-- Trích xuất đầy đủ quyền PUBLIC, anon, authenticated, service_role & toàn bộ Policy.
-- =============================================================================

WITH target_tables AS (
    SELECT unnest(ARRAY[
        'payroll_records', 'commission_records', 'roster_shifts',
        'treatment_sessions', 'treatment_photos', 'treatment_consents',
        'treatment_plans', 'treatment_session_audits', 'branch_transfers',
        'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
    ]) AS table_name
),
table_meta AS (
    SELECT 
        tt.table_name,
        EXISTS (
            SELECT 1 FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = 'public' AND c.relname = tt.table_name
        ) AS table_exists,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        c.relowner::regrole::text AS table_owner
    FROM target_tables tt
    LEFT JOIN pg_class c ON c.relname = tt.table_name 
      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
),
raw_acls AS (
    -- Trích xuất chính xác toàn bộ ACLs kể cả pseudo-role PUBLIC bằng aclexplode
    SELECT 
        c.relname AS table_name,
        CASE 
            WHEN ae.grantee = 0 THEN 'PUBLIC' 
            ELSE COALESCE(pg_get_userbyid(ae.grantee), 'UNKNOWN') 
        END AS grantee,
        ae.privilege_type,
        ae.is_grantable,
        pg_get_userbyid(ae.grantor) AS grantor
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) ae
    WHERE n.nspname = 'public'
      AND c.relname IN (SELECT table_name FROM target_tables)
),
aggregated_acls AS (
    SELECT 
        table_name,
        grantee,
        array_agg(privilege_type ORDER BY privilege_type) AS privileges
    FROM raw_acls
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role', 'postgres')
    GROUP BY table_name, grantee
),
effective_rights AS (
    -- Kiểm tra quyền thực tế (Effective Privileges) có thể thực hiện bởi các role Supabase
    SELECT 
        tt.table_name,
        jsonb_build_object(
            'anon', jsonb_build_object(
                'select', has_table_privilege('anon', 'public.' || quote_ident(tt.table_name), 'SELECT'),
                'insert', has_table_privilege('anon', 'public.' || quote_ident(tt.table_name), 'INSERT'),
                'update', has_table_privilege('anon', 'public.' || quote_ident(tt.table_name), 'UPDATE'),
                'delete', has_table_privilege('anon', 'public.' || quote_ident(tt.table_name), 'DELETE')
            ),
            'authenticated', jsonb_build_object(
                'select', has_table_privilege('authenticated', 'public.' || quote_ident(tt.table_name), 'SELECT'),
                'insert', has_table_privilege('authenticated', 'public.' || quote_ident(tt.table_name), 'INSERT'),
                'update', has_table_privilege('authenticated', 'public.' || quote_ident(tt.table_name), 'UPDATE'),
                'delete', has_table_privilege('authenticated', 'public.' || quote_ident(tt.table_name), 'DELETE')
            ),
            'service_role', jsonb_build_object(
                'select', has_table_privilege('service_role', 'public.' || quote_ident(tt.table_name), 'SELECT'),
                'insert', has_table_privilege('service_role', 'public.' || quote_ident(tt.table_name), 'INSERT'),
                'update', has_table_privilege('service_role', 'public.' || quote_ident(tt.table_name), 'UPDATE'),
                'delete', has_table_privilege('service_role', 'public.' || quote_ident(tt.table_name), 'DELETE')
            )
        ) AS effective_privileges
    FROM target_tables tt
    WHERE EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE n.nspname = 'public' AND c.relname = tt.table_name
    )
),
policies_list AS (
    SELECT 
        tablename AS table_name,
        policyname AS policy_name,
        permissive,
        roles,
        cmd,
        qual AS using_condition,
        with_check AS with_check_condition
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (SELECT table_name FROM target_tables)
)
SELECT jsonb_pretty(jsonb_build_object(
    'audit_title', 'SUPABASE LIVE 12 TABLES SECURITY AUDIT',
    'database_name', current_database(),
    'audit_timestamp_utc', timezone('UTC', now()),
    'tables_audit', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'table_name', m.table_name,
                'exists', m.table_exists,
                'owner', m.table_owner,
                'rls_status', jsonb_build_object(
                    'enabled', COALESCE(m.rls_enabled, false),
                    'forced', COALESCE(m.rls_forced, false)
                ),
                'acl_grants_direct', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'grantee', a.grantee,
                            'privileges', a.privileges
                        )
                    )
                    FROM aggregated_acls a WHERE a.table_name = m.table_name
                ),
                'effective_role_permissions', (
                    SELECT e.effective_privileges FROM effective_rights e WHERE e.table_name = m.table_name
                ),
                'policies_count', (
                    SELECT COUNT(*) FROM policies_list p WHERE p.table_name = m.table_name
                ),
                'policies', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'policy_name', p.policy_name,
                            'permissive', p.permissive,
                            'roles', p.roles,
                            'cmd', p.cmd,
                            'using', p.using_condition,
                            'with_check', p.with_check_condition
                        )
                    )
                    FROM policies_list p WHERE p.table_name = m.table_name
                )
            ) ORDER BY m.table_name
        )
        FROM table_meta m
    )
)) AS live_security_configuration_json;

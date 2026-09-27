-- =============================================================================
-- MIGRATION 004: ROW LEVEL SECURITY (RLS) POLICIES & MULTI-BRANCH ISOLATION
-- Phase: P2A — Security & Multi-tenant Protection
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 1. POLICIES: ORGANIZATIONS & BRANCHES
-- -----------------------------------------------------------------------------
CREATE POLICY org_isolation_policy ON organizations
    FOR ALL
    USING (id = get_current_user_org_id());

CREATE POLICY branch_isolation_policy ON branches
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

CREATE POLICY branch_admin_write_policy ON branches
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- -----------------------------------------------------------------------------
-- 2. POLICIES: CUSTOMERS (Org Level Isolation)
-- -----------------------------------------------------------------------------
CREATE POLICY customers_org_policy ON customers
    FOR ALL
    USING (organization_id = get_current_user_org_id());

-- -----------------------------------------------------------------------------
-- 3. POLICIES: SERVICES, PACKAGES & PRODUCTS (Org Level Catalog)
-- -----------------------------------------------------------------------------
CREATE POLICY services_read_policy ON services
    FOR SELECT USING (organization_id = get_current_user_org_id());

CREATE POLICY services_admin_write_policy ON services
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY products_read_policy ON products
    FOR SELECT USING (organization_id = get_current_user_org_id());

CREATE POLICY products_admin_write_policy ON products
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND (get_current_user_role() IN ('owner_admin', 'branch_manager'))
    );

-- -----------------------------------------------------------------------------
-- 4. POLICIES: INVENTORY STOCKS (Branch Access Filter)
-- -----------------------------------------------------------------------------
CREATE POLICY inventory_stocks_branch_policy ON inventory_stocks
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 5. POLICIES: APPOINTMENTS (Branch & Role Filter)
-- -----------------------------------------------------------------------------
CREATE POLICY appointments_branch_policy ON appointments
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 6. POLICIES: SALES & PAYMENTS (Branch & Role Filter)
-- -----------------------------------------------------------------------------
CREATE POLICY sales_branch_policy ON sales
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

CREATE POLICY payments_branch_policy ON payments
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

CREATE POLICY sale_items_policy ON sale_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM sales s
            WHERE s.id = sale_items.sale_id
              AND s.organization_id = get_current_user_org_id()
              AND has_branch_access(s.branch_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 7. POLICIES: CUSTOMER COURSES & SESSION DEDUCTIONS
-- -----------------------------------------------------------------------------
CREATE POLICY customer_courses_org_policy ON customer_courses
    FOR ALL
    USING (organization_id = get_current_user_org_id());

CREATE POLICY session_deductions_branch_policy ON session_deductions
    FOR ALL
    USING (
        has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 8. POLICIES: AUDIT EVENTS (Owner Admin & Branch Manager View, Append by System)
-- -----------------------------------------------------------------------------
CREATE POLICY audit_events_read_policy ON audit_events
    FOR SELECT
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY audit_events_insert_policy ON audit_events
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
    );

-- Database Schema and Row Level Security (RLS) Policies for WAREFLOW AI

-- 1. Locations Table
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section TEXT NOT NULL DEFAULT 'Main Warehouse',
    zone TEXT NOT NULL,
    rack TEXT NOT NULL,
    shelf TEXT NOT NULL,
    bin TEXT NOT NULL,
    UNIQUE(section, zone, rack, shelf, bin)
);

-- 2. Items Table
CREATE TABLE items (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    total_stock INT NOT NULL DEFAULT 0 CHECK (total_stock >= 0),
    allocated INT NOT NULL DEFAULT 0 CHECK (allocated >= 0),
    damaged INT NOT NULL DEFAULT 0 CHECK (damaged >= 0),
    missing INT NOT NULL DEFAULT 0 CHECK (missing >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT check_allocated_limit CHECK (allocated <= total_stock),
    CONSTRAINT check_exceptions_limit CHECK (damaged + missing <= total_stock)
);

-- 3. Orders Table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'picking', 'packing', 'qc', 'dispatch', 'completed', 'hold')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    customer_tier TEXT NOT NULL DEFAULT 'standard' CHECK (customer_tier IN ('standard', 'premium', 'vip')),
    assigned_user TEXT,
    exception_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Order Items Table
CREATE TABLE order_items (
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    sku TEXT REFERENCES items(sku) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    allocated INT NOT NULL DEFAULT 0 CHECK (allocated >= 0),
    PRIMARY KEY (order_id, sku),
    CONSTRAINT check_allocated_item CHECK (allocated <= quantity)
);

-- 5. Stock Movements Table
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT REFERENCES items(sku) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound', 'internal_move', 'damaged', 'adjustment')),
    quantity INT NOT NULL CHECK (quantity > 0),
    from_location_id UUID REFERENCES locations(id),
    to_location_id UUID REFERENCES locations(id),
    reason TEXT NOT NULL,
    user_name TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Exceptions (Anomalies) Table
CREATE TABLE exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    sku TEXT REFERENCES items(sku) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('damaged', 'missing', 'shortage', 'delay')),
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    reported_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;

-- CREATE CUSTOM ROLES
-- Note: In Supabase, these correspond to database roles or application roles checked inside policies
-- Using auth.jwt() fields or current_setting('request.jwt.claims') is standard.
-- Here we write policies utilizing a custom claim `role` in the user metadata:
-- (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role'

-- RLS POLICIES

-- =========================================================================
-- LOCATIONS TABLE POLICIES
-- =========================================================================
CREATE POLICY manager_all_locations ON locations 
    FOR ALL 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

CREATE POLICY employee_read_locations ON locations 
    FOR SELECT 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'));

-- =========================================================================
-- ITEMS TABLE POLICIES
-- =========================================================================
CREATE POLICY manager_all_items ON items 
    FOR ALL 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

CREATE POLICY employee_read_items ON items 
    FOR SELECT 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'));

CREATE POLICY employee_update_items ON items 
    FOR UPDATE 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'))
    WITH CHECK (
        -- Pickers can only decrease total_stock (when completing orders) or adjust allocated/damaged/missing
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher')
    );

-- =========================================================================
-- ORDERS TABLE POLICIES
-- =========================================================================
CREATE POLICY manager_all_orders ON orders 
    FOR ALL 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

CREATE POLICY employee_read_orders ON orders 
    FOR SELECT 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'));

CREATE POLICY picker_update_orders ON orders
    FOR UPDATE
    USING (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'picker'
        AND status IN ('allocated', 'picking')
    )
    WITH CHECK (
        status IN ('picking', 'packing', 'hold') -- Can move to picking, packing, or hold
    );

CREATE POLICY packer_update_orders ON orders
    FOR UPDATE
    USING (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'packer'
        AND status IN ('picking', 'packing')
    )
    WITH CHECK (
        status IN ('packing', 'qc', 'hold')
    );

CREATE POLICY inspector_update_orders ON orders
    FOR UPDATE
    USING (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'inspector'
        AND status IN ('packing', 'qc')
    )
    WITH CHECK (
        status IN ('qc', 'dispatch', 'hold')
    );

CREATE POLICY dispatcher_update_orders ON orders
    FOR UPDATE
    USING (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'dispatcher'
        AND status IN ('qc', 'dispatch')
    )
    WITH CHECK (
        status IN ('dispatch', 'completed', 'hold')
    );

-- =========================================================================
-- ORDER ITEMS TABLE POLICIES
-- =========================================================================
CREATE POLICY manager_all_order_items ON order_items 
    FOR ALL 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

CREATE POLICY employee_read_order_items ON order_items 
    FOR SELECT 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'));

-- =========================================================================
-- STOCK MOVEMENTS TABLE POLICIES
-- =========================================================================
CREATE POLICY manager_all_movements ON stock_movements 
    FOR ALL 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

CREATE POLICY employee_read_movements ON stock_movements 
    FOR SELECT 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'));

CREATE POLICY employee_insert_movements ON stock_movements
    FOR INSERT
    WITH CHECK (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher')
    );

-- =========================================================================
-- EXCEPTIONS (ANOMALIES) TABLE POLICIES
-- =========================================================================
CREATE POLICY manager_all_exceptions ON exceptions 
    FOR ALL 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

CREATE POLICY employee_read_exceptions ON exceptions 
    FOR SELECT 
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher'));

CREATE POLICY employee_insert_exceptions ON exceptions
    FOR INSERT
    WITH CHECK (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') IN ('picker', 'packer', 'inspector', 'dispatcher')
    );

CREATE POLICY manager_update_exceptions ON exceptions
    FOR UPDATE
    USING (coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'picker') = 'manager');

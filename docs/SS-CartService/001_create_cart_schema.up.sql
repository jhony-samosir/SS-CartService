-- =============================================================================
-- SS-CartService: Cart Schema
-- Part 1: Core Tables (Carts, Cart Items)
-- Convention:
--   - PK: INT GENERATED ALWAYS AS IDENTITY
--   - Public ID: UUID (exposed to external APIs)
--   - No cross-service FK constraints (cross-service refs stored as plain INT/UUID)
--   - Soft delete: deleted_at / deleted_by
--   - Audit: created_at, created_by, updated_at, updated_by
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABLE: carts
-- One active cart per user at a time (user_id is cross-service ref, no FK)
-- =============================================================================
CREATE TABLE carts (
    id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(255),
    updated_at   TIMESTAMPTZ,
    updated_by   VARCHAR(255),
    deleted_at   TIMESTAMPTZ,
    deleted_by   VARCHAR(255),

    -- Cross-service reference to AuthService user (no FK constraint)
    user_id      INT NOT NULL,

    status       VARCHAR(50) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'checked_out', 'abandoned', 'expired')),
    expires_at   TIMESTAMPTZ,
    notes        TEXT,

    CONSTRAINT uq_carts_user_active UNIQUE (user_id, status) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE carts IS 'Shopping cart per user. One active cart per user at a time.';
COMMENT ON COLUMN carts.public_id IS 'UUID exposed to external APIs';
COMMENT ON COLUMN carts.user_id IS 'Cross-service reference to AuthService user (no FK constraint)';
COMMENT ON COLUMN carts.status IS 'Cart lifecycle: active | checked_out | abandoned | expired';
COMMENT ON COLUMN carts.expires_at IS 'Optional cart expiry for abandoned cart cleanup';

CREATE INDEX idx_carts_user_id ON carts (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_carts_status ON carts (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_carts_user_active ON carts (user_id) WHERE status = 'active' AND deleted_at IS NULL;

-- =============================================================================
-- TABLE: cart_items
-- Line items inside a cart. Product info is snapshotted at time of add.
-- No FK to catalog service — cross-service refs stored as plain INT/UUID.
-- =============================================================================
CREATE TABLE cart_items (
    id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by        VARCHAR(255),
    updated_at        TIMESTAMPTZ,
    updated_by        VARCHAR(255),
    deleted_at        TIMESTAMPTZ,
    deleted_by        VARCHAR(255),

    -- Internal cart reference (within same service, plain INT — not FK constrained per convention)
    cart_id           INT NOT NULL,

    -- Cross-service references to CatalogService (no FK constraint)
    product_id        INT NOT NULL,
    product_public_id UUID NOT NULL,
    variant_id        INT,
    variant_public_id UUID,

    -- Snapshot of product data at time of add (denormalized for resilience)
    product_name      VARCHAR(500) NOT NULL,
    variant_name      VARCHAR(255),
    sku               VARCHAR(255),
    image_url         TEXT,

    -- Pricing snapshot at time of add
    unit_price        NUMERIC(18, 2) NOT NULL CHECK (unit_price >= 0),
    currency_code     CHAR(3) NOT NULL DEFAULT 'IDR',

    -- Quantity
    quantity          INT NOT NULL DEFAULT 1 CHECK (quantity > 0),

    -- Optional seller reference (cross-service, no FK)
    seller_id         INT,
    seller_name       VARCHAR(255),

    CONSTRAINT uq_cart_item_product_variant UNIQUE (cart_id, product_id, variant_id)
);

COMMENT ON TABLE cart_items IS 'Line items within a cart. Product info is snapshotted for resilience against catalog changes.';
COMMENT ON COLUMN cart_items.public_id IS 'UUID exposed to external APIs';
COMMENT ON COLUMN cart_items.cart_id IS 'Reference to carts.id (same service, no FK per convention)';
COMMENT ON COLUMN cart_items.product_id IS 'Cross-service reference to CatalogService product.id (no FK)';
COMMENT ON COLUMN cart_items.product_public_id IS 'Cross-service reference to CatalogService product.public_id (no FK)';
COMMENT ON COLUMN cart_items.variant_id IS 'Cross-service reference to CatalogService product_variants.id (nullable, no FK)';
COMMENT ON COLUMN cart_items.product_name IS 'Snapshot of product name at time of add (denormalized)';
COMMENT ON COLUMN cart_items.unit_price IS 'Snapshot of unit price at time of add (denormalized)';
COMMENT ON COLUMN cart_items.seller_id IS 'Cross-service reference to seller (no FK)';

CREATE INDEX idx_cart_items_cart_id ON cart_items (cart_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cart_items_product_id ON cart_items (product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cart_items_product_public_id ON cart_items (product_public_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cart_items_seller_id ON cart_items (seller_id) WHERE deleted_at IS NULL;

-- =============================================================================
-- TABLE: cart_events (Outbox / Event Log for Cart Domain)
-- Transactional Outbox pattern for publishing domain events to message broker
-- =============================================================================
CREATE TABLE cart_events (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id      UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(255),
    updated_at     TIMESTAMPTZ,
    updated_by     VARCHAR(255),
    deleted_at     TIMESTAMPTZ,
    deleted_by     VARCHAR(255),

    event_type     VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL DEFAULT 'cart',
    aggregate_id   INT NOT NULL,
    payload        JSONB NOT NULL,
    status         VARCHAR(50) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'published', 'failed')),
    retry_count    INT NOT NULL DEFAULT 0,
    published_at   TIMESTAMPTZ,
    error_message  TEXT
);

COMMENT ON TABLE cart_events IS 'Transactional Outbox: guarantees at-least-once delivery for cart domain events.';
COMMENT ON COLUMN cart_events.event_type IS 'Domain event name (e.g., cart.item_added, cart.checked_out, cart.abandoned)';
COMMENT ON COLUMN cart_events.aggregate_type IS 'Aggregate root (cart or cart_item)';
COMMENT ON COLUMN cart_events.status IS 'Publishing lifecycle: pending | published | failed';

CREATE INDEX idx_cart_events_pending ON cart_events (status, created_at) WHERE status = 'pending';
CREATE INDEX idx_cart_events_aggregate ON cart_events (aggregate_type, aggregate_id);

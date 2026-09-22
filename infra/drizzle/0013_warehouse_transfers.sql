-- UTA-94: Warehouse transfers
-- 
-- Adds transfer state machine (draft → sent → received|cancelled),
-- inter-warehouse balance movements with ledger traceability,
-- and extends warehouses with type/address/primary flags.

-- Add Gudang fields to warehouses
ALTER TABLE catalog_warehouses 
ADD COLUMN type text,
ADD COLUMN address jsonb,
ADD COLUMN "primary" boolean NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" timestamp with time zone;

-- Create transfer table
CREATE TABLE catalog_transfers (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    reference_num text NOT NULL,
    status text NOT NULL,
    source_warehouse_id UUID NOT NULL,
    dest_warehouse_id UUID NOT NULL,
    notes text,
    expected_receive_date timestamp with time zone,
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT transfer_ref_num_unique UNIQUE (workspace_id, reference_num),
    CONSTRAINT fk_transfer_workspace FOREIGN KEY (workspace_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_source FOREIGN KEY (source_warehouse_id) REFERENCES catalog_warehouses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_dest FOREIGN KEY (dest_warehouse_id) REFERENCES catalog_warehouses(id) ON DELETE RESTRICT
);

-- Create transfer items table
CREATE TABLE catalog_transfer_items (
    id UUID PRIMARY KEY,
    transfer_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    requested_qty integer NOT NULL,
    sent_qty integer NOT NULL,
    received_qty integer NOT NULL,
    damaged_qty integer NOT NULL,
    cancellation_reason text,
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT transfer_item_transfer_fk FOREIGN KEY (transfer_id) REFERENCES catalog_transfers(id) ON DELETE CASCADE,
    CONSTRAINT transfer_item_variant_fk FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE
);

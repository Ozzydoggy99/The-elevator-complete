-- Migration script to add relay_configuration_id column to connected_relays table
-- This fixes the "column relay_configuration_id does not exist" error

-- Add the missing column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'connected_relays' AND column_name = 'relay_configuration_id'
    ) THEN
        ALTER TABLE connected_relays ADD COLUMN relay_configuration_id INTEGER;
        RAISE NOTICE 'Added relay_configuration_id column to connected_relays table';
    ELSE
        RAISE NOTICE 'relay_configuration_id column already exists in connected_relays table';
    END IF;
END $$;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'connected_relays' 
        AND constraint_name = 'connected_relays_relay_configuration_id_fkey'
    ) THEN
        ALTER TABLE connected_relays 
        ADD CONSTRAINT connected_relays_relay_configuration_id_fkey 
        FOREIGN KEY (relay_configuration_id) REFERENCES relay_configurations(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added foreign key constraint for relay_configuration_id';
    ELSE
        RAISE NOTICE 'Foreign key constraint for relay_configuration_id already exists';
    END IF;
END $$;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_connected_relays_config_id ON connected_relays(relay_configuration_id);

-- Show the current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'connected_relays' 
ORDER BY ordinal_position; 
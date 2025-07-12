-- Add MAC address column to relay_configurations table
-- This allows users to specify a custom MAC address when registering relays

ALTER TABLE relay_configurations 
ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

-- Add index for MAC address lookups
CREATE INDEX IF NOT EXISTS idx_relay_configs_mac_address ON relay_configurations(mac_address);

-- Add comment to document the column
COMMENT ON COLUMN relay_configurations.mac_address IS 'Custom MAC address for the relay (optional, format: AA:BB:CC:DD:EE:FF)'; 
-- This allows users to specify a custom MAC address when registering relays

ALTER TABLE relay_configurations 
ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

-- Add index for MAC address lookups
CREATE INDEX IF NOT EXISTS idx_relay_configs_mac_address ON relay_configurations(mac_address);

-- Add comment to document the column
COMMENT ON COLUMN relay_configurations.mac_address IS 'Custom MAC address for the relay (optional, format: AA:BB:CC:DD:EE:FF)'; 
 
 
 
 
 
 
 
 
 
-- Migration to enhance connected_relays table for better connection tracking
-- This adds a boolean is_connected field and improves the status tracking

-- Add is_connected boolean field for real-time connection status
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS is_connected BOOLEAN DEFAULT FALSE;

-- Add device_id field to store the relay's device ID from ESP32
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);

-- Add device_name field to store the relay's device name from ESP32
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);

-- Add connection_count field to track how many times this relay has connected
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS connection_count INTEGER DEFAULT 0;

-- Add first_connected_at field to track when this relay first connected
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS first_connected_at TIMESTAMP;

-- Add last_connected_at field to track when this relay last connected
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMP;

-- Add last_disconnected_at field to track when this relay last disconnected
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS last_disconnected_at TIMESTAMP;

-- Add heartbeat_interval field to track expected heartbeat frequency
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS heartbeat_interval INTEGER DEFAULT 30000; -- 30 seconds default

-- Add last_heartbeat field to track last heartbeat received
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP;

-- Create index on is_connected for fast queries
CREATE INDEX IF NOT EXISTS idx_connected_relays_is_connected ON connected_relays(is_connected);

-- Create index on device_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_connected_relays_device_id ON connected_relays(device_id);

-- Create index on last_heartbeat for monitoring
CREATE INDEX IF NOT EXISTS idx_connected_relays_last_heartbeat ON connected_relays(last_heartbeat);

-- Update the status enum to be more descriptive
-- First, let's see what statuses currently exist
-- Then we'll update them to be more meaningful

-- Add a comment to document the status field
COMMENT ON COLUMN connected_relays.status IS 'Connection status: online, offline, error, maintenance, unknown';

-- Create a function to update connection status
CREATE OR REPLACE FUNCTION update_relay_connection_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamps based on connection state
    IF NEW.is_connected = TRUE AND OLD.is_connected = FALSE THEN
        -- Relay just connected
        NEW.last_connected_at = CURRENT_TIMESTAMP;
        NEW.connection_count = COALESCE(OLD.connection_count, 0) + 1;
        NEW.status = 'online';
        
        -- Set first_connected_at if this is the first time
        IF OLD.first_connected_at IS NULL THEN
            NEW.first_connected_at = CURRENT_TIMESTAMP;
        END IF;
        
    ELSIF NEW.is_connected = FALSE AND OLD.is_connected = TRUE THEN
        -- Relay just disconnected
        NEW.last_disconnected_at = CURRENT_TIMESTAMP;
        NEW.status = 'offline';
    END IF;
    
    -- Update last_seen whenever we get any update
    NEW.last_seen = CURRENT_TIMESTAMP;
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update connection status
DROP TRIGGER IF EXISTS trigger_update_relay_connection_status ON connected_relays;
CREATE TRIGGER trigger_update_relay_connection_status
    BEFORE UPDATE ON connected_relays
    FOR EACH ROW
    EXECUTE FUNCTION update_relay_connection_status();

-- Create a view for easy querying of connected relays
CREATE OR REPLACE VIEW active_relays AS
SELECT 
    cr.id,
    cr.mac_address,
    cr.device_id,
    cr.device_name,
    cr.name as relay_name,
    cr.location,
    cr.description,
    cr.is_connected,
    cr.status,
    cr.ip_address,
    cr.port,
    cr.connection_count,
    cr.first_connected_at,
    cr.last_connected_at,
    cr.last_disconnected_at,
    cr.last_heartbeat,
    cr.last_seen,
    cr.created_at,
    cr.updated_at,
    rc.relay_id as config_relay_id,
    rc.relay_name as config_relay_name,
    rc.channel_config
FROM connected_relays cr
LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
WHERE cr.is_connected = TRUE;

-- Create a view for disconnected relays
CREATE OR REPLACE VIEW disconnected_relays AS
SELECT 
    cr.id,
    cr.mac_address,
    cr.device_id,
    cr.device_name,
    cr.name as relay_name,
    cr.location,
    cr.description,
    cr.is_connected,
    cr.status,
    cr.ip_address,
    cr.port,
    cr.connection_count,
    cr.first_connected_at,
    cr.last_connected_at,
    cr.last_disconnected_at,
    cr.last_heartbeat,
    cr.last_seen,
    cr.created_at,
    cr.updated_at,
    rc.relay_id as config_relay_id,
    rc.relay_name as config_relay_name,
    rc.channel_config
FROM connected_relays cr
LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
WHERE cr.is_connected = FALSE;

-- Add comments to document the table structure
COMMENT ON TABLE connected_relays IS 'Tracks ESP32 relay connections and their real-time status';
COMMENT ON COLUMN connected_relays.is_connected IS 'Boolean flag indicating if relay is currently connected to WebSocket server';
COMMENT ON COLUMN connected_relays.device_id IS 'Device ID from ESP32 registration message';
COMMENT ON COLUMN connected_relays.device_name IS 'Device name from ESP32 registration message';
COMMENT ON COLUMN connected_relays.connection_count IS 'Number of times this relay has connected to the server';
COMMENT ON COLUMN connected_relays.first_connected_at IS 'Timestamp of first connection';
COMMENT ON COLUMN connected_relays.last_connected_at IS 'Timestamp of most recent connection';
COMMENT ON COLUMN connected_relays.last_disconnected_at IS 'Timestamp of most recent disconnection';
COMMENT ON COLUMN connected_relays.last_heartbeat IS 'Timestamp of last heartbeat received';
COMMENT ON COLUMN connected_relays.heartbeat_interval IS 'Expected heartbeat interval in milliseconds'; 
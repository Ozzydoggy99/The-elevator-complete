-- Add missing columns to connected_relays table for API compatibility
-- This migration adds columns that the relay assignments API expects

-- Add name column if it doesn't exist
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Add location column if it doesn't exist  
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Add description column if it doesn't exist
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add port column if it doesn't exist
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS port INTEGER DEFAULT 81;

-- Add ip_address column if it doesn't exist
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(15);

-- Add created_at and updated_at columns if they don't exist
ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE connected_relays 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_connected_relays_name ON connected_relays(name);
CREATE INDEX IF NOT EXISTS idx_connected_relays_location ON connected_relays(location);
CREATE INDEX IF NOT EXISTS idx_connected_relays_ip_address ON connected_relays(ip_address); 
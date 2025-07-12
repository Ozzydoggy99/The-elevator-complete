-- Add ip_address column to relays table
ALTER TABLE relays ADD COLUMN IF NOT EXISTS ip_address VARCHAR(15);
 
-- Add index for faster IP lookups
CREATE INDEX IF NOT EXISTS idx_relays_ip_address ON relays(ip_address); 
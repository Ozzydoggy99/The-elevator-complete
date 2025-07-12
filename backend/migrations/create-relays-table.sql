-- Create relays table for managing relay boards
CREATE TABLE IF NOT EXISTS relays (
    id SERIAL PRIMARY KEY,
    mac_address VARCHAR(17) UNIQUE NOT NULL, -- MAC address format: XX:XX:XX:XX:XX:XX
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'offline', -- 'online', 'offline', 'error'
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_relays_mac_address ON relays(mac_address);
CREATE INDEX IF NOT EXISTS idx_relays_template_id ON relays(template_id);
CREATE INDEX IF NOT EXISTS idx_relays_status ON relays(status);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_relays_updated_at 
    BEFORE UPDATE ON relays 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 
 
 
 
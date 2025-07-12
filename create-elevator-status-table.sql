-- Create elevator_status table to store elevator status from DI inputs
CREATE TABLE IF NOT EXISTS elevator_status (
    id SERIAL PRIMARY KEY,
    relay_mac VARCHAR(255) UNIQUE NOT NULL,
    status_data JSONB NOT NULL DEFAULT '{}',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_elevator_status_relay_mac ON elevator_status(relay_mac);
CREATE INDEX IF NOT EXISTS idx_elevator_status_last_updated ON elevator_status(last_updated); 
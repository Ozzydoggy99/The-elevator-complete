-- Create relay_settings table to store channel configurations for assigned relays
CREATE TABLE IF NOT EXISTS relay_settings (
    id SERIAL PRIMARY KEY,
    connected_relay_id INTEGER NOT NULL REFERENCES connected_relays(id) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    channel_1 VARCHAR(50),
    channel_2 VARCHAR(50),
    channel_3 VARCHAR(50),
    channel_4 VARCHAR(50),
    channel_5 VARCHAR(50),
    channel_6 VARCHAR(50),
    channel_7 VARCHAR(50),
    channel_8 VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(connected_relay_id, template_id)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_relay_settings_relay_template ON relay_settings(connected_relay_id, template_id); 
-- Create relay configurations table for storing relay setup information
CREATE TABLE IF NOT EXISTS relay_configurations (
    id SERIAL PRIMARY KEY,
    relay_id VARCHAR(255) UNIQUE NOT NULL,
    relay_name VARCHAR(255) NOT NULL,
    ssid VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    ip_address VARCHAR(15),
    port INTEGER DEFAULT 81,
    channel_config JSONB NOT NULL DEFAULT '{}',
    capabilities TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create connected relays table for relays that have connected to the server
CREATE TABLE IF NOT EXISTS connected_relays (
    id SERIAL PRIMARY KEY,
    mac_address VARCHAR(17) UNIQUE NOT NULL,
    relay_configuration_id INTEGER REFERENCES relay_configurations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'offline', -- 'online', 'offline', 'error'
    last_seen TIMESTAMP,
    ip_address VARCHAR(15),
    port INTEGER DEFAULT 81,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create relay assignments table for assigning relays to templates
CREATE TABLE IF NOT EXISTS relay_assignments (
    id SERIAL PRIMARY KEY,
    connected_relay_id INTEGER REFERENCES connected_relays(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES templates(id) ON DELETE CASCADE,
    assignment_type VARCHAR(50) NOT NULL, -- 'elevator', 'door', 'light', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(connected_relay_id, template_id)
);

-- Create building relay groups table for managing multiple relays per building
CREATE TABLE IF NOT EXISTS building_relay_groups (
    id SERIAL PRIMARY KEY,
    building_id VARCHAR(255) NOT NULL,
    building_name VARCHAR(255) NOT NULL,
    template_id VARCHAR(255) NOT NULL,
    relay_count INTEGER DEFAULT 0,
    total_channels INTEGER DEFAULT 0,
    active_channels INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create relay instances table for individual relay instances
CREATE TABLE IF NOT EXISTS relay_instances (
    id SERIAL PRIMARY KEY,
    relay_id VARCHAR(255) UNIQUE NOT NULL,
    building_id VARCHAR(255) NOT NULL,
    relay_name VARCHAR(255) NOT NULL,
    relay_type VARCHAR(50) NOT NULL, -- 'elevator', 'door', 'light', etc.
    ip_address VARCHAR(15) NOT NULL,
    port INTEGER DEFAULT 81,
    mac_address VARCHAR(17),
    status VARCHAR(50) DEFAULT 'offline',
    last_seen TIMESTAMP,
    channel_config TEXT NOT NULL, -- JSON configuration for 8 channels
    input_pins TEXT NOT NULL, -- JSON array of input pin assignments
    capabilities TEXT, -- JSON array of capabilities
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create relay state history table for monitoring and debugging
CREATE TABLE IF NOT EXISTS relay_state_history (
    id SERIAL PRIMARY KEY,
    relay_id VARCHAR(255) NOT NULL,
    channel_index INTEGER NOT NULL,
    function_name VARCHAR(100) NOT NULL,
    state BOOLEAN NOT NULL,
    input_state BOOLEAN,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create relay templates table for storing predefined relay configurations
CREATE TABLE IF NOT EXISTS relay_templates (
    id SERIAL PRIMARY KEY,
    template_id VARCHAR(255) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    description TEXT,
    max_relays INTEGER DEFAULT 8,
    max_channels INTEGER DEFAULT 64, -- 8 relays × 8 channels each
    template_config TEXT NOT NULL, -- JSON configuration for the template
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_relay_configs_relay_id ON relay_configurations(relay_id);
CREATE INDEX IF NOT EXISTS idx_connected_relays_mac ON connected_relays(mac_address);
CREATE INDEX IF NOT EXISTS idx_connected_relays_config ON connected_relays(relay_configuration_id);
CREATE INDEX IF NOT EXISTS idx_connected_relays_status ON connected_relays(status);
CREATE INDEX IF NOT EXISTS idx_relay_assignments_relay ON relay_assignments(connected_relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_assignments_template ON relay_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_building_relay_groups_building ON building_relay_groups(building_id);
CREATE INDEX IF NOT EXISTS idx_building_relay_groups_template ON building_relay_groups(template_id);
CREATE INDEX IF NOT EXISTS idx_relay_instances_building ON relay_instances(building_id);
CREATE INDEX IF NOT EXISTS idx_relay_instances_relay_id ON relay_instances(relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_instances_status ON relay_instances(status);
CREATE INDEX IF NOT EXISTS idx_relay_state_history_relay ON relay_state_history(relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_state_history_timestamp ON relay_state_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_relay_templates_template_id ON relay_templates(template_id);

-- Add triggers to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_relay_configs_updated_at 
    BEFORE UPDATE ON relay_configurations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connected_relays_updated_at 
    BEFORE UPDATE ON connected_relays 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 

CREATE TRIGGER update_building_relay_groups_updated_at 
    BEFORE UPDATE ON building_relay_groups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_relay_instances_updated_at 
    BEFORE UPDATE ON relay_instances 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_relay_templates_updated_at 
    BEFORE UPDATE ON relay_templates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default relay templates
INSERT INTO relay_templates (template_id, template_name, description, max_relays, max_channels, template_config) VALUES
('victorville-7story', 'Victorville 7-Story Building', '7-story building with elevator control using 8-channel relays', 2, 16, '{"relayConfigs": [{"relayId": "victorville1", "relayName": "Main Elevator Control", "relayType": "elevator", "ipAddress": "192.168.1.100", "port": 81, "channels": {"channel0": {"function": "hall_call", "inputPin": -1, "enabled": true, "safetyRequired": false}, "channel1": {"function": "door_close", "inputPin": 2, "enabled": true, "safetyRequired": true}, "channel2": {"function": "door_open", "inputPin": 4, "enabled": true, "safetyRequired": true}, "channel3": {"function": "basement_odt", "inputPin": 5, "enabled": true, "safetyRequired": true}, "channel4": {"function": "floor_1", "inputPin": 12, "enabled": true, "safetyRequired": true}, "channel5": {"function": "floor_2", "inputPin": 13, "enabled": true, "safetyRequired": true}, "channel6": {"function": "floor_3", "inputPin": 14, "enabled": true, "safetyRequired": true}, "channel7": {"function": "floor_4", "inputPin": 15, "enabled": true, "safetyRequired": true}}, "capabilities": ["elevator_control", "door_control", "floor_selection"], "inputPins": [0, 2, 4, 5, 12, 13, 14, 15]}, {"relayId": "victorville2", "relayName": "Upper Floors Control", "relayType": "elevator", "ipAddress": "192.168.1.101", "port": 81, "channels": {"channel0": {"function": "floor_5", "inputPin": 12, "enabled": true, "safetyRequired": true}, "channel1": {"function": "floor_6", "inputPin": 13, "enabled": true, "safetyRequired": true}, "channel2": {"function": "floor_7", "inputPin": 14, "enabled": true, "safetyRequired": true}, "channel3": {"function": "unused_4", "inputPin": -1, "enabled": false, "safetyRequired": false}, "channel4": {"function": "unused_5", "inputPin": -1, "enabled": false, "safetyRequired": false}, "channel5": {"function": "unused_6", "inputPin": -1, "enabled": false, "safetyRequired": false}, "channel6": {"function": "unused_7", "inputPin": -1, "enabled": false, "safetyRequired": false}, "channel7": {"function": "unused_8", "inputPin": -1, "enabled": false, "safetyRequired": false}}, "capabilities": ["floor_selection"], "inputPins": [12, 13, 14, -1, -1, -1, -1, -1]}]}'),
('large-building-20story', 'Large 20-Story Building', '20-story building with multiple elevators using 8-channel relays', 6, 48, '{"relayConfigs": [{"relayId": "elevator1-main", "relayName": "Elevator 1 - Main Control", "relayType": "elevator", "ipAddress": "192.168.1.110", "port": 81, "channels": {"channel0": {"function": "hall_call", "inputPin": -1, "enabled": true, "safetyRequired": false}, "channel1": {"function": "door_close", "inputPin": 2, "enabled": true, "safetyRequired": true}, "channel2": {"function": "door_open", "inputPin": 4, "enabled": true, "safetyRequired": true}, "channel3": {"function": "emergency_stop", "inputPin": 5, "enabled": true, "safetyRequired": true}, "channel4": {"function": "floor_1", "inputPin": 12, "enabled": true, "safetyRequired": true}, "channel5": {"function": "floor_2", "inputPin": 13, "enabled": true, "safetyRequired": true}, "channel6": {"function": "floor_3", "inputPin": 14, "enabled": true, "safetyRequired": true}, "channel7": {"function": "floor_4", "inputPin": 15, "enabled": true, "safetyRequired": true}}, "capabilities": ["elevator_control", "door_control", "floor_selection"], "inputPins": [0, 2, 4, 5, 12, 13, 14, 15]}]}'),
('skyscraper-60story', 'Skyscraper 60-Story Building', '60-story skyscraper with multiple elevators using 8-channel relays', 8, 64, '{"relayConfigs": [{"relayId": "elevator1-main", "relayName": "Elevator 1 - Main Control", "relayType": "elevator", "ipAddress": "192.168.1.200", "port": 81, "channels": {"channel0": {"function": "hall_call", "inputPin": -1, "enabled": true, "safetyRequired": false}, "channel1": {"function": "door_close", "inputPin": 2, "enabled": true, "safetyRequired": true}, "channel2": {"function": "door_open", "inputPin": 4, "enabled": true, "safetyRequired": true}, "channel3": {"function": "emergency_stop", "inputPin": 5, "enabled": true, "safetyRequired": true}, "channel4": {"function": "floor_1", "inputPin": 12, "enabled": true, "safetyRequired": true}, "channel5": {"function": "floor_2", "inputPin": 13, "enabled": true, "safetyRequired": true}, "channel6": {"function": "floor_3", "inputPin": 14, "enabled": true, "safetyRequired": true}, "channel7": {"function": "floor_4", "inputPin": 15, "enabled": true, "safetyRequired": true}}, "capabilities": ["elevator_control", "door_control", "floor_selection"], "inputPins": [0, 2, 4, 5, 12, 13, 14, 15]}]}')
ON CONFLICT (template_id) DO NOTHING; 
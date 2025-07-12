CREATE TABLE IF NOT EXISTS connected_relays (
    id SERIAL PRIMARY KEY,
    relay_config_id INTEGER NOT NULL,
    mac_address TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'offline',
    programmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    FOREIGN KEY (relay_config_id) REFERENCES relay_configurations(id)
); 
 
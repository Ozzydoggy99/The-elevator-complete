CREATE TABLE IF NOT EXISTS relay_assignments (
    id SERIAL PRIMARY KEY,
    connected_relay_id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    assignment_type TEXT,
    priority INTEGER DEFAULT 1,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connected_relay_id) REFERENCES connected_relays(id)
    -- Add FOREIGN KEY (template_id) REFERENCES templates(id) if templates table exists
); 
 
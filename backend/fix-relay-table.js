const db = require('./config/database');

async function fixRelayTable() {
    try {
        console.log('Fixing relay_configurations table...');
        
        // Drop the existing table
        await db.query('DROP TABLE IF EXISTS relay_configurations CASCADE');
        console.log('Dropped existing table');
        
        // Create the table with correct schema
        await db.query(`
            CREATE TABLE relay_configurations (
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
        `);
        console.log('Created relay_configurations table with correct schema');
        
        await db.pool.end();
    } catch (err) {
        console.error('Error fixing relay table:', err);
        await db.pool.end();
        process.exit(1);
    }
}

fixRelayTable(); 
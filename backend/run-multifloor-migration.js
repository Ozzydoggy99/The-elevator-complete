const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'robot_interface',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Running multifloor migration...');
        
        // Add multifloor column to templates table
        await client.query(`
            ALTER TABLE templates ADD COLUMN IF NOT EXISTS multifloor BOOLEAN DEFAULT FALSE;
        `);
        console.log('Added multifloor column to templates table');
        
        // Update existing templates to have multifloor set to false by default
        await client.query(`
            UPDATE templates SET multifloor = FALSE WHERE multifloor IS NULL;
        `);
        console.log('Updated existing templates with default multifloor value');
        
        console.log('Multifloor migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

runMigration()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    }); 
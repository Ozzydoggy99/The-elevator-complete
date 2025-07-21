const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'robot_interface',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
});

async function runMigration() {
    try {
        console.log('Running recurring tasks table migration...');
        
        const migrationSQL = `
            -- Create recurring tasks table
            CREATE TABLE IF NOT EXISTS recurring_tasks (
                id SERIAL PRIMARY KEY,
                template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
                task_type VARCHAR(50) NOT NULL,
                floor VARCHAR(50) NOT NULL,
                shelf_point VARCHAR(50) NOT NULL,
                schedule_time TIME NOT NULL,
                days_of_week TEXT[] NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create index for efficient querying by time and active status
            CREATE INDEX IF NOT EXISTS idx_recurring_tasks_time_active ON recurring_tasks(schedule_time, is_active);

            -- Create index for template_id lookups
            CREATE INDEX IF NOT EXISTS idx_recurring_tasks_template ON recurring_tasks(template_id);
        `;

        await pool.query(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        console.log('✅ recurring_tasks table created');
        console.log('✅ Indexes created');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

runMigration().catch(console.error); 
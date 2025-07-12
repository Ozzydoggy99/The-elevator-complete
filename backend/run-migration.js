const db = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, 'migrations', 'create-relay-configurations-table.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running migration...');
        await db.query(migrationSQL);
        console.log('Migration completed successfully');
        
        await db.pool.end();
    } catch (err) {
        console.error('Migration failed:', err);
        await db.pool.end();
        process.exit(1);
    }
}

runMigration(); 
 
 
 
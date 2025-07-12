const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Running Database Migration');
console.log('=============================');

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
        console.log('🔍 Checking if relay_configuration_id column exists...');
        
        // Check if column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'connected_relays' AND column_name = 'relay_configuration_id'
        `);
        
        if (columnCheck.rows.length === 0) {
            console.log('❌ Column relay_configuration_id does not exist. Adding it...');
            
            // Add the column
            await client.query(`
                ALTER TABLE connected_relays ADD COLUMN relay_configuration_id INTEGER
            `);
            console.log('✅ Added relay_configuration_id column');
            
            // Add foreign key constraint
            await client.query(`
                ALTER TABLE connected_relays 
                ADD CONSTRAINT connected_relays_relay_configuration_id_fkey 
                FOREIGN KEY (relay_configuration_id) REFERENCES relay_configurations(id) ON DELETE SET NULL
            `);
            console.log('✅ Added foreign key constraint');
            
            // Add index
            await client.query(`
                CREATE INDEX idx_connected_relays_config_id ON connected_relays(relay_configuration_id)
            `);
            console.log('✅ Added index for performance');
            
        } else {
            console.log('✅ Column relay_configuration_id already exists');
        }
        
        // Show current table structure
        console.log('\n📊 Current connected_relays table structure:');
        const structure = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'connected_relays' 
            ORDER BY ordinal_position
        `);
        
        structure.rows.forEach(row => {
            console.log(`   ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        console.log('\n🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the migration
runMigration()
    .then(() => {
        console.log('\n✅ Migration script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration script failed:', error);
        process.exit(1);
    }); 
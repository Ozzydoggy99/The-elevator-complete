const db = require('./backend/config/database');

async function fixDatabaseConstraint() {
    try {
        console.log('🔧 Fixing database constraint issue...');
        
        // Make relay_config_id nullable
        console.log('🔧 Making relay_config_id nullable...');
        await db.query(`
            ALTER TABLE connected_relays 
            ALTER COLUMN relay_config_id DROP NOT NULL
        `);
        console.log('✅ Made relay_config_id nullable');
        
        // Show current table structure
        console.log('\n📊 Current table structure:');
        const structure = await db.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'connected_relays' 
            ORDER BY ordinal_position
        `);
        
        structure.rows.forEach(row => {
            console.log(`   ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        console.log('\n🎉 Database constraint fixed successfully!');
        console.log('🔄 Please restart your backend server to apply the changes.');
        
    } catch (error) {
        console.error('❌ Error fixing database constraint:', error);
        throw error;
    } finally {
        await db.pool.end();
    }
}

fixDatabaseConstraint().catch(console.error); 
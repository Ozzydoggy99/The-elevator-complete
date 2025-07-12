const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'robot_management',
    password: 'password',
    port: 5432,
});

async function checkTableColumns() {
    const client = await pool.connect();
    
    try {
        console.log('Checking relay_configurations table columns...');
        
        // Get table columns
        const result = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'relay_configurations'
            ORDER BY ordinal_position
        `);
        
        console.log('\nrelay_configurations table columns:');
        result.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        // Try to insert a test record to see what happens
        console.log('\nTesting insert with minimal columns...');
        try {
            const testResult = await client.query(`
                INSERT INTO relay_configurations (relay_id, relay_name, ssid, password)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, ['test-relay', 'Test Relay', 'test-ssid', 'test-password']);
            
            console.log('✅ Test insert successful:', testResult.rows[0]);
            
            // Clean up test record
            await client.query('DELETE FROM relay_configurations WHERE relay_id = $1', ['test-relay']);
            console.log('✅ Test record cleaned up');
            
        } catch (insertError) {
            console.error('❌ Test insert failed:', insertError.message);
        }
        
    } catch (error) {
        console.error('Error checking table structure:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkTableColumns(); 
 
 
 
 
 
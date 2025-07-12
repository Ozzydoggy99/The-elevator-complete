const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Fixing Relay Configuration Links');
console.log('===================================');

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'robot_interface',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
});

async function fixRelayConfigLinks() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking existing connected relays...');
        
        // Get all connected relays without configuration links
        const connectedRelaysResult = await client.query(`
            SELECT cr.*, rc.relay_name as config_name
            FROM connected_relays cr
            LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
            WHERE cr.relay_configuration_id IS NULL
        `);
        
        console.log(`Found ${connectedRelaysResult.rows.length} connected relays without configuration links`);
        
        for (const relay of connectedRelaysResult.rows) {
            console.log(`\n🔧 Processing relay: ${relay.mac_address} (${relay.name})`);
            
            // Try to find a matching relay configuration
            const configResult = await client.query(`
                SELECT id, relay_name, relay_id 
                FROM relay_configurations 
                WHERE relay_id = $1 OR relay_name LIKE $2 OR relay_name LIKE $3
            `, [relay.mac_address, `%${relay.mac_address}%`, `%${relay.name}%`]);
            
            if (configResult.rows.length > 0) {
                const config = configResult.rows[0];
                console.log(`✅ Found matching configuration: ${config.relay_name} (${config.relay_id})`);
                
                // Update the connected relay to link to this configuration
                await client.query(`
                    UPDATE connected_relays 
                    SET relay_configuration_id = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [config.id, relay.id]);
                
                console.log(`✅ Linked relay ${relay.mac_address} to configuration ${config.relay_name}`);
            } else {
                console.log(`⚠️  No matching configuration found for relay ${relay.mac_address}`);
                console.log(`   You may need to create a relay configuration for this device`);
            }
        }
        
        // Show final status
        console.log('\n📊 Final Status:');
        const finalResult = await client.query(`
            SELECT cr.mac_address, cr.name, rc.relay_name as config_name
            FROM connected_relays cr
            LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
            ORDER BY cr.mac_address
        `);
        
        finalResult.rows.forEach(relay => {
            const status = relay.config_name ? '✅' : '❌';
            console.log(`${status} ${relay.mac_address} (${relay.name}) -> ${relay.config_name || 'No Configuration'}`);
        });
        
        console.log('\n🎉 Relay configuration linking completed!');
        
    } catch (error) {
        console.error('❌ Error fixing relay configuration links:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the fix
fixRelayConfigLinks()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    }); 
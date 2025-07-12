const db = require('./config/database');

async function checkRelayConfig() {
    try {
        console.log('Checking relay configurations in database...\n');
        
        // Check relay configurations
        const configsResult = await db.query('SELECT * FROM relay_configurations ORDER BY created_at DESC');
        console.log('=== RELAY CONFIGURATIONS ===');
        configsResult.rows.forEach((config, index) => {
            console.log(`\n${index + 1}. ${config.relay_name} (${config.relay_id})`);
            console.log(`   ID: ${config.id}`);
            console.log(`   Channel Config:`, JSON.stringify(config.channel_config, null, 2));
            console.log(`   Capabilities: ${config.capabilities.join(', ')}`);
        });
        
        // Check connected relays
        const connectedResult = await db.query(`
            SELECT cr.*, rc.relay_id, rc.relay_name as config_name, rc.channel_config
            FROM connected_relays cr
            LEFT JOIN relay_configurations rc ON cr.relay_config_id = rc.id
            ORDER BY cr.last_seen DESC
        `);
        console.log('\n=== CONNECTED RELAYS ===');
        connectedResult.rows.forEach((relay, index) => {
            console.log(`\n${index + 1}. ${relay.name || relay.config_name} (${relay.device_id})`);
            console.log(`   MAC: ${relay.mac_address}`);
            console.log(`   Status: ${relay.status}`);
            console.log(`   Config ID: ${relay.relay_config_id}`);
            if (relay.channel_config) {
                console.log(`   Channel Config:`, JSON.stringify(relay.channel_config, null, 2));
            }
        });
        
        // Check templates
        const templatesResult = await db.query('SELECT * FROM templates ORDER BY created_at DESC');
        console.log('\n=== TEMPLATES ===');
        templatesResult.rows.forEach((template, index) => {
            console.log(`\n${index + 1}. ${template.name}`);
            console.log(`   ID: ${template.id}`);
            console.log(`   Type: ${template.type}`);
            console.log(`   Configuration:`, JSON.stringify(template.configuration, null, 2));
        });
        
    } catch (error) {
        console.error('Error checking relay config:', error);
    } finally {
        await db.pool.end();
    }
}

checkRelayConfig(); 
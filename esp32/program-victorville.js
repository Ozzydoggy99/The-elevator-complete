const RelayProgrammer = require('./program-relay');

async function programVictorvilleRelay() {
    console.log('🚀 Programming Victorville Service Elevator Relay');
    console.log('================================================');
    
    const config = {
        relayId: 'Victorville1',
        relayName: 'Victorville Service Elevator',
        relayType: 'elevator',
        wifiSSID: 'Skytech Automated Solutions',
        wifiPassword: 'Skytech123wtf!',
        webSocketPort: 8080,
        capabilities: ['door_control', 'floor_selection', 'status_monitoring', 'emergency_stop']
    };

    console.log('📋 Configuration:');
    console.log(`   ID: ${config.relayId}`);
    console.log(`   Name: ${config.relayName}`);
    console.log(`   Type: ${config.relayType}`);
    console.log(`   WiFi: ${config.wifiSSID}`);
    console.log(`   Port: ${config.webSocketPort}`);
    console.log(`   Capabilities: ${config.capabilities.join(', ')}`);
    console.log('');

    try {
        const programmer = new RelayProgrammer();
        
        // Step 1: List available ports
        console.log('📋 Available Ports:');
        await programmer.listPorts();
        console.log('');

        // Step 2: Program the relay
        console.log('🚀 Programming relay...');
        await programmer.programRelay(config);
        
        console.log('');
        console.log('🎉 Programming completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Check the serial monitor for the ESP32 IP address');
        console.log('2. Test the relay connection');
        console.log('3. Register the relay in the system');
        
    } catch (error) {
        console.error('❌ Programming failed:', error.message);
        process.exit(1);
    }
}

programVictorvilleRelay(); 
const WebSocket = require('ws');

const RELAY_IP = '192.168.1.95';
const RELAY_PORT = 8081;
const RELAY_URL = `ws://${RELAY_IP}:${RELAY_PORT}`;

console.log('🔌 Single Pin Isolation Test');
console.log('============================');
console.log(`Connecting to: ${RELAY_URL}`);
console.log('');

const ws = new WebSocket(RELAY_URL);

ws.on('open', function open() {
    console.log('✅ Connected to ESP32 relay!');
    console.log('');
    console.log('🔧 Testing GPIO16 (Door Open) only...');
    console.log('Watch channel 2 - if it lights up, we have a wiring issue');
    console.log('');
    
    // Test only GPIO16 (Door Open)
    console.log('🔧 Testing GPIO16 - Door Open');
    console.log('   Turning ON for 5 seconds...');
    
    ws.send(JSON.stringify({
        type: 'set_relay',
        relay: 'doorOpen',
        state: true
    }));
    
    setTimeout(() => {
        console.log('   Turning OFF...');
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: 'doorOpen',
            state: false
        }));
        
        console.log('');
        console.log('📋 Analysis:');
        console.log('- If channel 2 lit up, all GPIO pins are wired to the same relay');
        console.log('- This indicates a hardware wiring issue');
        console.log('');
        console.log('🔧 Next steps:');
        console.log('1. Check relay board wiring');
        console.log('2. Verify GPIO pin connections');
        console.log('3. Check for short circuits');
        console.log('4. Verify power supply connections');
        
        ws.close();
    }, 5000);
});

ws.on('message', function message(data) {
    try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'relay_state') {
            console.log(`   Current states: ${JSON.stringify(message.states)}`);
        }
    } catch (error) {
        // Ignore parsing errors
    }
});

ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('🔌 Connection closed');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Stopping test...');
    ws.close();
    process.exit(0);
}); 
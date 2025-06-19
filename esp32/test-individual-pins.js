const WebSocket = require('ws');

const RELAY_IP = '192.168.1.95';
const RELAY_PORT = 8081;
const RELAY_URL = `ws://${RELAY_IP}:${RELAY_PORT}`;

console.log('🔌 Individual Pin Test');
console.log('=====================');
console.log(`Connecting to: ${RELAY_URL}`);
console.log('');

const ws = new WebSocket(RELAY_URL);

// Test each relay individually with longer delays
const pinTests = [
    { name: 'GPIO16 - Door Open', relay: 'doorOpen' },
    { name: 'GPIO17 - Door Close', relay: 'doorClose' },
    { name: 'GPIO18 - Floor 1', relay: 'floor1' },
    { name: 'GPIO19 - Floor 2', relay: 'floor2' },
    { name: 'GPIO21 - Floor 3', relay: 'floor3' },
    { name: 'GPIO22 - Floor 4', relay: 'floor4' }
];

let currentTest = 0;

ws.on('open', function open() {
    console.log('✅ Connected to ESP32 relay!');
    console.log('');
    console.log('🔧 Testing each pin individually...');
    console.log('Watch the relay board LEDs to see which channels light up!');
    console.log('');
    
    runPinTest();
});

function runPinTest() {
    if (currentTest >= pinTests.length) {
        console.log('');
        console.log('✅ All pin tests completed!');
        console.log('');
        console.log('📋 Summary:');
        console.log('- If you saw an LED light up, that pin is working');
        console.log('- If no LED lit up, that pin may not be connected');
        console.log('');
        ws.close();
        return;
    }
    
    const test = pinTests[currentTest];
    console.log(`🔧 Test ${currentTest + 1}/${pinTests.length}: ${test.name}`);
    console.log('   Turning ON...');
    
    // Turn ON
    ws.send(JSON.stringify({
        type: 'set_relay',
        relay: test.relay,
        state: true
    }));
    
    // Wait 3 seconds, then turn OFF
    setTimeout(() => {
        console.log('   Turning OFF...');
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: test.relay,
            state: false
        }));
        
        currentTest++;
        
        // Wait 2 seconds before next test
        setTimeout(() => {
            runPinTest();
        }, 2000);
        
    }, 3000);
}

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
    console.log('\n🛑 Stopping tests...');
    ws.close();
    process.exit(0);
}); 
const WebSocket = require('ws');

const RELAY_IP = '192.168.1.95';
const RELAY_PORT = 8081;
const RELAY_URL = `ws://${RELAY_IP}:${RELAY_PORT}`;

console.log('🔧 Testing Diagnostic Firmware');
console.log('==============================');
console.log(`Connecting to: ${RELAY_URL}`);
console.log('');
console.log('This will test the new GPIO pins: 4, 5, 12, 13, 14, 15');
console.log('Watch the relay board to see which channels light up!');
console.log('');

const ws = new WebSocket(RELAY_URL);

// Test each relay with the new GPIO pins
const tests = [
    { name: 'GPIO4 - Door Open', relay: 'doorOpen' },
    { name: 'GPIO5 - Door Close', relay: 'doorClose' },
    { name: 'GPIO12 - Floor 1', relay: 'floor1' },
    { name: 'GPIO13 - Floor 2', relay: 'floor2' },
    { name: 'GPIO14 - Floor 3', relay: 'floor3' },
    { name: 'GPIO15 - Floor 4', relay: 'floor4' }
];

let currentTest = 0;

ws.on('open', function open() {
    console.log('✅ Connected to ESP32 diagnostic firmware!');
    console.log('');
    console.log('🔧 Testing each GPIO pin individually...');
    console.log('');
    
    runTest();
});

function runTest() {
    if (currentTest >= tests.length) {
        console.log('');
        console.log('✅ All GPIO pin tests completed!');
        console.log('');
        console.log('📋 Results:');
        console.log('- If you saw different channels light up, the new pins work!');
        console.log('- If only one channel lit up, we still have an issue');
        console.log('');
        ws.close();
        return;
    }
    
    const test = tests[currentTest];
    console.log(`🔧 Test ${currentTest + 1}/${tests.length}: ${test.name}`);
    console.log('   Turning ON for 3 seconds...');
    
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
            runTest();
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
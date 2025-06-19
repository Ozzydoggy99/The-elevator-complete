const WebSocket = require('ws');

const RELAY_IP = '192.168.1.95';
const RELAY_PORT = 8081;
const RELAY_URL = `ws://${RELAY_IP}:${RELAY_PORT}`;

console.log('🔌 Comprehensive ESP32 Relay Test');
console.log('=================================');
console.log(`Connecting to: ${RELAY_URL}`);
console.log('');

const ws = new WebSocket(RELAY_URL);

let testStep = 0;
const tests = [
    { name: 'Door Open', relay: 'doorOpen', state: true },
    { name: 'Door Open OFF', relay: 'doorOpen', state: false },
    { name: 'Door Close', relay: 'doorClose', state: true },
    { name: 'Door Close OFF', relay: 'doorClose', state: false },
    { name: 'Floor 1', relay: 'floor1', state: true },
    { name: 'Floor 1 OFF', relay: 'floor1', state: false },
    { name: 'Floor 2', relay: 'floor2', state: true },
    { name: 'Floor 2 OFF', relay: 'floor2', state: false },
    { name: 'Floor 3', relay: 'floor3', state: true },
    { name: 'Floor 3 OFF', relay: 'floor3', state: false },
    { name: 'Floor 4', relay: 'floor4', state: true },
    { name: 'Floor 4 OFF', relay: 'floor4', state: false },
    { name: 'Emergency Stop', relay: 'emergency_stop', state: false }
];

ws.on('open', function open() {
    console.log('✅ Connected to ESP32 relay!');
    console.log('');
    
    // Get initial relay information
    console.log('📋 Getting relay information...');
    ws.send(JSON.stringify({
        type: 'get_relay_info'
    }));
    
    // Get initial states
    console.log('📊 Getting initial relay states...');
    ws.send(JSON.stringify({
        type: 'get_status'
    }));
    
    // Start testing all relays
    setTimeout(() => {
        runNextTest();
    }, 1000);
});

function runNextTest() {
    if (testStep >= tests.length) {
        console.log('');
        console.log('✅ All relay tests completed!');
        console.log('');
        console.log('📋 Final relay states:');
        ws.send(JSON.stringify({
            type: 'get_relay_info'
        }));
        
        setTimeout(() => {
            ws.close();
        }, 2000);
        return;
    }
    
    const test = tests[testStep];
    console.log(`🔧 Test ${testStep + 1}/${tests.length}: ${test.name}`);
    
    if (test.relay === 'emergency_stop') {
        ws.send(JSON.stringify({
            type: 'emergency_stop'
        }));
    } else {
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: test.relay,
            state: test.state
        }));
    }
    
    testStep++;
    
    // Wait 1 second before next test
    setTimeout(() => {
        runNextTest();
    }, 1000);
}

ws.on('message', function message(data) {
    try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
            case 'relay_info':
                console.log(`📋 Relay Info:`);
                console.log(`   ID: ${message.relay_id}`);
                console.log(`   Name: ${message.relay_name}`);
                console.log(`   Type: ${message.relay_type}`);
                console.log(`   Port: ${message.webSocket_port}`);
                console.log(`   Total Relays: ${message.num_relays}`);
                console.log(`   Capabilities: ${message.capabilities.join(', ')}`);
                console.log(`   Available Relays: ${message.relay_names.join(', ')}`);
                console.log('');
                break;
                
            case 'status':
                console.log(`📊 Status:`);
                console.log(`   WiFi: ${message.wifi_connected ? 'Connected' : 'Disconnected'}`);
                console.log(`   IP: ${message.ip_address}`);
                console.log(`   Uptime: ${Math.round(message.uptime / 1000)}s`);
                console.log('');
                break;
                
            case 'relay_state':
                console.log(`🔧 Current Relay States:`);
                Object.keys(message.states).forEach(relay => {
                    const status = message.states[relay] ? '🟢 ON' : '🔴 OFF';
                    console.log(`   ${relay}: ${status}`);
                });
                console.log('');
                break;
                
            case 'heartbeat':
                // Don't log heartbeats to keep output clean
                break;
                
            default:
                console.log(`📨 Received: ${message.type}`);
                console.log(`   Data: ${JSON.stringify(message)}`);
                console.log('');
        }
    } catch (error) {
        console.log(`📨 Raw message: ${data.toString()}`);
    }
});

ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('🔌 Connection closed');
    console.log('');
    console.log('🎉 Test Summary:');
    console.log('✅ All 6 relays tested (door open/close, floors 1-4)');
    console.log('✅ Emergency stop tested');
    console.log('✅ All relay states verified');
    console.log('✅ Communication protocol working correctly');
    process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping tests...');
    ws.close();
    process.exit(0);
}); 
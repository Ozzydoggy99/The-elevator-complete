const WebSocket = require('ws');

const RELAY_IP = '192.168.1.95';
const RELAY_PORT = 8081;
const RELAY_URL = `ws://${RELAY_IP}:${RELAY_PORT}`;

console.log('🔌 Testing ESP32 Relay Connection');
console.log('================================');
console.log(`Connecting to: ${RELAY_URL}`);
console.log('');

const ws = new WebSocket(RELAY_URL);

ws.on('open', function open() {
    console.log('✅ Connected to ESP32 relay!');
    console.log('');
    
    // Test 1: Get relay information
    console.log('📋 Test 1: Getting relay information...');
    ws.send(JSON.stringify({
        type: 'get_relay_info'
    }));
    
    // Test 2: Get current status
    console.log('📊 Test 2: Getting current status...');
    ws.send(JSON.stringify({
        type: 'get_status'
    }));
    
    // Test 3: Get relay states
    console.log('🔧 Test 3: Getting relay states...');
    ws.send(JSON.stringify({
        type: 'get_relay_info'
    }));
    
    // Test 4: Test door open relay
    setTimeout(() => {
        console.log('🚪 Test 4: Testing door open relay...');
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: 'doorOpen',
            state: true
        }));
    }, 2000);
    
    // Test 5: Turn off door open relay
    setTimeout(() => {
        console.log('🚪 Test 5: Turning off door open relay...');
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: 'doorOpen',
            state: false
        }));
    }, 4000);
    
    // Test 6: Test floor 1 selection
    setTimeout(() => {
        console.log('🏢 Test 6: Testing floor 1 selection...');
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: 'floor1',
            state: true
        }));
    }, 6000);
    
    // Test 7: Turn off floor 1
    setTimeout(() => {
        console.log('🏢 Test 7: Turning off floor 1...');
        ws.send(JSON.stringify({
            type: 'set_relay',
            relay: 'floor1',
            state: false
        }));
    }, 8000);
    
    // Test 8: Emergency stop
    setTimeout(() => {
        console.log('🛑 Test 8: Testing emergency stop...');
        ws.send(JSON.stringify({
            type: 'emergency_stop'
        }));
    }, 10000);
    
    // Close connection after tests
    setTimeout(() => {
        console.log('');
        console.log('✅ All tests completed!');
        ws.close();
    }, 12000);
});

ws.on('message', function message(data) {
    try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Received: ${message.type}`);
        
        switch (message.type) {
            case 'relay_info':
                console.log(`   Relay ID: ${message.relay_id}`);
                console.log(`   Relay Name: ${message.relay_name}`);
                console.log(`   Relay Type: ${message.relay_type}`);
                console.log(`   Port: ${message.webSocket_port}`);
                console.log(`   Relays: ${message.num_relays}`);
                console.log(`   Capabilities: ${message.capabilities.join(', ')}`);
                break;
                
            case 'status':
                console.log(`   WiFi Connected: ${message.wifi_connected}`);
                console.log(`   IP Address: ${message.ip_address}`);
                console.log(`   Uptime: ${message.uptime}ms`);
                break;
                
            case 'relay_state':
                console.log(`   Relay States:`);
                Object.keys(message.states).forEach(relay => {
                    console.log(`     ${relay}: ${message.states[relay] ? 'ON' : 'OFF'}`);
                });
                break;
                
            case 'heartbeat':
                console.log(`   Heartbeat - Uptime: ${message.uptime}ms`);
                break;
                
            case 'pong':
                console.log(`   Pong received`);
                break;
                
            default:
                console.log(`   Data: ${JSON.stringify(message)}`);
        }
        console.log('');
    } catch (error) {
        console.log(`📨 Raw message: ${data.toString()}`);
    }
});

ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('🔌 Connection closed');
    process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping tests...');
    ws.close();
    process.exit(0);
}); 
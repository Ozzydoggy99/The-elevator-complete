const WebSocket = require('ws');

console.log('🔧 Simple Relay Test');
console.log('===================');

// Connect to the server
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
    console.log('✅ Connected to server');
    
    // Test relay 0 (EXIO1) - turn it ON
    const relayCommand = {
        type: 'set_relay',
        device_id: '94:A9:90:23:06:80',  // Actual MAC address from connected relay
        relay: '0',  // Relay index 0 (EXIO1)
        state: true  // Turn ON
    };
    
    console.log('🎛️  Sending relay command:');
    console.log('   Device ID:', relayCommand.device_id);
    console.log('   Relay:', relayCommand.relay);
    console.log('   State:', relayCommand.state ? 'ON' : 'OFF');
    
    ws.send(JSON.stringify(relayCommand));
});

ws.on('message', (data) => {
    const response = JSON.parse(data.toString());
    console.log('📨 Server response:', response);
    
    if (response.type === 'relay_command_sent') {
        console.log('✅ Relay command sent successfully!');
        console.log('💡 Relay 0 (EXIO1) should now be ON');
        
        // Wait 3 seconds, then turn it off
        setTimeout(() => {
            const offCommand = {
                type: 'set_relay',
                device_id: '94:A9:90:23:06:80',
                relay: '0',
                state: false  // Turn OFF
            };
            
            console.log('🔄 Sending OFF command...');
            ws.send(JSON.stringify(offCommand));
        }, 3000);
    } else if (response.type === 'error') {
        console.log('❌ Error:', response.message);
        ws.close();
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
    console.log('🔌 Connection closed');
});

// Auto-close after 10 seconds
setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
}, 10000); 
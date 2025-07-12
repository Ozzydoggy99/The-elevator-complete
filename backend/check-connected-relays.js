const WebSocket = require('ws');

console.log('🔍 Checking Connected Relays on Server');
console.log('=====================================');
console.log('');

// Connect to the server's WebSocket endpoint
const ws = new WebSocket('ws://localhost:3000/elevator');

ws.on('open', () => {
    console.log('✅ Connected to server WebSocket');
    console.log('');
    console.log('📡 Requesting connected relay information...');
    
    // Request connected relays info
    ws.send(JSON.stringify({ 
        type: 'get_connected_relays',
        request: 'list'
    }));
});

ws.on('message', (data) => {
    try {
        const response = JSON.parse(data.toString());
        console.log('📨 Server Response:');
        console.log(JSON.stringify(response, null, 2));
        
        if (response.type === 'connected_relays') {
            console.log('');
            console.log('🔌 Connected Relays:');
            console.log('===================');
            
            if (response.relays && response.relays.length > 0) {
                response.relays.forEach((relay, index) => {
                    console.log(`${index + 1}. ${relay.name || relay.id}`);
                    console.log(`   MAC: ${relay.mac || 'Unknown'}`);
                    console.log(`   IP: ${relay.ip || 'Unknown'}`);
                    console.log(`   Status: ${relay.status || 'Unknown'}`);
                    console.log(`   Last Seen: ${relay.lastSeen || 'Unknown'}`);
                    console.log('');
                });
            } else {
                console.log('❌ No relays currently connected');
            }
        }
        
        // Close connection after getting response
        setTimeout(() => {
            ws.close();
        }, 1000);
        
    } catch (e) {
        console.log('📨 Raw message:', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Make sure the server is running on port 3000');
    console.log('2. Check if the WebSocket endpoint is available');
    console.log('3. Verify the server is accepting connections');
});

ws.on('close', () => {
    console.log('🔌 Connection closed');
    process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        console.log('⏰ Timeout reached, closing connection...');
        ws.close();
    }
}, 10000); 
const WebSocket = require('ws');

// Configuration - Connect to the RELAY server on port 40000
const RELAY_MAC = '94:A9:90:23:06:80';
const RELAY_SERVER_URL = `ws://localhost:40000/elevator?id=${RELAY_MAC}`;

console.log('🔧 Testing Relay Command on Port 40000');
console.log('=====================================');
console.log(`Relay Server: ${RELAY_SERVER_URL}`);
console.log(`Target Relay MAC: ${RELAY_MAC}`);
console.log('');

// Connect to the relay server (port 40000) with proper URL format
const ws = new WebSocket(RELAY_SERVER_URL);

ws.on('open', () => {
  console.log('✅ Connected to relay server on port 40000');
  console.log('📤 Sending relay command...');
  
  // Send the exact format the ESP32 expects
  const command = {
    type: 'relay_control',
    relay: 0,
    state: true
  };
  
  ws.send(JSON.stringify(command));
  console.log('📤 Command sent:', JSON.stringify(command, null, 2));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('📨 Received from relay server:', JSON.stringify(response, null, 2));
  
  if (response.type === 'state') {
    console.log('✅ ESP32 sent state update!');
    console.log('🔌 Check if relay 0 is now ON');
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('🔌 Disconnected from relay server');
});

// Keep connection open for debugging
console.log('🔍 Keep this running to see all messages...');
console.log('Press Ctrl+C to exit'); 
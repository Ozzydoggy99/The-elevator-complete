# ESP32 Relay Programming System

This system allows you to automatically discover ESP32 relay boards connected to your backend server and program their relays in sequence.

## Features

### 1. Automatic IP Discovery
- The backend now automatically captures and stores the IP address of each ESP32 relay when it connects
- IP addresses are stored in both memory (for active connections) and the database (for persistence)
- When a relay disconnects, its IP is removed from active tracking

### 2. Connected Relay API
- New endpoint: `GET /api/relays/connected`
- Returns all currently connected relays with their MAC addresses and IP addresses
- Useful for discovering which ESP32s are online

### 3. Relay Programming Scripts
- `discover-esp32.js` - Discovers connected ESP32 relays
- `program-relays.js` - Programs relays in sequence via WebSocket

## Setup

### 1. Backend Changes
The backend has been updated with:
- IP address tracking for connected relays
- Database migration to add `ip_address` column to `relays` table
- New API endpoint for listing connected relays
- Enhanced logging with IP addresses

### 2. Database Migration
The system automatically adds the `ip_address` column to the `relays` table on startup.

## Usage

### Step 1: Start the Backend
```bash
cd backend
npm start
```

### Step 2: Ensure ESP32 is Connected
Make sure your ESP32 is:
1. Powered on and connected to WiFi
2. Running the correct firmware
3. Connected to the backend server via WebSocket

### Step 3: Discover Connected Relays
```bash
node discover-esp32.js
```

This will:
- Query the backend for connected relays
- Display their MAC addresses and IP addresses
- Test connectivity to the ESP32
- Provide instructions for programming

Example output:
```
🤖 ESP32 Discovery Script
========================

🔍 Discovering connected ESP32 relays...
📍 Backend URL: http://localhost:3000

📊 Found 1 connected relay(s):

🔌 Relay 1:
   MAC: AA:BB:CC:DD:EE:FF
   IP:  192.168.1.100
   Status: connected

🎯 Using first connected relay: 192.168.1.100

🧪 Testing ESP32 connectivity...
✅ ESP32 is responding to HTTP requests

🎉 ESP32 is ready for relay programming!

💡 To program relays, run:
   ESP32_IP=192.168.1.100 node program-relays.js
```

### Step 4: Program Relays
```bash
# Option 1: Set environment variable
set ESP32_IP=192.168.1.100
node program-relays.js

# Option 2: Pass IP directly
ESP32_IP=192.168.1.100 node program-relays.js
```

## Relay Programming Sequence

The `program-relays.js` script will:
1. Connect to the ESP32 via WebSocket
2. Execute a predefined sequence of relay activations
3. Each relay is turned ON for 1 second, then OFF for 0.5 seconds
4. Sequence: hall_call → door_close → door_open → basement_odt → floor_1 → floor_2 → floor_3 → floor_4

## Configuration

### Environment Variables
- `BACKEND_URL` - Backend server URL (default: http://localhost:3000)
- `ESP32_IP` - ESP32 IP address (auto-discovered if not set)

### Customizing Relay Sequence
Edit the `relaySequence` array in `program-relays.js`:

```javascript
const relaySequence = [
    { relay: 'hall_call', state: true, delay: 1000 },
    { relay: 'hall_call', state: false, delay: 500 },
    // Add more relay commands...
];
```

## API Endpoints

### GET /api/relays/connected
Returns all connected relays:

```json
{
  "count": 1,
  "relays": [
    {
      "mac": "AA:BB:CC:DD:EE:FF",
      "ip": "192.168.1.100",
      "status": "connected"
    }
  ]
}
```

### POST /api/relays/:mac/command
Send a command to a specific relay:

```bash
curl -X POST http://localhost:3000/api/relays/AA:BB:CC:DD:EE:FF/command \
  -H "Content-Type: application/json" \
  -d '{"command": "set_relay", "relay": "hall_call", "state": true}'
```

## Troubleshooting

### No Relays Found
1. Check that the backend server is running
2. Verify ESP32 is connected to WiFi
3. Ensure ESP32 firmware is correct
4. Check WebSocket connection in backend logs

### Connection Errors
1. Verify ESP32 IP address is correct
2. Check firewall settings
3. Ensure ESP32 is on the same network
4. Test with `ping <ESP32_IP>`

### Database Issues
1. Check database connection
2. Verify migrations ran successfully
3. Check backend logs for database errors

## Logging

The backend now logs:
- Relay connections with IP addresses
- Relay disconnections with IP addresses
- Relay errors with IP addresses
- Command forwarding with IP addresses

Example logs:
```
Relay connected with MAC address: AA:BB:CC:DD:EE:FF from IP: 192.168.1.100
Auto-registered new relay: AA:BB:CC:DD:EE:FF as Relay-EEFF at IP: 192.168.1.100
Relay disconnected: AA:BB:CC:DD:EE:FF from IP: 192.168.1.100
``` 
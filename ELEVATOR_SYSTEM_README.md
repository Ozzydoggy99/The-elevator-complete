# 🚀 Enhanced Elevator Control System - Two Relay Configuration

A comprehensive, safety-focused elevator control system for robots with real-time I/O monitoring, safety logic, and production-ready features using **two 8-channel I2C relay boards**.

## 🏗️ System Architecture

### Hardware Components
- **2x ESP32-S3-POE-ETH-8DI-8RO-C Boards**
  - 8 Digital Inputs each (24V signals for floor position confirmation)
  - 8 Relay Outputs each (via I2C TCA9554PWR IO Expander)
  - PoE power and Ethernet connectivity
  - WiFi connectivity for wireless control

### Software Components
- **VICTORVILLE1 Firmware** (`esp32/elevator_controller_enhanced.ino`)
  - Handles floors 1-4, hall call, door controls, basement
  - WebSocket port 81
- **VICTORVILLE2 Firmware** (`esp32/elevator_controller_victorville2.ino`)
  - Handles floors 5-6 only
  - WebSocket port 82
- **Enhanced Backend API** (Updated `backend/server.js`)
  - Multi-device elevator state management
  - Command routing to appropriate relay
  - Safety logging and monitoring
- **Enhanced Frontend Interface** (`frontend/elevator-control-enhanced.html`)
  - Multi-device support
  - Real-time status monitoring
  - Safety status display

## 🔧 Setup Instructions

### 1. Hardware Setup

#### VICTORVILLE1 (Floors 1-4) Connections
```
Digital Inputs (24V Signals):
- GPIO0  -> Hall Call (no input required)
- GPIO2  -> Door Close Confirmation
- GPIO4  -> Door Open Confirmation
- GPIO5  -> BasementODT Confirmation
- GPIO12 -> Floor 1 Position Signal
- GPIO13 -> Floor 2 Position Signal
- GPIO14 -> Floor 3 Position Signal
- GPIO15 -> Floor 4 Position Signal

I2C Relay Control:
- GPIO42 (SDA) -> I2C SDA
- GPIO41 (SCL) -> I2C SCL
- I2C Address: 0x20

Relay Channels:
- Channel 1 (Bit 0): Hall Call (no input required)
- Channel 2 (Bit 1): Door Close
- Channel 3 (Bit 2): Door Open
- Channel 4 (Bit 3): BasementODT
- Channel 5 (Bit 4): Floor 1
- Channel 6 (Bit 5): Floor 2
- Channel 7 (Bit 6): Floor 3
- Channel 8 (Bit 7): Floor 4
```

#### VICTORVILLE2 (Floors 5-6) Connections
```
Digital Inputs (24V Signals):
- GPIO12 -> Floor 5 Position Signal
- GPIO13 -> Floor 6 Position Signal
- GPIO0,2,4,5,14,15 -> Unused

I2C Relay Control:
- GPIO42 (SDA) -> I2C SDA
- GPIO41 (SCL) -> I2C SCL
- I2C Address: 0x20

Relay Channels:
- Channel 1 (Bit 0): Floor 5
- Channel 2 (Bit 1): Floor 6
- Channels 3-8: Unused
```

### 2. Firmware Installation

#### Prerequisites
- PlatformIO installed
- ESP32 development environment
- WiFi credentials configured

#### Upload Process
```bash
# Upload VICTORVILLE1 (Floors 1-4)
cd esp32
node program-victorville1.js

# Upload VICTORVILLE2 (Floors 5-6)
node program-victorville2.js
```

#### Configuration
Both firmwares use:
```cpp
// WiFi credentials
const char* ssid = "Skytech Automated Solutions";
const char* password = "Skytech123wtf!";

// Backend server
const char* backendHost = "YOUR_BACKEND_IP";
const int backendPort = 3000;
```

### 3. Backend Setup

#### Database Migration
```bash
cd backend
npm install
node migrations/init.js
```

#### Server Configuration
Update `backend/server.js` with your network settings:
```javascript
const PORT = process.env.PORT || 3000;
```

#### Start Backend
```bash
cd backend
npm start
```

### 4. Frontend Setup

#### Access Interface
Navigate to: `http://YOUR_SERVER_IP:3000/frontend/elevator-control-enhanced.html`

#### Authentication
- Username: `Ozzydog`
- Password: `Ozzydog`

## 🛡️ Safety Features

### 1. Floor Position Confirmation
- **Requirement**: Elevator must be at confirmed floor before door operations
- **Logic**: Input signal must be HIGH for target floor before doors can open/close
- **Violation**: Automatic control release if position not confirmed

### 2. Door Safety Logic
- **Requirement**: Elevator must be at any floor before opening doors
- **Logic**: At least one floor input must be HIGH before door open commands
- **Violation**: Door open commands ignored if not at floor

### 3. Automatic Control Release
- **Trigger**: Safety violations, robot exit, manual release
- **Action**: All relays deactivated, control state reset
- **Logging**: All safety events logged with timestamps

### 4. Real-time Monitoring
- **Input Monitoring**: 50ms polling of all digital inputs
- **Safety Checks**: 100ms safety condition verification
- **State Reporting**: 1-second intervals to backend

## 🎮 Control Interface

### Available Commands
1. **Call Elevator** (`call_elevator`)
   - Parameters: `floor` (1-6)
   - Action: Routes to appropriate relay (victorville1 for floors 1-4, victorville2 for floors 5-6)
   - Safety: Sets elevator_in_use = true

2. **Open Doors** (`door_open`)
   - Requirements: elevator_in_use = true, at floor position
   - Action: Activates door open relay (victorville1 only)
   - Safety: Confirms floor position first

3. **Close Doors** (`door_close`)
   - Requirements: elevator_in_use = true
   - Action: Activates door close relay (victorville1 only)
   - Safety: Confirms floor position first

4. **Hall Call** (`hall_call`)
   - Action: Activates hall call relay (victorville1 only)
   - Safety: No input confirmation required

5. **Release Control** (`release_control`)
   - Action: Deactivates all relays on both devices, resets state
   - Safety: Immediate release, no confirmation required

### Device Routing
```
Floors 1-4: VICTORVILLE1 (WebSocket port 81)
Floors 5-6: VICTORVILLE2 (WebSocket port 82)
Door Controls: VICTORVILLE1 only
Hall Call: VICTORVILLE1 only
```

## 🔍 Testing Procedures

### 1. Hardware Testing
```bash
# Test individual pins
cd esp32
node test-individual-pins.js

# Test all relays
node test-all-relays.js

# Test diagnostic firmware
node test-diagnostic.js
```

### 2. Firmware Testing
```bash
# Upload and test both relay boxes
cd esp32
node program-victorville1.js
node program-victorville2.js

# Monitor serial output
# Expected: I/O initialization, WiFi connection, WebSocket servers
```

### 3. Backend Testing
```bash
# Test API endpoints
curl -X GET http://localhost:3000/api/elevator/states
curl -X POST http://localhost:3000/api/elevator/command \
  -H "Content-Type: application/json" \
  -d '{"device_id":"victorville1","command":"call_elevator","floor":1}'
curl -X POST http://localhost:3000/api/elevator/command \
  -H "Content-Type: application/json" \
  -d '{"device_id":"victorville2","command":"call_elevator","floor":5}'
```

### 4. Frontend Testing
1. Open `elevator-control-enhanced.html`
2. Select device from dropdown (victorville1 or victorville2)
3. Test floor buttons (1-4 for victorville1, 5-6 for victorville2)
4. Test door controls (victorville1 only)
5. Monitor I/O status
6. Verify safety indicators

### 5. Safety Testing
1. **Floor Confirmation Test**
   - Call elevator to floor 1 (victorville1)
   - Verify floor 1 input must be HIGH before doors can open
   - Test with input LOW (should prevent door operation)

2. **Multi-Device Test**
   - Call elevator to floor 5 (victorville2)
   - Verify command routes to correct device
   - Test floor 6 (victorville2)
   - Test floor 3 (victorville1)

3. **Control Release Test**
   - Take control of elevator on either device
   - Press "Release Control" button
   - Verify all relays deactivate on both devices
   - Verify door controls become disabled

## 📊 Monitoring and Logging

### Real-time Status
- **Device Selection**: Choose between victorville1 and victorville2
- **Elevator State**: In Use/Idle per device
- **Target Floor**: Current destination
- **Door Requests**: Open/Close status (victorville1 only)
- **I/O States**: All input and output states per device
- **Safety Status**: Floor confirmation, door safety, control status

### Safety Log
- All safety events logged with timestamps
- Color-coded entries (info, success, warning, error)
- Automatic cleanup (keeps last 50 entries)

### Backend Logging
- HTTP state reporting from both ESP32 devices
- WebSocket command routing to appropriate device
- Safety violation detection per device
- Device connection tracking

## 🔧 Configuration

### Device Configuration
```javascript
// VICTORVILLE1 Configuration
{
  "device_id": "victorville1",
  "device_name": "victorville service elevator",
  "webSocket_port": 81,
  "supported_floors": [1, 2, 3, 4],
  "features": ["hall_call", "door_control", "basement_odt"]
}

// VICTORVILLE2 Configuration
{
  "device_id": "victorville2", 
  "device_name": "victorville service elevator",
  "webSocket_port": 82,
  "supported_floors": [5, 6],
  "features": ["floor_control_only"]
}
```

### I/O Mapping Configuration
```javascript
// Backend API endpoint
GET /api/elevator/config/:device_id
PUT /api/elevator/config/:device_id

// Configuration structure
{
  "device_id": "victorville1",
  "io_mappings": [
    {
      "bit_position": 0,
      "input_pin": -1,
      "function": "hall_call",
      "enabled": true,
      "safety_required": false
    },
    {
      "bit_position": 1,
      "input_pin": 2,
      "function": "door_close",
      "enabled": true,
      "safety_required": true
    }
    // ... more mappings
  ],
  "safety_settings": {
    "require_floor_confirmation": true,
    "auto_release_on_violation": true,
    "max_door_open_time": 30000,
    "safety_check_interval": 100
  }
}
```

## 🚨 Troubleshooting

### Common Issues

1. **ESP32 Not Connecting**
   - Check WiFi credentials ("Skytech Automated Solutions")
   - Verify network connectivity
   - Check serial output for errors

2. **Relays Not Activating**
   - Verify I2C connections (GPIO42/41)
   - Check I2C address (0x20)
   - Test with diagnostic firmware

3. **Inputs Not Reading**
   - Verify 24V signal connections
   - Check input pull-up resistors
   - Test with multimeter

4. **Wrong Device Responding**
   - Check device_id in firmware
   - Verify WebSocket ports (81 vs 82)
   - Check backend routing logic

5. **WebSocket Disconnections**
   - Check network stability
   - Verify backend server status
   - Review connection logs

### Debug Commands
```bash
# Check ESP32 serial output
# Monitor WebSocket connections on ports 81 and 82
# Review backend logs
# Test individual components
```

## 📈 Production Deployment

### Security Considerations
- Change default passwords
- Use HTTPS/WSS in production
- Implement proper authentication
- Secure network access

### Performance Optimization
- Adjust polling intervals based on requirements
- Optimize WebSocket message frequency
- Monitor memory usage on ESP32
- Implement connection pooling

### Monitoring and Alerting
- Set up system health monitoring
- Implement alerting for safety violations
- Monitor device connectivity
- Track usage statistics

## 📝 API Reference

### Elevator State Endpoints
```
POST /api/elevator/state          # Receive state from ESP32
GET  /api/elevator/state/:device  # Get device state
GET  /api/elevator/states         # Get all device states
```

### Command Endpoints
```
POST /api/elevator/command        # Send command to ESP32
```

### Configuration Endpoints
```
GET  /api/elevator/config/:device # Get device config
PUT  /api/elevator/config/:device # Update device config
```

### Logging Endpoints
```
GET /api/elevator/logs/:device    # Get safety logs
```

## 🤝 Support

For technical support or questions:
1. Check the troubleshooting section
2. Review the safety log for errors
3. Test individual components
4. Contact system administrator

---

**⚠️ Safety Notice**: This system controls elevator operations. Always verify safety conditions before testing. Never bypass safety features in production environments. 
 
 
 
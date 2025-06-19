# ESP32 Relay Programming Guide

## 🎯 Overview

This guide will walk you through programming your ESP32 devices to act as relay controllers for your robot system. Each ESP32 will be programmed with a unique ID and configuration, allowing the relay registration system to identify and manage them.

## 📋 Prerequisites

### Hardware Requirements
- ESP32 Development Board
- 6-Channel Relay Module
- USB Cable (Type-C or Micro USB)
- Power Supply (5V for relays, 3.3V for ESP32)
- Jumper Wires

### Software Requirements
- [PlatformIO IDE](https://platformio.org/) (VS Code extension)
- Node.js (for programming scripts)
- Git (for version control)

## 🔧 Hardware Setup

### 1. Physical Connections

Connect your ESP32 to the relay module:

```
ESP32 Pin -> Relay Channel -> Function
GPIO16   -> Relay 1      -> Door Open
GPIO17   -> Relay 2      -> Door Close
GPIO18   -> Relay 3      -> Floor 1 Selection
GPIO19   -> Relay 4      -> Floor 2 Selection
GPIO21   -> Relay 5      -> Floor 3 Selection
GPIO22   -> Relay 6      -> Floor 4 Selection
```

**Power Connections:**
- ESP32 GND → Relay Module GND
- ESP32 3.3V → Relay Module VCC (if relay module accepts 3.3V logic)
- 5V Power Supply → Relay Module JD-VCC

### 2. Safety Check
- ✅ Verify all connections are secure
- ✅ Check relay module power supply
- ✅ Ensure no loose wires
- ✅ Test relay module with manual switch first

## 💻 Software Setup

### 1. Install PlatformIO

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "PlatformIO IDE"
4. Install the extension
5. Restart VS Code

### 2. Open the ESP32 Project

1. In VS Code, go to File → Open Folder
2. Navigate to your project's `esp32` folder
3. Select the folder and click "Select Folder"
4. PlatformIO will automatically detect the project

### 3. Configure WiFi Settings

Before programming, update the WiFi credentials in the programming script:

```javascript
// In esp32/program-relay.js, update these configurations:
const relayConfigs = {
    elevator: {
        relayId: 'elevator-main-001',
        relayName: 'Main Building Elevator',
        relayType: 'elevator',
        wifiSSID: 'YOUR_WIFI_SSID',        // ← Update this
        wifiPassword: 'YOUR_WIFI_PASSWORD', // ← Update this
        webSocketPort: 81,
        capabilities: ['door_control', 'floor_selection', 'status_monitoring', 'emergency_stop']
    }
    // ... other configurations
};
```

## 🚀 Programming Process

### Step 1: List Available Ports

First, identify which COM port your ESP32 is connected to:

```bash
cd esp32
node program-relay.js list
```

**Expected Output:**
```
📋 Available ports:
/dev/ttyUSB0 - ESP32 Dev Module
/dev/ttyUSB1 - ESP32 Dev Module
```

**Windows Example:**
```
📋 Available ports:
COM3 - ESP32 Dev Module
COM4 - ESP32 Dev Module
```

### Step 2: Program Your First Relay

Choose a relay type and program it:

```bash
# Program an elevator relay
node program-relay.js program elevator COM3

# Program a door relay
node program-relay.js program door COM4

# Program a light relay
node program-relay.js program light COM5
```

**Programming Process:**
1. **Code Generation**: Creates custom code for your relay
2. **Build**: Compiles the code for ESP32
3. **Upload**: Transfers code to ESP32
4. **Verification**: Confirms successful programming

### Step 3: Monitor the Relay

After programming, monitor the serial output to verify it's working:

```bash
node program-relay.js monitor COM3
```

**Expected Output:**
```
=== Relay Controller ===
Relay ID: elevator-main-001
Relay Name: Main Building Elevator
Relay Type: elevator
Capabilities: 4
Connecting to WiFi........
WiFi connected
IP address: 
192.168.1.100
WebSocket server started
```

## 🔍 Verification Steps

### 1. WiFi Connection
- ✅ ESP32 connects to WiFi
- ✅ IP address is displayed
- ✅ LED blinks 3 times (success)

### 2. WebSocket Server
- ✅ Server starts on specified port
- ✅ No error messages in serial monitor

### 3. Relay Control
- ✅ Relays respond to commands
- ✅ LED blinks when relay is activated
- ✅ Status messages appear in serial monitor

## 📝 Custom Relay Configurations

### Creating Custom Relay Types

You can create custom relay configurations by adding to the `relayConfigs` object:

```javascript
// Add this to esp32/program-relay.js
const relayConfigs = {
    // ... existing configurations
    
    custom: {
        relayId: 'custom-relay-001',
        relayName: 'Custom Relay System',
        relayType: 'custom',
        wifiSSID: 'YourWiFiSSID',
        wifiPassword: 'YourWiFiPassword',
        webSocketPort: 84,
        relayPins: [16, 17, 18, 19, 21, 22], // Custom pin configuration
        capabilities: ['custom_control', 'status_monitoring']
    }
};
```

### Relay Types and Capabilities

| Relay Type | Pins Used | Capabilities | Use Case |
|------------|-----------|--------------|----------|
| `elevator` | 6 | door_control, floor_selection, status_monitoring, emergency_stop | Elevator control |
| `door` | 2 | door_control, status_monitoring | Door automation |
| `light` | 2 | light_control, status_monitoring | Lighting control |
| `gate` | 2 | gate_control, status_monitoring | Gate automation |
| `custom` | 6 | custom_control, status_monitoring | Custom applications |

## 🔧 Troubleshooting

### Common Issues

#### 1. Upload Failed
**Symptoms:** "Upload failed" error
**Solutions:**
- Check USB cable connection
- Press and hold BOOT button on ESP32 during upload
- Try different USB port
- Install/update USB drivers

#### 2. WiFi Connection Failed
**Symptoms:** "WiFi connection failed" in serial monitor
**Solutions:**
- Verify WiFi credentials
- Check WiFi signal strength
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Try power cycling ESP32

#### 3. Relay Not Responding
**Symptoms:** Relays don't switch when commanded
**Solutions:**
- Check relay module power supply
- Verify pin connections
- Test relay module manually
- Check relay module logic level (3.3V vs 5V)

#### 4. WebSocket Connection Issues
**Symptoms:** Can't connect to relay from backend
**Solutions:**
- Verify IP address from serial monitor
- Check if port is accessible
- Ensure no firewall blocking
- Test with simple WebSocket client

### Debug Commands

```bash
# Test relay connectivity
node test-relay-connectivity.js elevator-main-001 192.168.1.100

# Monitor specific relay
node program-relay.js monitor COM3

# Rebuild project
cd esp32
platformio run --target clean
platformio run
```

## 📊 Programming Multiple Relays

### Batch Programming Script

For programming multiple relays, create a batch script:

```bash
#!/bin/bash
# program-all-relays.sh

echo "Programming all relays..."

# Program elevator relay
echo "Programming elevator relay..."
node program-relay.js program elevator COM3

# Program door relay
echo "Programming door relay..."
node program-relay.js program door COM4

# Program light relay
echo "Programming light relay..."
node program-relay.js program light COM5

echo "All relays programmed!"
```

### Relay Inventory Management

Keep track of your programmed relays:

```javascript
// relay-inventory.js
const relayInventory = [
    {
        id: 'elevator-main-001',
        name: 'Main Building Elevator',
        type: 'elevator',
        ip: '192.168.1.100',
        port: 81,
        comPort: 'COM3',
        programmed: true,
        lastSeen: new Date()
    },
    {
        id: 'door-warehouse-001',
        name: 'Warehouse Door',
        type: 'door',
        ip: '192.168.1.101',
        port: 82,
        comPort: 'COM4',
        programmed: true,
        lastSeen: new Date()
    }
];
```

## 🎯 Next Steps

After programming your relays:

1. **Register them** in the relay registration system
2. **Associate them** with robots and templates
3. **Test the complete system** with the relay registration tests
4. **Monitor their status** through the frontend interface

## 📚 Additional Resources

- [ESP32 Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- [PlatformIO Documentation](https://docs.platformio.org/)
- [WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [ArduinoJson Library](https://arduinojson.org/)

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review the serial monitor output
3. Verify hardware connections
4. Test with known working ESP32
5. Check the project's GitHub issues

---

**Remember:** Always test relays in a safe environment before connecting to actual elevator or door controls! 
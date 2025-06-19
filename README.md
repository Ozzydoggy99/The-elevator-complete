# ESP32-S3 Elevator Relay Controller

A robust WiFi-enabled relay controller for elevator systems using ESP32-S3 and Waveshare relay boards.

## Features

- **WiFi Control**: Remote control via WebSocket over WiFi
- **6-Channel Relay Control**: Door open/close and 4 floor selection
- **Real-time Status**: Live relay state monitoring
- **Production Ready**: Clean, focused firmware for deployment
- **Easy Integration**: Simple JSON command interface

## Hardware Requirements

- ESP32-S3 DevKitC-1
- Waveshare 6-Channel Relay Board
- Power supply for relay board
- WiFi network access

## Pin Mapping

The relay controller uses the following GPIO pin mappings:

| Channel | GPIO Pin | Function | Relay Board Label |
|---------|----------|----------|-------------------|
| 1 | GPIO 1 | Door Open | OI 1 |
| 2 | GPIO 2 | Door Close | OI 2 |
| 3 | GPIO 41 | Floor 1 | OI 41 |
| 4 | GPIO 42 | Floor 2 | OI 42 |
| 5 | GPIO 45 | Floor 3 | OI 45 |
| 6 | GPIO 46 | Floor 4 | OI 46 |

## Configuration

### WiFi Settings
Edit `esp32/src/main.cpp` to configure your WiFi credentials:

```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### Relay Configuration
The relay ID and name can be customized:

```cpp
const char* RELAY_ID = "Victorville1";
const char* RELAY_NAME = "Victorville Service Elevator";
```

## Installation

1. **Install PlatformIO** (if not already installed):
   ```bash
   pip install platformio
   ```

2. **Clone the repository**:
   ```bash
   git clone https://github.com/Ozzydoggy99/ELEVATOR-1.git
   cd ELEVATOR-1
   ```

3. **Upload firmware**:
   ```bash
   cd esp32
   pio run --target upload
   ```

4. **Reset the ESP32** after upload

## Usage

### WebSocket Commands

Connect to the ESP32 via WebSocket on port 8081 and send JSON commands:

#### Control Individual Relays
```json
{
  "relay": "doorOpen",
  "state": true
}
```

#### Get Status
```json
{
  "command": "status"
}
```

#### Test All Relays
```json
{
  "command": "test"
}
```

### Available Relay Commands

- `doorOpen` - Control door open relay
- `doorClose` - Control door close relay  
- `floor1` - Control floor 1 relay
- `floor2` - Control floor 2 relay
- `floor3` - Control floor 3 relay
- `floor4` - Control floor 4 relay

### Response Format

The ESP32 responds with relay state information:

```json
{
  "type": "relay_states",
  "relay_id": "Victorville1",
  "relay_name": "Victorville Service Elevator",
  "ip": "192.168.1.95",
  "states": {
    "doorOpen": 0,
    "doorClose": 0,
    "floor1": 0,
    "floor2": 0,
    "floor3": 0,
    "floor4": 0
  }
}
```

## Testing

Use the included test script to verify relay functionality:

```bash
cd esp32
node test-relay-commands.js
```

This script will:
1. Automatically find the ESP32 on your network
2. Connect via WebSocket
3. Test each relay sequentially
4. Display real-time status updates

## Network Discovery

The ESP32 will automatically connect to WiFi and display its IP address in the serial monitor. The test script can also automatically scan for the device on common network ranges.

## Troubleshooting

### Relays Not Responding
- Check physical connections between ESP32 and relay board
- Verify GPIO pin mappings match your relay board
- Ensure proper power supply to relay board

### WiFi Connection Issues
- Verify WiFi credentials in the firmware
- Check network connectivity
- Reset ESP32 after configuration changes

### WebSocket Connection Failed
- Verify ESP32 IP address from serial monitor
- Check firewall settings
- Ensure port 8081 is accessible

## Development

### Building from Source
```bash
cd esp32
pio run
```

### Serial Monitor
```bash
pio device monitor
```

### Clean Build
```bash
pio run --target clean
```

## License

This project is open source and available under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and questions, please open an issue on GitHub.

---

**Note**: This controller is designed for elevator systems and should be used in accordance with all applicable safety regulations and building codes. 
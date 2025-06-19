const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class RelayProgrammer {
    constructor() {
        this.platformioPath = 'platformio';
        this.projectPath = __dirname;
        this.configPath = path.join(this.projectPath, 'src', 'main.cpp');
    }

    // Generate ESP32 code with custom configuration
    generateRelayCode(config) {
        const {
            relayId,
            relayName,
            relayType,
            wifiSSID,
            wifiPassword,
            webSocketPort = 81,
            relayPins = [16, 17, 18, 19, 21, 22],
            capabilities = []
        } = config;

        const code = `#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// Relay Configuration
const char* RELAY_ID = "${relayId}";
const char* RELAY_NAME = "${relayName}";
const char* RELAY_TYPE = "${relayType}";

// WiFi credentials
const char* ssid = "${wifiSSID}";
const char* password = "${wifiPassword}";

// WebSocket server port
const int webSocketPort = ${webSocketPort};

// Relay pins (adjust according to your wiring)
const int RELAY_PINS[] = {
    ${relayPins.join(',\n    ')}
};
const int NUM_RELAYS = ${relayPins.length};

// Relay names for JSON communication
const char* RELAY_NAMES[] = {
    ${this.generateRelayNames(relayType, capabilities)}
};

// Capabilities
const char* CAPABILITIES[] = {
    ${capabilities.map(cap => `"${cap}"`).join(',\n    ')}
};
const int NUM_CAPABILITIES = ${capabilities.length};

// WebSocket server
WebSocketsServer webSocket = WebSocketsServer(webSocketPort);

// JSON document for messages
StaticJsonDocument<512> doc;

// Status variables
bool connected = false;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Function declarations
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
void handleSetRelay(JsonDocument& doc);
void sendStatus();
void sendHeartbeat();
void sendRelayInfo();
void sendRelayStates();
void sendPong();
void blinkLED(int times);

void setup() {
    Serial.begin(115200);
    
    // Initialize relay pins
    for (int i = 0; i < NUM_RELAYS; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH); // Relays are typically active LOW
    }
    
    // Initialize built-in LED
    pinMode(2, OUTPUT);
    
    Serial.println("=== Relay Controller ===");
    Serial.printf("Relay ID: %s\\n", RELAY_ID);
    Serial.printf("Relay Name: %s\\n", RELAY_NAME);
    Serial.printf("Relay Type: %s\\n", RELAY_TYPE);
    Serial.printf("Capabilities: %d\\n", NUM_CAPABILITIES);
    
    // Connect to WiFi
    WiFi.begin(ssid, password);
    Serial.print("Connecting to WiFi");
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("");
        Serial.println("WiFi connected");
        Serial.println("IP address: ");
        Serial.println(WiFi.localIP());
        
        // Blink LED 3 times for WiFi success
        blinkLED(3);
    } else {
        Serial.println("WiFi connection failed");
        // Blink LED 10 times for WiFi failure
        blinkLED(10);
    }
    
    // Start WebSocket server
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("WebSocket server started");
    
    // Send initial status
    sendStatus();
}

void loop() {
    webSocket.loop();
    
    // Send heartbeat
    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[%u] Disconnected!\\n", num);
            connected = false;
            break;
            
        case WStype_CONNECTED:
            {
                IPAddress ip = webSocket.remoteIP(num);
                Serial.printf("[%u] Connected from %d.%d.%d.%d\\n", num, ip[0], ip[1], ip[2], ip[3]);
                connected = true;
                
                // Blink LED 2 times for new connection
                blinkLED(2);
                
                // Send relay information
                sendRelayInfo();
                sendRelayStates();
            }
            break;
            
        case WStype_TEXT:
            {
                // Parse JSON message
                DeserializationError error = deserializeJson(doc, payload);
                
                if (error) {
                    Serial.print("deserializeJson() failed: ");
                    Serial.println(error.c_str());
                    return;
                }
                
                // Handle message
                const char* msgType = doc["type"];
                
                if (strcmp(msgType, "set_relay") == 0) {
                    handleSetRelay(doc);
                } else if (strcmp(msgType, "get_status") == 0) {
                    sendStatus();
                } else if (strcmp(msgType, "get_relay_info") == 0) {
                    sendRelayInfo();
                } else if (strcmp(msgType, "ping") == 0) {
                    sendPong();
                } else {
                    Serial.printf("Unknown message type: %s\\n", msgType);
                }
            }
            break;
    }
}

void handleSetRelay(JsonDocument& doc) {
    const char* relay = doc["relay"];
    bool state = doc["state"];
    
    // Find relay index
    int relayIndex = -1;
    for (int i = 0; i < NUM_RELAYS; i++) {
        if (strcmp(relay, RELAY_NAMES[i]) == 0) {
            relayIndex = i;
            break;
        }
    }
    
    if (relayIndex >= 0) {
        // Set relay state (inverted because relays are active LOW)
        digitalWrite(RELAY_PINS[relayIndex], !state);
        blinkLED(1); // Action indication
        
        Serial.printf("Relay %s set to %s\\n", relay, state ? "ON" : "OFF");
        
        // Send updated states
        sendRelayStates();
    } else {
        Serial.printf("Unknown relay: %s\\n", relay);
    }
}

void sendStatus() {
    StaticJsonDocument<256> statusDoc;
    statusDoc["type"] = "status";
    statusDoc["relay_id"] = RELAY_ID;
    statusDoc["relay_name"] = RELAY_NAME;
    statusDoc["relay_type"] = RELAY_TYPE;
    statusDoc["connected"] = connected;
    statusDoc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
    statusDoc["ip_address"] = WiFi.localIP().toString();
    statusDoc["uptime"] = millis();
    
    String message;
    serializeJson(statusDoc, message);
    webSocket.broadcastTXT(message);
}

void sendHeartbeat() {
    StaticJsonDocument<128> heartbeatDoc;
    heartbeatDoc["type"] = "heartbeat";
    heartbeatDoc["relay_id"] = RELAY_ID;
    heartbeatDoc["uptime"] = millis();
    
    String message;
    serializeJson(heartbeatDoc, message);
    webSocket.broadcastTXT(message);
}

void sendRelayInfo() {
    StaticJsonDocument<512> infoDoc;
    infoDoc["type"] = "relay_info";
    infoDoc["relay_id"] = RELAY_ID;
    infoDoc["relay_name"] = RELAY_NAME;
    infoDoc["relay_type"] = RELAY_TYPE;
    infoDoc["webSocket_port"] = webSocketPort;
    infoDoc["num_relays"] = NUM_RELAYS;
    infoDoc["num_capabilities"] = NUM_CAPABILITIES;
    
    JsonArray capabilitiesArray = infoDoc.createNestedArray("capabilities");
    for (int i = 0; i < NUM_CAPABILITIES; i++) {
        capabilitiesArray.add(CAPABILITIES[i]);
    }
    
    JsonArray relayNamesArray = infoDoc.createNestedArray("relay_names");
    for (int i = 0; i < NUM_RELAYS; i++) {
        relayNamesArray.add(RELAY_NAMES[i]);
    }
    
    String message;
    serializeJson(infoDoc, message);
    webSocket.broadcastTXT(message);
}

void sendRelayStates() {
    StaticJsonDocument<512> stateDoc;
    stateDoc["type"] = "relay_state";
    stateDoc["relay_id"] = RELAY_ID;
    JsonObject states = stateDoc.createNestedObject("states");
    
    // Add all relay states
    for (int i = 0; i < NUM_RELAYS; i++) {
        // Invert because relays are active LOW
        states[RELAY_NAMES[i]] = !digitalRead(RELAY_PINS[i]);
    }
    
    // Serialize and send
    String message;
    serializeJson(stateDoc, message);
    webSocket.broadcastTXT(message);
}

void sendPong() {
    StaticJsonDocument<128> pongDoc;
    pongDoc["type"] = "pong";
    pongDoc["relay_id"] = RELAY_ID;
    pongDoc["timestamp"] = millis();
    
    String message;
    serializeJson(pongDoc, message);
    webSocket.broadcastTXT(message);
}

void blinkLED(int times) {
    for (int i = 0; i < times; i++) {
        digitalWrite(2, HIGH);
        delay(200);
        digitalWrite(2, LOW);
        delay(200);
    }
}

generateRelayNames(relayType, capabilities) {
    switch (relayType) {
        case 'elevator':
            return `"doorOpen",
    "doorClose",
    "floor1",
    "floor2",
    "floor3",
    "floor4"`;
        case 'door':
            return `"doorOpen",
    "doorClose"`;
        case 'light':
            return `"lightOn",
    "lightOff"`;
        case 'gate':
            return `"gateOpen",
    "gateClose"`;
        default:
            return `"relay1",
    "relay2",
    "relay3",
    "relay4",
    "relay5",
    "relay6"`;
    }
}

// Write code to file
async writeRelayCode(config) {
    const code = this.generateRelayCode(config);
    const filePath = path.join(this.projectPath, 'src', 'main.cpp');
    
    try {
        fs.writeFileSync(filePath, code);
        console.log(`✅ Generated code for relay: ${config.relayId}`);
        return true;
    } catch (error) {
        console.error(`❌ Error writing code: ${error.message}`);
        return false;
    }
}

// Build the project
async buildProject() {
    console.log('🔨 Building ESP32 project...');
    
    try {
        const { stdout, stderr } = await execAsync(`${this.platformioPath} run`, {
            cwd: this.projectPath
        });
        
        if (stderr) {
            console.warn('⚠️  Build warnings:', stderr);
        }
        
        console.log('✅ Build completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        return false;
    }
}

// Upload to ESP32
async uploadToESP32(port = null) {
    console.log('📤 Uploading to ESP32...');
    
    try {
        const uploadCommand = port 
            ? `${this.platformioPath} run --target upload --upload-port ${port}`
            : `${this.platformioPath} run --target upload`;
        
        const { stdout, stderr } = await execAsync(uploadCommand, {
            cwd: this.projectPath
        });
        
        if (stderr) {
            console.warn('⚠️  Upload warnings:', stderr);
        }
        
        console.log('✅ Upload completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        return false;
    }
}

// Monitor serial output
async monitorSerial(port = null) {
    console.log('📺 Starting serial monitor...');
    
    try {
        const monitorCommand = port 
            ? `${this.platformioPath} device monitor --port ${port}`
            : `${this.platformioPath} device monitor`;
        
        const { stdout, stderr } = await execAsync(monitorCommand, {
            cwd: this.projectPath
        });
        
        console.log(stdout);
    } catch (error) {
        console.error('❌ Monitor failed:', error.message);
    }
}

// Program a relay with full process
async programRelay(config, port = null) {
    console.log(`🚀 Programming relay: ${config.relayId}`);
    console.log('=====================================');
    
    // Step 1: Generate code
    console.log('�� Step 1: Generating relay code...');
    const codeGenerated = await this.writeRelayCode(config);
    if (!codeGenerated) {
        return false;
    }
    
    // Step 2: Build project
    console.log('🔨 Step 2: Building project...');
    const buildSuccess = await this.buildProject();
    if (!buildSuccess) {
        return false;
    }
    
    // Step 3: Upload to ESP32
    console.log('📤 Step 3: Uploading to ESP32...');
    const uploadSuccess = await this.uploadToESP32(port);
    if (!uploadSuccess) {
        return false;
    }
    
    console.log('🎉 Relay programming completed successfully!');
    console.log(`📋 Relay ID: ${config.relayId}`);
    console.log(`🏷️  Relay Name: ${config.relayName}`);
    console.log(`🔌 Relay Type: ${config.relayType}`);
    console.log(`📡 WebSocket Port: ${config.webSocketPort || 81}`);
    
    return true;
}

// List available ports
async listPorts() {
    try {
        const { stdout } = await execAsync(`${this.platformioPath} device list`);
        console.log('📋 Available ports:');
        console.log(stdout);
    } catch (error) {
        console.error('❌ Error listing ports:', error.message);
    }
}
}

// Example relay configurations
const relayConfigs = {
    elevator: {
        relayId: 'elevator-main-001',
        relayName: 'Main Building Elevator',
        relayType: 'elevator',
        wifiSSID: 'YourWiFiSSID',
        wifiPassword: 'YourWiFiPassword',
        webSocketPort: 81,
        capabilities: ['door_control', 'floor_selection', 'status_monitoring', 'emergency_stop']
    },
    door: {
        relayId: 'door-warehouse-001',
        relayName: 'Warehouse Door',
        relayType: 'door',
        wifiSSID: 'YourWiFiSSID',
        wifiPassword: 'YourWiFiPassword',
        webSocketPort: 82,
        capabilities: ['door_control', 'status_monitoring']
    },
    light: {
        relayId: 'light-parking-001',
        relayName: 'Parking Lot Lights',
        relayType: 'light',
        wifiSSID: 'YourWiFiSSID',
        wifiPassword: 'YourWiFiPassword',
        webSocketPort: 83,
        capabilities: ['light_control', 'status_monitoring']
    }
};

// Main function
async function main() {
    const programmer = new RelayProgrammer();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'list':
            await programmer.listPorts();
            break;
            
        case 'program':
            const relayType = args[1];
            const port = args[2];
            
            if (!relayType || !relayConfigs[relayType]) {
                console.log('Usage: node program-relay.js program <relay_type> [port]');
                console.log('Available relay types:', Object.keys(relayConfigs).join(', '));
                return;
            }
            
            const config = relayConfigs[relayType];
            await programmer.programRelay(config, port);
            break;
            
        case 'monitor':
            const monitorPort = args[1];
            await programmer.monitorSerial(monitorPort);
            break;
            
        default:
            console.log('ESP32 Relay Programmer');
            console.log('======================');
            console.log('');
            console.log('Commands:');
            console.log('  list                    - List available ports');
            console.log('  program <type> [port]   - Program a relay');
            console.log('  monitor [port]          - Monitor serial output');
            console.log('');
            console.log('Available relay types:');
            Object.keys(relayConfigs).forEach(type => {
                console.log(`  ${type} - ${relayConfigs[type].relayName}`);
            });
            console.log('');
            console.log('Examples:');
            console.log('  node program-relay.js list');
            console.log('  node program-relay.js program elevator COM3');
            console.log('  node program-relay.js monitor COM3');
    }
}

// Run the program
if (require.main === module) {
    main().catch(console.error);
}

module.exports = RelayProgrammer; 
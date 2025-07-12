// Clean ESP32 Relay Controller Firmware
// 8 I2C Relay Outputs (0-7) + 8 Direct GPIO Inputs (4-11)
// WebSocket Reverse Proxy to skytechautomated.com:40000

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <EEPROM.h>

// EEPROM Configuration Storage
#define EEPROM_SIZE 512
#define CONFIG_MAGIC 0x12345678
#define CONFIG_VERSION 1

// I2C Relay Configuration
#define I2C_SDA 42  // Fixed: SDA should be GPIO42
#define I2C_SCL 41  // Fixed: SCL should be GPIO41
#define RELAY_REG_INPUT 0x00    // Input Port Register
#define RELAY_REG_OUTPUT 0x01   // Output Port Register  
#define RELAY_REG_CONFIG 0x03   // Configuration Register

// Error tracking
bool i2cError = false;
unsigned long lastI2CError = 0;
const unsigned long I2C_ERROR_REPORT_INTERVAL = 30000; // Report I2C errors every 30 seconds

// Global variable for I2C address (will be set during initialization)
byte RELAY_I2C_ADDRESS = 0x20;  // Fixed: TCA9554PWR address is 0x20

// Configuration Structure
struct DeviceConfig {
    uint32_t magic;
    uint8_t version;
    char device_id[32];
    char device_name[64];
    char wifi_ssid[32];
    char wifi_password[64];
    char server_host[64];
    int server_port;
    bool configured;
};

// Default Configuration (will be overwritten by programming)
DeviceConfig config = {
    CONFIG_MAGIC,
    CONFIG_VERSION,
    "unconfigured",
    "Unconfigured Relay",
    "",
    "",
    "skytechautomated.com",
    40000,
    false
};

// WebSocket Client (Reverse Proxy to Backend Server)
WebSocketsClient webSocket;

// State tracking
bool inputStates[8] = {false};
bool lastInputStates[8] = {false};
uint8_t relayStates = 0b00000000; // All relays OFF initially
uint8_t expectedRelayStates = 0b00000000; // Track expected vs actual states
unsigned long lastStateReport = 0;
const unsigned long STATE_REPORT_INTERVAL = 500; // Report every 500ms

// Connection state tracking
bool wsConnected = false;
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL = 60000; // 1 minute

// Input pins (GPIO 4-11)
const int INPUT_PINS[] = {4, 5, 6, 7, 8, 9, 10, 11};

// Function declarations
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleWebSocketMessage(uint8_t * payload, size_t length);
void sendFullState();
void readInputs();
bool updateRelays();
void loadConfiguration();
void saveConfiguration();
void connectToWiFi();
void connectToWebSocket();
void handleSerialConfiguration();
void applyConfiguration(JsonObject configData);
void sendConfigResponse(bool success, const char* message);
void resetToDefaults();
void initI2CRelays();
void sendRelayControlAck(int relayIndex, bool state, bool success, const char* error);
void sendErrorReport(const char* errorType, const char* message);
bool verifyRelayState(int relayIndex, bool expectedState);
void reportI2CError();
void setRelayState(byte relayIndex, bool state);

void setup() {
  Serial.begin(115200);
  delay(1000);
    
    Serial.println("=== ESP32 Relay Controller ===");
    Serial.println("VERSION: 2024-12-19-CLEAN");
    Serial.println("Connecting to skytechautomated.com:40000");
    
    // Initialize EEPROM
    EEPROM.begin(EEPROM_SIZE);
    
    // Initialize WiFi first to get MAC address
    WiFi.mode(WIFI_STA);
    
    // Check if we have embedded WiFi credentials first (before loading EEPROM)
    Serial.println("Checking for embedded configuration...");
    Serial.printf("Embedded SSID: '%s'\n", config.wifi_ssid);
    Serial.printf("Embedded password length: %d\n", strlen(config.wifi_password));
    
    if (strlen(config.wifi_ssid) > 0) {
        Serial.println("✅ Found embedded WiFi configuration!");
        Serial.printf("WiFi SSID: %s\n", config.wifi_ssid);
        Serial.printf("Device ID: %s\n", config.device_id);
        Serial.printf("Device Name: %s\n", config.device_name);
        config.configured = true;
        // Don't load from EEPROM - use embedded config
    } else {
        Serial.println("⚠️  No embedded WiFi configuration found, loading from EEPROM...");
        // Load configuration from EEPROM only if no embedded config
        loadConfiguration();
        
        // Only use MAC address as device ID if no embedded config
        if (!config.configured || strcmp(config.device_id, "unconfigured") == 0) {
            String macAddress = WiFi.macAddress();
            strcpy(config.device_id, macAddress.c_str());
            strcpy(config.device_name, "ESP32 Relay Controller");
            config.configured = true;
            saveConfiguration();
            Serial.printf("Using MAC address as device ID: %s\n", macAddress.c_str());
        }
    }
    
    // Initialize I2C with specific pins
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(100000); // Set to 100kHz for better compatibility (like working code)
    delay(100); // Small delay for I2C to stabilize
    
    // Scan for I2C devices
    Serial.println("Scanning I2C bus...");
    for (byte address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        byte error = Wire.endTransmission();
        if (error == 0) {
            Serial.printf("I2C device found at address 0x%02X\n", address);
        }
    }
    Serial.println("I2C scan complete");
    
    // Initialize I2C relays
    initI2CRelays();
    
    // Initialize input pins
    for (int i = 0; i < 8; i++) {
        pinMode(INPUT_PINS[i], INPUT_PULLUP);
    }
    
    // Always wait for configuration first (for programming)
    Serial.println("Waiting for configuration...");
    Serial.println("Send configuration via serial or wait 10 seconds to continue...");
    
    unsigned long startTime = millis();
    while (millis() - startTime < 10000) {
        handleSerialConfiguration();
        delay(100);
    }
    
    // Connect to WiFi and server if configured
    if (config.configured && strlen(config.wifi_ssid) > 0) {
        Serial.println("Configuration found, connecting to WiFi...");
        Serial.printf("WiFi SSID: %s\n", config.wifi_ssid);
        Serial.printf("Server: %s:%d\n", config.server_host, config.server_port);
  connectToWiFi();
  connectToWebSocket();
    } else {
        Serial.println("Device not configured with WiFi credentials. Cannot connect.");
        Serial.printf("Current device_id: %s\n", config.device_id);
        Serial.printf("Current device_name: %s\n", config.device_name);
        Serial.println("Note: Device needs WiFi credentials to connect to server.");
    }
}

void loop() {
  webSocket.loop();
    
    // Check WiFi and reconnect if needed
    if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL) {
            Serial.println("WiFi disconnected. Attempting to reconnect...");
            connectToWiFi();
            lastReconnectAttempt = millis();
        }
    }
    
    // Check WebSocket and reconnect if needed
    if (WiFi.status() == WL_CONNECTED && !wsConnected) {
        if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL) {
            Serial.println("WebSocket disconnected. Attempting to reconnect...");
            connectToWebSocket();
            lastReconnectAttempt = millis();
        }
    }
    
    // Handle serial configuration
    handleSerialConfiguration();
    
    // Read inputs and send state changes
    readInputs();
    
    // Send periodic state report
    if (wsConnected && millis() - lastStateReport > STATE_REPORT_INTERVAL) {
        sendFullState();
        lastStateReport = millis();
    }
    
    delay(100); // Small delay to prevent overwhelming
}

void initI2CRelays() {
    Serial.println("Initializing TCA9554PWR I2C expander...");
    
    // Try multiple common TCA9554PWR addresses (but prioritize 0x20)
    byte addresses[] = {0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x38, 0x39, 0x3A, 0x3B, 0x3C, 0x3D, 0x3E, 0x3F};
    bool found = false;
    
    for (byte addr : addresses) {
        Wire.beginTransmission(addr);
        byte error = Wire.endTransmission();
        
        if (error == 0) {
            Serial.printf("✅ TCA9554PWR found at address 0x%02X\n", addr);
            
            // Update the address for future use
            RELAY_I2C_ADDRESS = addr;
            
            found = true;
            break;
        }
    }
    
    if (!found) {
        Serial.println("❌ TCA9554PWR not found at any common address");
        Serial.println("Please check I2C wiring and power supply");
        return;
    }
    
    // Read current configuration register
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(0x03); // Configuration register
    byte error = Wire.endTransmission();
    
    if (error == 0) {
        Wire.requestFrom(RELAY_I2C_ADDRESS, 1);
        if (Wire.available()) {
            byte configVal = Wire.read();
            Serial.printf("Current config register: 0x%02X\n", configVal);
        }
    }
    
    // Configure all pins as outputs (0 = output, 1 = input)
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(0x03); // Configuration register
    Wire.write(0x00); // All pins as outputs
    error = Wire.endTransmission();
    
    if (error != 0) {
        Serial.printf("❌ Failed to configure pins as outputs (error: %d)\n", error);
        return;
    }
    
    Serial.println("✅ Configured all pins as outputs");
    
    // Set all outputs to LOW (relays OFF for active-high logic)
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(0x01); // Output register
    Wire.write(0x00); // All outputs LOW (relays OFF)
    error = Wire.endTransmission();
    
    if (error != 0) {
        Serial.printf("❌ Failed to set initial output states (error: %d)\n", error);
        return;
    }
    
    Serial.println("✅ Set all outputs to LOW");
    
    // Read back output register to verify
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(0x01); // Output register
    error = Wire.endTransmission();
    
    if (error == 0) {
        Wire.requestFrom(RELAY_I2C_ADDRESS, 1);
        if (Wire.available()) {
            byte outputVal = Wire.read();
            Serial.printf("Output register readback: 0x%02X\n", outputVal);
            if (outputVal == 0x00) {
                Serial.println("✅ Output register verified - all outputs are LOW");
            } else {
                Serial.printf("⚠️  Output register mismatch - expected 0x00, got 0x%02X\n", outputVal);
            }
        }
    }
    
    Serial.println("✅ TCA9554PWR initialized successfully - all relays OFF (active-high logic)");
    Serial.println("EXIO pin mapping: Relay 0=EXIO1, Relay 1=EXIO2, ..., Relay 7=EXIO8");
    Serial.println("💡 All relay LEDs should be OFF at boot - if not, check TCA9554PWR wiring/power");
}

void handleSerialConfiguration() {
    if (Serial.available()) {
        String configString = Serial.readStringUntil('\n');
        configString.trim();
        
        if (configString.length() > 0) {
            Serial.printf("Received configuration: %s\n", configString.c_str());
            
            // Parse JSON configuration
            StaticJsonDocument<2048> configDoc;
            DeserializationError error = deserializeJson(configDoc, configString);
            
            if (error) {
                Serial.printf("JSON parsing failed: %s\n", error.c_str());
                sendConfigResponse(false, "JSON parsing failed");
                return;
            }
            
            // Check if this is a configuration message
            const char* msgType = configDoc["type"];
            if (strcmp(msgType, "config") == 0) {
                JsonObject configData = configDoc["data"];
                if (configData) {
                    Serial.println("Applying configuration...");
                    applyConfiguration(configData);
                } else {
                    Serial.println("No configuration data found");
                    sendConfigResponse(false, "No configuration data");
                }
            } else {
                Serial.println("Unknown message type");
                sendConfigResponse(false, "Unknown message type");
            }
        }
    }
}

void applyConfiguration(JsonObject configData) {
    Serial.println("=== APPLYING CONFIGURATION ===");
    
    // Update device info
    if (configData.containsKey("device_id")) {
        strcpy(config.device_id, configData["device_id"]);
    }
    if (configData.containsKey("device_name")) {
        strcpy(config.device_name, configData["device_name"]);
    }
    if (configData.containsKey("wifi_ssid")) {
        strcpy(config.wifi_ssid, configData["wifi_ssid"]);
    }
    if (configData.containsKey("wifi_password")) {
        strcpy(config.wifi_password, configData["wifi_password"]);
    }
    if (configData.containsKey("server_host")) {
        strcpy(config.server_host, configData["server_host"]);
    }
    if (configData.containsKey("server_port")) {
        config.server_port = configData["server_port"];
    }
    
    config.configured = true;
    
    // Save configuration
    saveConfiguration();
    
    // Send success response
    sendConfigResponse(true, "Configuration applied successfully");
    
    // Reconnect with new settings
    Serial.println("Reconnecting with new configuration...");
    connectToWiFi();
    connectToWebSocket();
}

void sendConfigResponse(bool success, const char* message) {
    StaticJsonDocument<256> response;
    response["type"] = "config_response";
    response["success"] = success;
    response["message"] = message;
    
    String responseString;
    serializeJson(response, responseString);
    Serial.println(responseString);
}

void loadConfiguration() {
    EEPROM.get(0, config);
    
    if (config.magic != CONFIG_MAGIC || config.version != CONFIG_VERSION) {
        Serial.println("Invalid configuration, using defaults");
        resetToDefaults();
        return;
    }
    
    Serial.printf("Loaded configuration for %s (%s)\n", config.device_id, config.device_name);
}

void saveConfiguration() {
    EEPROM.put(0, config);
    EEPROM.commit();
    Serial.println("Configuration saved to EEPROM");
}

void resetToDefaults() {
    config.magic = CONFIG_MAGIC;
    config.version = CONFIG_VERSION;
    strcpy(config.device_id, "unconfigured");
    strcpy(config.device_name, "Unconfigured Relay");
    strcpy(config.wifi_ssid, "");
    strcpy(config.wifi_password, "");
    strcpy(config.server_host, "skytechautomated.com");
    config.server_port = 40000;
    config.configured = false;
    
    saveConfiguration();
}

void connectToWiFi() {
    if (strlen(config.wifi_ssid) == 0) {
        Serial.println("No WiFi SSID configured");
        return;
    }
    
    Serial.printf("Connecting to WiFi: %s\n", config.wifi_ssid);
    Serial.printf("WiFi password length: %d\n", strlen(config.wifi_password));
    WiFi.begin(config.wifi_ssid, config.wifi_password);
    
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
    
  if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.printf("WiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("MAC Address: %s\n", WiFi.macAddress().c_str());
        Serial.printf("Signal Strength: %d dBm\n", WiFi.RSSI());
  } else {
        Serial.println();
        Serial.println("WiFi connection failed");
        Serial.printf("WiFi status: %d\n", WiFi.status());
  }
}

void connectToWebSocket() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Cannot connect WebSocket - WiFi not connected");
        return;
    }
    Serial.println("Connecting to WebSocket server...");
    // Use configured server settings or defaults
    const char* host = (strlen(config.server_host) > 0) ? config.server_host : "skytechautomated.com";
    int port = (config.server_port > 0) ? config.server_port : 40000;
    // Create URL with MAC address as ID parameter
    String url = "/elevator?id=";
    url += WiFi.macAddress();
    Serial.printf("Connecting to %s:%d%s\n", host, port, url.c_str());
    webSocket.begin(host, port, url.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void readInputs() {
    for (int i = 0; i < 8; i++) {
        bool currentState = digitalRead(INPUT_PINS[i]) == LOW; // Active low
        inputStates[i] = currentState;
        lastInputStates[i] = currentState;
    }
}

bool updateRelays() {
    // Map relay 0-7 to EXIO 1-8 (no bit shifting needed, direct mapping)
    // Relay 0 = EXIO1, Relay 1 = EXIO2, etc.
    uint8_t exioStates = relayStates;
    
    Serial.printf("Setting EXIO states: 0x%02X (binary: ", exioStates);
    for (int i = 7; i >= 0; i--) {
        Serial.print((exioStates >> i) & 1);
    }
    Serial.println(")");
    
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(RELAY_REG_OUTPUT);
    Wire.write(exioStates); // Direct value - HIGH = relay ON (like working code)
    byte error = Wire.endTransmission();
    
    if (error == 0) {
        i2cError = false; // Clear error flag on successful communication
        
        // Read back the output register to verify
        Wire.beginTransmission(RELAY_I2C_ADDRESS);
        Wire.write(RELAY_REG_OUTPUT);
        error = Wire.endTransmission();
        
        if (error == 0) {
            Wire.requestFrom(RELAY_I2C_ADDRESS, 1);
            if (Wire.available()) {
                uint8_t readback = Wire.read();
                Serial.printf("EXIO output register readback: 0x%02X\n", readback);
            }
        }
        
        return true;
    } else {
        Serial.printf("❌ I2C Error setting relay states: %d\n", error);
        reportI2CError();
        return false;
    }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
    case WStype_DISCONNECTED:
        Serial.println("WebSocket disconnected");
      wsConnected = false;
      break;
    case WStype_CONNECTED:
        Serial.println("WebSocket connected");
      wsConnected = true;
        // Send registration message with MAC and IP (matching test relay connection)
      {
        StaticJsonDocument<256> regDoc;
            regDoc["type"] = "register";
        regDoc["device_id"] = config.device_id;
        regDoc["device_name"] = config.device_name;
            regDoc["mac"] = WiFi.macAddress();
            regDoc["ip"] = WiFi.localIP().toString();
            String regMessage;
            serializeJson(regDoc, regMessage);
            webSocket.sendTXT(regMessage);
            Serial.printf("Sent registration: MAC=%s, IP=%s\n", WiFi.macAddress().c_str(), WiFi.localIP().toString().c_str());
            Serial.printf("Device ID: %s, Device Name: %s\n", config.device_id, config.device_name);
            // Send full state immediately after registration
            sendFullState();
      }
      break;
    case WStype_TEXT:
        Serial.printf("Received message: %s\n", payload);
        handleWebSocketMessage(payload, length);
      break;
    case WStype_ERROR:
        Serial.println("WebSocket error");
      wsConnected = false;
      break;
  }
}

void handleWebSocketMessage(uint8_t * payload, size_t length) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.printf("JSON parsing failed: %s\n", error.c_str());
        sendErrorReport("JSON_PARSE_ERROR", "Failed to parse incoming message");
        return;
    }
    
    const char* msgType = doc["type"];
    
    if (strcmp(msgType, "relay_control") == 0) {
        int relayIndex = doc["relay"];
        bool state = doc["state"];
        
        if (relayIndex >= 0 && relayIndex < 8) {
            // Map relay 0-7 to EXIO 1-8 (direct mapping)
            int exioPin = relayIndex + 1;
            
            Serial.printf("🎛️  Relay control command: Relay %d (EXIO %d) -> %s\n", 
                        relayIndex, exioPin, state ? "ON" : "OFF");
            
            // Store expected state for verification
            if (state) {
                expectedRelayStates |= (1 << relayIndex);
            } else {
                expectedRelayStates &= ~(1 << relayIndex);
            }
            
            // Update relay state (keep internal mapping as 0-7 for state tracking)
            if (state) {
                relayStates |= (1 << relayIndex);
            } else {
                relayStates &= ~(1 << relayIndex);
            }
            
            Serial.printf("Updated relay states: 0x%02X (expected: 0x%02X)\n", 
                        relayStates, expectedRelayStates);
            
            // Attempt to update relays via I2C
            bool i2cSuccess = updateRelays();
            
            if (i2cSuccess) {
                Serial.printf("✅ Relay %d (EXIO %d) set to %s successfully\n", 
                            relayIndex, exioPin, state ? "ON" : "OFF");
                
                // Verify state was applied correctly
                bool stateVerified = verifyRelayState(relayIndex, state);
                
                // Send acknowledgment
                sendRelayControlAck(relayIndex, state, true, nullptr);
                
                // Send state verification
                if (wsConnected) {
                    StaticJsonDocument<256> verifyDoc;
                    verifyDoc["type"] = "relay_state_verified";
                    verifyDoc["relay"] = relayIndex;
                    verifyDoc["exio_pin"] = exioPin;
                    verifyDoc["expected_state"] = state;
                    verifyDoc["actual_state"] = stateVerified;
                    
                    String verifyMessage;
                    serializeJson(verifyDoc, verifyMessage);
                    webSocket.sendTXT(verifyMessage);
                }
                
                // Send full state immediately after relay change
                if (wsConnected) {
                    sendFullState();
                }
            } else {
                Serial.printf("❌ Failed to set relay %d (EXIO %d) to %s (I2C error)\n", 
                            relayIndex, exioPin, state ? "ON" : "OFF");
                
                // Send error acknowledgment
                sendRelayControlAck(relayIndex, state, false, "I2C communication failed");
                
                // Revert state change on failure
                relayStates = expectedRelayStates;
            }
        } else {
            Serial.printf("❌ Invalid relay index: %d\n", relayIndex);
            sendRelayControlAck(relayIndex, state, false, "Invalid relay index");
        }
    } else if (strcmp(msgType, "config") == 0) {
        applyConfiguration(doc["data"]);
    } else {
        Serial.printf("Unknown message type: %s\n", msgType);
        sendErrorReport("UNKNOWN_MESSAGE_TYPE", "Received unknown message type");
    }
}

void sendFullState() {
    // Send complete state of all inputs and relays
    StaticJsonDocument<512> stateDoc;
    stateDoc["type"] = "state";
  stateDoc["device_id"] = config.device_id;
    stateDoc["mac"] = WiFi.macAddress();
    stateDoc["ip"] = WiFi.localIP().toString();
    
    JsonArray inputs = stateDoc.createNestedArray("inputs");
    for (int i = 0; i < 8; i++) {
        inputs.add(inputStates[i]);
    }
    
    JsonArray relays = stateDoc.createNestedArray("relays");
    for (int i = 0; i < 8; i++) {
        relays.add((relayStates >> i) & 1);
    }
    
    String stateMessage;
    serializeJson(stateDoc, stateMessage);
    webSocket.sendTXT(stateMessage);
    
    Serial.println("Sent full state update");
}

void sendRelayControlAck(int relayIndex, bool state, bool success, const char* error) {
    StaticJsonDocument<256> ackDoc;
    ackDoc["type"] = "relay_control_ack";
    ackDoc["relay"] = relayIndex;
    ackDoc["state"] = state;
    ackDoc["success"] = success;
    if (error) {
        ackDoc["error"] = error;
    }
    
    String ackMessage;
    serializeJson(ackDoc, ackMessage);
    webSocket.sendTXT(ackMessage);
}

void sendErrorReport(const char* errorType, const char* message) {
    StaticJsonDocument<256> errorDoc;
    errorDoc["type"] = "error_report";
    errorDoc["error_type"] = errorType;
    errorDoc["message"] = message;
    
    String errorMessage;
    serializeJson(errorDoc, errorMessage);
    webSocket.sendTXT(errorMessage);
}

bool verifyRelayState(int relayIndex, bool expectedState) {
    return ((relayStates >> relayIndex) & 1) == expectedState;
}

void reportI2CError() {
    if (millis() - lastI2CError > I2C_ERROR_REPORT_INTERVAL) {
        i2cError = true;
        lastI2CError = millis();
        sendErrorReport("I2C_ERROR", "I2C communication error");
    }
}

void setRelayState(byte relayIndex, bool state) {
    if (relayIndex >= 8) {
        Serial.printf("❌ Invalid relay index: %d (must be 0-7)\n", relayIndex);
        return;
    }
    
    // Read current output register
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(0x01); // Output register
    byte error = Wire.endTransmission();
    
    if (error != 0) {
        Serial.printf("❌ Failed to read output register (error: %d)\n", error);
        return;
    }
    
    Wire.requestFrom(RELAY_I2C_ADDRESS, 1);
    if (!Wire.available()) {
        Serial.println("❌ No data received from I2C device");
        return;
    }
    
    byte currentOutputs = Wire.read();
    
    // Set the specific bit (HIGH = relay ON, LOW = relay OFF)
    if (state) {
        currentOutputs |= (1 << relayIndex);  // Set bit HIGH (relay ON)
    } else {
        currentOutputs &= ~(1 << relayIndex); // Clear bit LOW (relay OFF)
    }
    
    // Write back to output register
    Wire.beginTransmission(RELAY_I2C_ADDRESS);
    Wire.write(0x01); // Output register
    Wire.write(currentOutputs);
    error = Wire.endTransmission();
    
    if (error != 0) {
        Serial.printf("❌ Failed to set relay %d to %s (error: %d)\n", relayIndex, state ? "ON" : "OFF", error);
        return;
    }
    
    Serial.printf("✅ Relay %d set to %s (EXIO%d)\n", relayIndex, state ? "ON" : "OFF", relayIndex + 1);
} 
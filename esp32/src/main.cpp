#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "Skytech_Robots";
const char* password = "SkytechRobots123wtf!";

// Relay Configuration
const char* RELAY_ID = "Victorville1";
const char* RELAY_NAME = "Victorville Service Elevator";

// Relay pin mappings based on your board
// OI 1 = Channel 1 (Door Open)
// OI 2 = Channel 2 (Door Close) 
// OI 41 = Channel 3 (Floor 1)
// OI 42 = Channel 4 (Floor 2)
// OI 45 = Channel 5 (Floor 3)
// OI 46 = Channel 6 (Floor 4)
const int RELAY_PINS[] = {1, 2, 41, 42, 45, 46};
const int NUM_RELAYS = 6;

// Relay names for control
const char* RELAY_NAMES[] = {
    "doorOpen",
    "doorClose", 
    "floor1",
    "floor2",
    "floor3",
    "floor4"
};

// WebSocket server
WebSocketsServer webSocket = WebSocketsServer(8081);

// Function declarations
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
void sendRelayStates();
void setRelay(const char* relayName, bool state);
void testAllRelays();

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("=== ESP32-S3 Relay Controller ===");
    Serial.println("Relay ID: " + String(RELAY_ID));
    Serial.println("Relay Name: " + String(RELAY_NAME));
    Serial.println();
    
    // Initialize relay pins
    Serial.println("Initializing relay pins...");
    for (int i = 0; i < NUM_RELAYS; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], LOW); // Start with relays OFF (LOW = OFF for most relay boards)
        Serial.printf("Pin %d (GPIO%d): %s - OFF\n", i+1, RELAY_PINS[i], RELAY_NAMES[i]);
    }
    Serial.println();
    
    // Connect to WiFi
    Serial.println("Connecting to WiFi...");
    WiFi.begin(ssid, password);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi connected!");
        Serial.println("IP address: " + WiFi.localIP().toString());
    } else {
        Serial.println();
        Serial.println("WiFi connection failed!");
    }
    
    // Start WebSocket server
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("WebSocket server started on port 8081");
    Serial.println();
    Serial.println("Ready for relay control commands");
    Serial.println("=================================");
}

void loop() {
    webSocket.loop();
    delay(100);
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[%u] Disconnected!\n", num);
            break;
        case WStype_CONNECTED:
            {
                IPAddress ip = webSocket.remoteIP(num);
                Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
                
                // Send welcome message with relay states
                sendRelayStates();
            }
            break;
        case WStype_TEXT:
            {
                String message = String((char*)payload);
                Serial.printf("[%u] Received: %s\n", num, message.c_str());
                
                // Parse JSON message
                DynamicJsonDocument doc(512);
                DeserializationError error = deserializeJson(doc, message);
                
                if (error) {
                    Serial.print("JSON parse error: ");
                    Serial.println(error.c_str());
                    return;
                }
                
                // Handle relay control
                if (doc.containsKey("relay") && doc.containsKey("state")) {
                    const char* relay = doc["relay"];
                    bool state = doc["state"];
                    setRelay(relay, state);
                    
                    // Send updated states
                    sendRelayStates();
                }
                // Handle status request
                else if (doc.containsKey("command") && strcmp(doc["command"], "status") == 0) {
                    sendRelayStates();
                }
                // Handle test command
                else if (doc.containsKey("command") && strcmp(doc["command"], "test") == 0) {
                    Serial.println("Running relay test...");
                    testAllRelays();
                    sendRelayStates();
                }
            }
            break;
    }
}

void setRelay(const char* relayName, bool state) {
    // Find relay index
    int relayIndex = -1;
    for (int i = 0; i < NUM_RELAYS; i++) {
        if (strcmp(relayName, RELAY_NAMES[i]) == 0) {
            relayIndex = i;
            break;
        }
    }
    
    if (relayIndex >= 0) {
        int pin = RELAY_PINS[relayIndex];
        digitalWrite(pin, state); // HIGH = ON, LOW = OFF
        Serial.printf("Set %s (GPIO%d) to %s\n", relayName, pin, state ? "ON" : "OFF");
    } else {
        Serial.printf("Unknown relay: %s\n", relayName);
    }
}

void sendRelayStates() {
    DynamicJsonDocument doc(1024);
    doc["type"] = "relay_states";
    doc["relay_id"] = RELAY_ID;
    doc["relay_name"] = RELAY_NAME;
    doc["ip"] = WiFi.localIP().toString();
    
    JsonObject states = doc.createNestedObject("states");
    for (int i = 0; i < NUM_RELAYS; i++) {
        // HIGH = ON, LOW = OFF
        states[RELAY_NAMES[i]] = digitalRead(RELAY_PINS[i]);
    }
    
    String message;
    serializeJson(doc, message);
    webSocket.broadcastTXT(message);
    Serial.println("Sent relay states: " + message);
}

void testAllRelays() {
    Serial.println("Testing all relays...");
    
    // Test each relay for 1 second
    for (int i = 0; i < NUM_RELAYS; i++) {
        Serial.printf("Testing %s (GPIO%d)...\n", RELAY_NAMES[i], RELAY_PINS[i]);
        
        // Turn ON
        digitalWrite(RELAY_PINS[i], HIGH);
        delay(1000);
        
        // Turn OFF
        digitalWrite(RELAY_PINS[i], LOW);
        delay(500);
    }
    
    Serial.println("Relay test completed");
} 
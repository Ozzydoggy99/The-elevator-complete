#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "Skytech_Robots";
const char* password = "SkytechRobots123wtf!";

// WebSocket server port
const int webSocketPort = 8081;

// Test different GPIO pins that are known to work well on ESP32-S3
const int RELAY_PINS[] = {
    4,   // GPIO4 - Known to work well
    5,   // GPIO5 - Known to work well
    12,  // GPIO12 - Known to work well
    13,  // GPIO13 - Known to work well
    14,  // GPIO14 - Known to work well
    15   // GPIO15 - Known to work well
};
const int NUM_RELAYS = 6;

// Relay names for JSON communication
const char* RELAY_NAMES[] = {
    "doorOpen",
    "doorClose",
    "floor1",
    "floor2",
    "floor3",
    "floor4"
};

// WebSocket server
WebSocketsServer webSocket = WebSocketsServer(webSocketPort);

// JSON document for messages
StaticJsonDocument<512> doc;

// Function declarations
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
void sendRelayStates();
void testPin(int pinIndex);

void setup() {
    Serial.begin(115200);
    
    Serial.println("=== ESP32-S3 Relay Diagnostic ===");
    Serial.println("Testing different GPIO pins...");
    
    // Initialize relay pins with detailed logging
    for (int i = 0; i < NUM_RELAYS; i++) {
        Serial.printf("Setting up GPIO%d (Pin %d) for relay %s\n", RELAY_PINS[i], i, RELAY_NAMES[i]);
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH); // Relays are typically active LOW
        Serial.printf("GPIO%d initialized and set HIGH\n", RELAY_PINS[i]);
    }
    
    Serial.println("");
    Serial.println("Testing each pin individually...");
    
    // Test each pin individually
    for (int i = 0; i < NUM_RELAYS; i++) {
        testPin(i);
        delay(2000); // Wait 2 seconds between tests
    }
    
    Serial.println("");
    Serial.println("Pin tests completed. Starting WiFi...");
    
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
    } else {
        Serial.println("WiFi connection failed");
    }
    
    // Start WebSocket server
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("WebSocket server started");
}

void loop() {
    webSocket.loop();
}

void testPin(int pinIndex) {
    Serial.printf("Testing GPIO%d (%s)...\n", RELAY_PINS[pinIndex], RELAY_NAMES[pinIndex]);
    
    // Turn ON
    Serial.printf("  Setting GPIO%d LOW (should activate relay)\n", RELAY_PINS[pinIndex]);
    digitalWrite(RELAY_PINS[pinIndex], LOW);
    delay(1000);
    
    // Turn OFF
    Serial.printf("  Setting GPIO%d HIGH (should deactivate relay)\n", RELAY_PINS[pinIndex]);
    digitalWrite(RELAY_PINS[pinIndex], HIGH);
    delay(1000);
    
    Serial.printf("  GPIO%d test completed\n", RELAY_PINS[pinIndex]);
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
                        Serial.printf("Setting %s (GPIO%d) to %s\n", relay, RELAY_PINS[relayIndex], state ? "ON" : "OFF");
                        
                        // Set relay state (inverted because relays are typically active LOW)
                        digitalWrite(RELAY_PINS[relayIndex], !state);
                        
                        // Send updated states
                        sendRelayStates();
                    } else {
                        Serial.printf("Unknown relay: %s\n", relay);
                    }
                }
            }
            break;
    }
}

void sendRelayStates() {
    StaticJsonDocument<512> stateDoc;
    stateDoc["type"] = "relay_state";
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
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function programVictorvilleRelay() {
    console.log('🚀 Programming Victorville Service Elevator Relay (Simple Method)');
    console.log('===============================================================');
    
    const config = {
        relayId: 'Victorville1',
        relayName: 'Victorville Service Elevator',
        wifiSSID: 'Skytech_Robots',
        wifiPassword: 'SkytechRobots123wtf!',
        webSocketPort: 8080
    };

    console.log('📋 Configuration:');
    console.log(`   ID: ${config.relayId}`);
    console.log(`   Name: ${config.relayName}`);
    console.log(`   WiFi: ${config.wifiSSID}`);
    console.log(`   Port: ${config.webSocketPort}`);
    console.log('');

    try {
        // Step 1: Modify the elevator_controller.ino file
        console.log('📝 Step 1: Modifying elevator controller code...');
        await modifyElevatorCode(config);
        
        // Step 2: List available ports
        console.log('📋 Step 2: Available Ports:');
        await listPorts();
        
        // Step 3: Upload to ESP32
        console.log('📤 Step 3: Uploading to ESP32...');
        await uploadToESP32();
        
        console.log('');
        console.log('🎉 Programming completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Check the serial monitor for the ESP32 IP address');
        console.log('2. Test the relay connection');
        console.log('3. Register the relay in the system');
        
    } catch (error) {
        console.error('❌ Programming failed:', error.message);
        process.exit(1);
    }
}

async function modifyElevatorCode(config) {
    const templatePath = path.join(__dirname, 'elevator_controller.ino');
    const outputPath = path.join(__dirname, 'src', 'main.cpp');
    
    // Read the template
    let code = fs.readFileSync(templatePath, 'utf8');
    
    // Replace WiFi credentials
    code = code.replace(
        /const char\* ssid = "[^"]*";/,
        `const char* ssid = "${config.wifiSSID}";`
    );
    code = code.replace(
        /const char\* password = "[^"]*";/,
        `const char* password = "${config.wifiPassword}";`
    );
    
    // Replace WebSocket port
    code = code.replace(
        /const int webSocketPort = \d+;/,
        `const int webSocketPort = ${config.webSocketPort};`
    );
    
    // Add relay ID and name as comments
    code = code.replace(
        /\/\/ WiFi credentials/,
        `// Relay Configuration
// Relay ID: ${config.relayId}
// Relay Name: ${config.relayName}

// WiFi credentials`
    );
    
    // Write the modified code
    fs.writeFileSync(outputPath, code);
    console.log('✅ Modified elevator controller code');
}

async function listPorts() {
    try {
        const { stdout } = await execAsync('platformio device list');
        console.log(stdout);
    } catch (error) {
        console.error('❌ Error listing ports:', error.message);
    }
}

async function uploadToESP32() {
    try {
        const { stdout, stderr } = await execAsync('platformio run --target upload', {
            cwd: __dirname
        });
        
        if (stderr) {
            console.warn('⚠️  Upload warnings:', stderr);
        }
        
        console.log('✅ Upload completed successfully');
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        throw error;
    }
}

// Run the programming
programVictorvilleRelay(); 
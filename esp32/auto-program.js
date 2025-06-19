#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

// Configuration for Victorville elevator relay
const config = {
    relayType: 'elevator',
    relayId: 'Victorville1',
    relayName: 'Victorville Service Elevator',
    wifiSSID: 'Skytech Automated Solutions',
    wifiPassword: 'Skytech123wtf!',
    webSocketPort: 8080
};

async function autoProgram() {
    console.log('🤖 Auto-Programming ESP32 Relay');
    console.log('================================');
    console.log('');
    console.log('📋 Configuration:');
    console.log(`   Type: ${config.relayType}`);
    console.log(`   ID: ${config.relayId}`);
    console.log(`   Name: ${config.relayName}`);
    console.log(`   WiFi: ${config.wifiSSID}`);
    console.log(`   Port: ${config.webSocketPort}`);
    console.log('');

    try {
        // Step 1: Check prerequisites
        console.log('🔍 Checking prerequisites...');
        await checkPrerequisites();

        // Step 2: List available ports
        console.log('📋 Available Ports:');
        await listPorts();

        // Step 3: Program the relay
        console.log('🚀 Programming relay...');
        await programRelay();

        console.log('');
        console.log('🎉 Programming completed!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Check the ESP32 serial output for IP address');
        console.log('2. Test the relay connection');
        console.log('3. Register in the relay system');

    } catch (error) {
        console.error('❌ Programming failed:', error.message);
    }
}

async function checkPrerequisites() {
    return new Promise((resolve, reject) => {
        const pio = spawn('platformio', ['--version'], { stdio: 'pipe' });
        
        pio.on('close', (code) => {
            if (code === 0) {
                console.log('✅ PlatformIO is installed');
                resolve();
            } else {
                reject(new Error('PlatformIO is not installed'));
            }
        });
    });
}

async function listPorts() {
    return new Promise((resolve) => {
        const pio = spawn('platformio', ['device', 'list'], { stdio: 'pipe' });
        
        pio.stdout.on('data', (data) => {
            console.log(data.toString());
        });
        
        pio.on('close', () => {
            resolve();
        });
    });
}

async function programRelay() {
    return new Promise((resolve, reject) => {
        console.log('📡 Generating relay code...');
        
        // Use the program-relay.js with our config
        const program = spawn('node', ['program-relay.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, AUTO_PROGRAM: 'true' }
        });

        let output = '';
        program.stdout.on('data', (data) => {
            output += data.toString();
            console.log(data.toString());
        });

        program.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        program.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Code generation completed');
                resolve();
            } else {
                reject(new Error(`Programming failed with code ${code}`));
            }
        });

        // Send configuration to the program
        const configInput = JSON.stringify(config) + '\n';
        program.stdin.write(configInput);
        program.stdin.end();
    });
}

// Run the auto-programming
autoProgram().catch(console.error); 
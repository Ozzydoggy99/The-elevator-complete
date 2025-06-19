#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

class QuickStart {
    constructor() {
        this.programmer = require('./program-relay');
    }

    async start() {
        console.log('🚀 ESP32 Relay Quick Start');
        console.log('==========================');
        console.log('');

        try {
            // Step 1: Check prerequisites
            await this.checkPrerequisites();

            // Step 2: Get user configuration
            const config = await this.getUserConfiguration();

            // Step 3: List available ports
            await this.listPorts();

            // Step 4: Get port selection
            const port = await this.getPortSelection();

            // Step 5: Program the relay
            await this.programRelay(config, port);

            // Step 6: Verify programming
            await this.verifyProgramming(config, port);

            console.log('');
            console.log('🎉 Quick start completed successfully!');
            console.log('');
            console.log('Next steps:');
            console.log('1. Register this relay in the relay registration system');
            console.log('2. Associate it with robots and templates');
            console.log('3. Test the complete system');

        } catch (error) {
            console.error('❌ Quick start failed:', error.message);
            console.log('');
            console.log('Please check the troubleshooting guide in PROGRAMMING_GUIDE.md');
        } finally {
            rl.close();
        }
    }

    async checkPrerequisites() {
        console.log('🔍 Checking prerequisites...');

        // Check if PlatformIO is installed
        try {
            const { execSync } = require('child_process');
            execSync('platformio --version', { stdio: 'ignore' });
            console.log('✅ PlatformIO is installed');
        } catch (error) {
            throw new Error('PlatformIO is not installed. Please install PlatformIO IDE extension in VS Code.');
        }

        // Check if project files exist
        const requiredFiles = [
            'platformio.ini',
            'src/main.cpp',
            'program-relay.js'
        ];

        for (const file of requiredFiles) {
            if (!fs.existsSync(path.join(__dirname, file))) {
                throw new Error(`Required file missing: ${file}`);
            }
        }

        console.log('✅ All required files found');
        console.log('');
    }

    async getUserConfiguration() {
        console.log('📝 Relay Configuration');
        console.log('=====================');

        const config = {};

        // Get relay type
        config.relayType = await this.askQuestion(
            'What type of relay are you programming?\n' +
            '1. elevator - Elevator control (6 relays)\n' +
            '2. door - Door control (2 relays)\n' +
            '3. light - Light control (2 relays)\n' +
            '4. gate - Gate control (2 relays)\n' +
            'Enter choice (1-4): ',
            (answer) => {
                const choice = parseInt(answer);
                if (choice >= 1 && choice <= 4) {
                    const types = ['elevator', 'door', 'light', 'gate'];
                    return types[choice - 1];
                }
                throw new Error('Invalid choice. Please enter 1, 2, 3, or 4.');
            }
        );

        // Get relay ID
        config.relayId = await this.askQuestion(
            'Enter a unique relay ID (e.g., elevator-main-001): ',
            (answer) => {
                if (answer.trim().length > 0) {
                    return answer.trim();
                }
                throw new Error('Relay ID cannot be empty.');
            }
        );

        // Get relay name
        config.relayName = await this.askQuestion(
            'Enter a descriptive name (e.g., Main Building Elevator): ',
            (answer) => {
                if (answer.trim().length > 0) {
                    return answer.trim();
                }
                throw new Error('Relay name cannot be empty.');
            }
        );

        // Get WiFi credentials
        config.wifiSSID = await this.askQuestion(
            'Enter your WiFi SSID: ',
            (answer) => {
                if (answer.trim().length > 0) {
                    return answer.trim();
                }
                throw new Error('WiFi SSID cannot be empty.');
            }
        );

        config.wifiPassword = await this.askQuestion(
            'Enter your WiFi password: ',
            (answer) => {
                return answer.trim(); // Password can be empty for open networks
            }
        );

        // Get WebSocket port
        config.webSocketPort = await this.askQuestion(
            'Enter WebSocket port (default: 81): ',
            (answer) => {
                const port = parseInt(answer) || 81;
                if (port >= 1 && port <= 65535) {
                    return port;
                }
                throw new Error('Port must be between 1 and 65535.');
            }
        );

        // Set capabilities based on type
        config.capabilities = this.getCapabilitiesForType(config.relayType);

        console.log('');
        console.log('📋 Configuration Summary:');
        console.log(`   Type: ${config.relayType}`);
        console.log(`   ID: ${config.relayId}`);
        console.log(`   Name: ${config.relayName}`);
        console.log(`   WiFi: ${config.wifiSSID}`);
        console.log(`   Port: ${config.webSocketPort}`);
        console.log(`   Capabilities: ${config.capabilities.join(', ')}`);
        console.log('');

        return config;
    }

    getCapabilitiesForType(type) {
        const capabilities = {
            elevator: ['door_control', 'floor_selection', 'status_monitoring', 'emergency_stop'],
            door: ['door_control', 'status_monitoring'],
            light: ['light_control', 'status_monitoring'],
            gate: ['gate_control', 'status_monitoring']
        };
        return capabilities[type] || ['status_monitoring'];
    }

    async listPorts() {
        console.log('📋 Available Ports');
        console.log('==================');

        try {
            const { execSync } = require('child_process');
            const output = execSync('platformio device list', { encoding: 'utf8' });
            console.log(output);
        } catch (error) {
            console.log('⚠️  Could not list ports automatically.');
            console.log('Please check your device manager or run: platformio device list');
        }
    }

    async getPortSelection() {
        return await this.askQuestion(
            'Enter the COM port for your ESP32 (e.g., COM3, /dev/ttyUSB0): ',
            (answer) => {
                if (answer.trim().length > 0) {
                    return answer.trim();
                }
                throw new Error('Port cannot be empty.');
            }
        );
    }

    async programRelay(config, port) {
        console.log('');
        console.log('🚀 Programming Relay');
        console.log('===================');

        const programmer = new this.programmer();
        
        // Generate and write code
        console.log('📝 Generating relay code...');
        await programmer.writeRelayCode(config);

        // Build project
        console.log('🔨 Building project...');
        const buildSuccess = await programmer.buildProject();
        if (!buildSuccess) {
            throw new Error('Build failed. Check the error messages above.');
        }

        // Upload to ESP32
        console.log('📤 Uploading to ESP32...');
        const uploadSuccess = await programmer.uploadToESP32(port);
        if (!uploadSuccess) {
            throw new Error('Upload failed. Check the error messages above.');
        }

        console.log('✅ Programming completed successfully!');
    }

    async verifyProgramming(config, port) {
        console.log('');
        console.log('🔍 Verifying Programming');
        console.log('=======================');

        const verify = await this.askQuestion(
            'Would you like to monitor the relay to verify it\'s working? (y/n): ',
            (answer) => {
                return answer.toLowerCase().startsWith('y');
            }
        );

        if (verify) {
            console.log('');
            console.log('📺 Starting serial monitor...');
            console.log('Press Ctrl+C to stop monitoring');
            console.log('');
            console.log('Expected output:');
            console.log('- Relay ID and name');
            console.log('- WiFi connection status');
            console.log('- IP address');
            console.log('- WebSocket server started');
            console.log('');

            try {
                const programmer = new this.programmer();
                await programmer.monitorSerial(port);
            } catch (error) {
                console.log('⚠️  Monitoring stopped.');
            }
        }
    }

    askQuestion(question, validator) {
        return new Promise((resolve, reject) => {
            rl.question(question, (answer) => {
                try {
                    const result = validator(answer);
                    resolve(result);
                } catch (error) {
                    console.log(`❌ ${error.message}`);
                    rl.close();
                    reject(error);
                }
            });
        });
    }
}

// Run quick start if this file is executed directly
if (require.main === module) {
    const quickStart = new QuickStart();
    quickStart.start().catch(console.error);
}

module.exports = QuickStart; 
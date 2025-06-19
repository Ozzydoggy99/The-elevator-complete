const WebSocket = require('ws');

// Configuration
const RELAY_IP = '192.168.1.100'; // We'll need to find the actual IP
const RELAY_PORT = 8081;

// Test commands for each relay
const testCommands = [
    { relay: 'doorOpen', state: true, description: 'Door Open ON' },
    { relay: 'doorOpen', state: false, description: 'Door Open OFF' },
    { relay: 'doorClose', state: true, description: 'Door Close ON' },
    { relay: 'doorClose', state: false, description: 'Door Close OFF' },
    { relay: 'floor1', state: true, description: 'Floor 1 ON' },
    { relay: 'floor1', state: false, description: 'Floor 1 OFF' },
    { relay: 'floor2', state: true, description: 'Floor 2 ON' },
    { relay: 'floor2', state: false, description: 'Floor 2 OFF' },
    { relay: 'floor3', state: true, description: 'Floor 3 ON' },
    { relay: 'floor3', state: false, description: 'Floor 3 OFF' },
    { relay: 'floor4', state: true, description: 'Floor 4 ON' },
    { relay: 'floor4', state: false, description: 'Floor 4 OFF' }
];

function findRelayIP() {
    console.log('Scanning network for ESP32 relay...');
    
    // Common IP ranges to scan
    const ipRanges = [
        '192.168.1.',
        '192.168.0.',
        '10.0.0.',
        '172.16.0.'
    ];
    
    return new Promise((resolve) => {
        let foundIP = null;
        let checkedCount = 0;
        const totalChecks = ipRanges.length * 254;
        
        ipRanges.forEach(baseIP => {
            for (let i = 1; i <= 254; i++) {
                const testIP = baseIP + i;
                
                setTimeout(() => {
                    const ws = new WebSocket(`ws://${testIP}:8081`);
                    
                    ws.on('open', () => {
                        console.log(`Found relay at: ${testIP}`);
                        ws.close();
                        if (!foundIP) {
                            foundIP = testIP;
                            resolve(testIP);
                        }
                    });
                    
                    ws.on('error', () => {
                        // Connection failed, continue scanning
                    });
                    
                    checkedCount++;
                    if (checkedCount >= totalChecks && !foundIP) {
                        console.log('Relay not found automatically. Please provide IP manually.');
                        resolve(null);
                    }
                }, i * 10); // Small delay between attempts
            }
        });
    });
}

async function testRelay() {
    console.log('=== ESP32 Relay Test ===');
    
    // Try to find the relay IP automatically
    let relayIP = await findRelayIP();
    
    if (!relayIP) {
        // If auto-scan failed, ask for manual input
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        relayIP = await new Promise((resolve) => {
            rl.question('Please enter the relay IP address: ', (ip) => {
                rl.close();
                resolve(ip);
            });
        });
    }
    
    console.log(`Connecting to relay at: ${relayIP}:${RELAY_PORT}`);
    
    const ws = new WebSocket(`ws://${relayIP}:${RELAY_PORT}`);
    
    ws.on('open', () => {
        console.log('Connected to relay!');
        console.log('Starting relay tests...\n');
        
        // Get initial status
        ws.send(JSON.stringify({ command: 'status' }));
        
        // Run test sequence
        let commandIndex = 0;
        
        const sendNextCommand = () => {
            if (commandIndex >= testCommands.length) {
                console.log('\nAll tests completed!');
                ws.close();
                return;
            }
            
            const cmd = testCommands[commandIndex];
            const message = JSON.stringify({
                relay: cmd.relay,
                state: cmd.state
            });
            
            console.log(`Testing: ${cmd.description}`);
            ws.send(message);
            
            commandIndex++;
            
            // Wait 2 seconds before next command
            setTimeout(sendNextCommand, 2000);
        };
        
        // Start the test sequence after a short delay
        setTimeout(sendNextCommand, 1000);
    });
    
    ws.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());
            console.log('Relay response:', JSON.stringify(response, null, 2));
        } catch (e) {
            console.log('Raw response:', data.toString());
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
        console.log('Connection closed');
    });
}

// Run the test
testRelay().catch(console.error); 
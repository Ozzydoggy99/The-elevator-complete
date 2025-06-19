const { AutoXingRobot } = require('./robot-interface');
const ElevatorManager = require('./backend/core/ElevatorManager');
const { createElevatorWorkflow, calculateFloorTravelTime } = require('./backend/core/elevator-workflows');

// Configuration
const robotConfig = {
    serialNumber: 'L382502104987ir',
    publicIp: '47.180.91.99',
    localIp: '192.168.4.31',
    secret: '667a51a4d948433081a272c78d10a8a4'
};

const elevatorConfig = {
    ip: process.env.ESP32_IP || '192.168.1.200',
    port: process.env.ESP32_PORT || 81
};

// Test scenarios
const testScenarios = {
    // Test 1: Basic elevator operations
    basic_operations: async (elevatorManager) => {
        console.log('\n=== Test 1: Basic Elevator Operations ===');
        
        try {
            // Test door operations
            console.log('Testing door open...');
            await elevatorManager.openDoor();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('Testing door close...');
            await elevatorManager.closeDoor();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('✅ Basic door operations successful');
            return true;
        } catch (error) {
            console.error('❌ Basic door operations failed:', error.message);
            return false;
        }
    },

    // Test 2: Floor selection
    floor_selection: async (elevatorManager) => {
        console.log('\n=== Test 2: Floor Selection ===');
        
        try {
            const testFloors = [2, 3, 4, 1];
            
            for (const floor of testFloors) {
                console.log(`Testing floor selection: Floor ${floor}`);
                await elevatorManager.selectFloor(floor);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for relay pulse
                
                // Check if status was updated
                const status = elevatorManager.getStatus();
                console.log(`Current status: ${status.status}, Target floor: ${status.targetFloor}`);
            }
            
            console.log('✅ Floor selection successful');
            return true;
        } catch (error) {
            console.error('❌ Floor selection failed:', error.message);
            return false;
        }
    },

    // Test 3: Complete elevator movement
    complete_movement: async (elevatorManager) => {
        console.log('\n=== Test 3: Complete Elevator Movement ===');
        
        try {
            const fromFloor = 1;
            const toFloor = 3;
            
            console.log(`Moving from floor ${fromFloor} to floor ${toFloor}`);
            await elevatorManager.goToFloor(toFloor);
            
            console.log('✅ Complete elevator movement successful');
            return true;
        } catch (error) {
            console.error('❌ Complete elevator movement failed:', error.message);
            return false;
        }
    },

    // Test 4: Elevator workflow integration
    workflow_integration: async (elevatorManager) => {
        console.log('\n=== Test 4: Elevator Workflow Integration ===');
        
        try {
            // Create a simple elevator workflow
            const workflow = createElevatorWorkflow('elevator_move', {
                targetFloor: 2,
                floorTravelTime: calculateFloorTravelTime(1, 2)
            });
            
            console.log('Created elevator workflow:', workflow.name);
            console.log('Workflow steps:', workflow.steps.length);
            
            // Execute workflow steps manually
            for (const step of workflow.steps) {
                console.log(`Executing step: ${step.name}`);
                await elevatorManager.executeElevatorStep(step);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log('✅ Workflow integration successful');
            return true;
        } catch (error) {
            console.error('❌ Workflow integration failed:', error.message);
            return false;
        }
    },

    // Test 5: Robot integration (if robot is available)
    robot_integration: async (elevatorManager, robot) => {
        console.log('\n=== Test 5: Robot Integration ===');
        
        if (!robot) {
            console.log('⚠️  Robot not available, skipping robot integration test');
            return true;
        }
        
        try {
            const fromFloor = 1;
            const toFloor = 2;
            
            console.log(`Testing robot-elevator integration: Floor ${fromFloor} to ${toFloor}`);
            
            // Get floor coordinates
            const fromCoords = elevatorManager.getFloorCoordinates(fromFloor);
            const toCoords = elevatorManager.getFloorCoordinates(toFloor);
            
            if (!fromCoords || !toCoords) {
                throw new Error('Floor coordinates not found');
            }
            
            // Move robot to elevator approach
            console.log('Moving robot to elevator approach...');
            await robot.moveTo(fromCoords.approach);
            
            // Move robot to elevator entrance
            console.log('Moving robot to elevator entrance...');
            await robot.moveTo(fromCoords.entrance);
            
            // Use elevator with robot
            console.log('Using elevator with robot...');
            await elevatorManager.goToFloor(toFloor, robot);
            
            console.log('✅ Robot integration successful');
            return true;
        } catch (error) {
            console.error('❌ Robot integration failed:', error.message);
            return false;
        }
    },

    // Test 6: Error handling and recovery
    error_handling: async (elevatorManager) => {
        console.log('\n=== Test 6: Error Handling and Recovery ===');
        
        try {
            // Test invalid floor
            console.log('Testing invalid floor handling...');
            try {
                await elevatorManager.selectFloor(99);
                console.log('❌ Should have thrown error for invalid floor');
                return false;
            } catch (error) {
                console.log('✅ Correctly handled invalid floor error');
            }
            
            // Test disconnected state
            console.log('Testing disconnected state handling...');
            elevatorManager.connected = false;
            try {
                await elevatorManager.openDoor();
                console.log('❌ Should have thrown error for disconnected state');
                return false;
            } catch (error) {
                console.log('✅ Correctly handled disconnected state error');
            }
            
            // Restore connection
            elevatorManager.connected = true;
            
            console.log('✅ Error handling successful');
            return true;
        } catch (error) {
            console.error('❌ Error handling test failed:', error.message);
            return false;
        }
    }
};

// Main test function
async function runElevatorTests() {
    console.log('🚀 Starting Comprehensive Elevator Relay Tests');
    console.log('==============================================');
    
    let elevatorManager = null;
    let robot = null;
    const results = {};
    
    try {
        // Initialize elevator manager
        console.log('\n📡 Initializing Elevator Manager...');
        elevatorManager = new ElevatorManager(elevatorConfig);
        
        // Set up event listeners
        elevatorManager.on('connected', () => {
            console.log('✅ Elevator controller connected');
        });
        
        elevatorManager.on('disconnected', () => {
            console.log('❌ Elevator controller disconnected');
        });
        
        elevatorManager.on('error', (error) => {
            console.error('❌ Elevator error:', error);
        });
        
        elevatorManager.on('statusChanged', (status) => {
            console.log('📊 Elevator status changed:', status);
        });
        
        elevatorManager.on('floorReached', (floor) => {
            console.log(`🏢 Elevator reached floor ${floor}`);
        });
        
        // Connect to elevator
        console.log('🔌 Connecting to elevator controller...');
        const connected = await elevatorManager.connect();
        
        if (!connected) {
            console.error('❌ Failed to connect to elevator controller');
            return;
        }
        
        // Wait for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to initialize robot (optional)
        try {
            console.log('🤖 Initializing robot (optional)...');
            robot = new AutoXingRobot(robotConfig);
            await robot.connect();
            console.log('✅ Robot connected');
        } catch (error) {
            console.log('⚠️  Robot not available, continuing without robot tests');
        }
        
        // Run all test scenarios
        for (const [testName, testFunction] of Object.entries(testScenarios)) {
            console.log(`\n🧪 Running test: ${testName}`);
            try {
                results[testName] = await testFunction(elevatorManager, robot);
            } catch (error) {
                console.error(`❌ Test ${testName} failed with error:`, error);
                results[testName] = false;
            }
        }
        
        // Print results summary
        console.log('\n📋 Test Results Summary');
        console.log('======================');
        
        let passedTests = 0;
        let totalTests = Object.keys(results).length;
        
        for (const [testName, result] of Object.entries(results)) {
            const status = result ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${testName}`);
            if (result) passedTests++;
        }
        
        console.log(`\n🎯 Overall Result: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            console.log('🎉 All tests passed! Elevator relay system is fully functional.');
        } else {
            console.log('⚠️  Some tests failed. Check the logs above for details.');
        }
        
    } catch (error) {
        console.error('❌ Test suite failed:', error);
    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        
        if (elevatorManager) {
            elevatorManager.disconnect();
        }
        
        if (robot) {
            try {
                robot.disconnect();
            } catch (error) {
                console.log('⚠️  Error disconnecting robot:', error.message);
            }
        }
        
        console.log('✅ Cleanup complete');
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const testName = args[0];

if (testName && testScenarios[testName]) {
    // Run specific test
    console.log(`🧪 Running specific test: ${testName}`);
    runElevatorTests().then(() => {
        console.log('✅ Specific test completed');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Specific test failed:', error);
        process.exit(1);
    });
} else {
    // Run all tests
    runElevatorTests().then(() => {
        console.log('✅ All tests completed');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
} 
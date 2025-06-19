const RelayManager = require('./backend/core/RelayManager');

// Test relay registration and association system
class RelayRegistrationTester {
    constructor() {
        this.relayManager = new RelayManager();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Set up event listeners for monitoring
        this.relayManager.on('relayRegistered', (relay) => {
            console.log('✅ Relay registered:', relay.name);
        });

        this.relayManager.on('relayConnected', (relay) => {
            console.log('🔌 Relay connected:', relay.name);
        });

        this.relayManager.on('relayDisconnected', (relay) => {
            console.log('❌ Relay disconnected:', relay.name);
        });

        this.relayManager.on('relayRobotAssociationChanged', ({ relayId, robotId }) => {
            console.log('🤖 Relay-Robot association changed:', relayId, '->', robotId);
        });

        this.relayManager.on('relayTemplateAssociationChanged', ({ relayId, templateId }) => {
            console.log('📋 Relay-Template association changed:', relayId, '->', templateId);
        });

        this.relayManager.on('relayError', ({ relay, error }) => {
            console.error('❌ Relay error:', relay.name, error.message);
        });
    }

    async runTests() {
        console.log('🚀 Starting Relay Registration Tests');
        console.log('=====================================');

        try {
            // Test 1: Register relays
            await this.testRelayRegistration();

            // Test 2: Associate relays with robots
            await this.testRobotAssociations();

            // Test 3: Associate relays with templates
            await this.testTemplateAssociations();

            // Test 4: Test relay operations
            await this.testRelayOperations();

            // Test 5: Test relay management
            await this.testRelayManagement();

            // Test 6: Test statistics
            await this.testStatistics();

            console.log('\n🎉 All tests completed successfully!');

        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    }

    async testRelayRegistration() {
        console.log('\n=== Test 1: Relay Registration ===');

        // Register elevator relay
        const elevatorRelay = this.relayManager.registerRelay({
            id: 'elevator-main-001',
            name: 'Main Building Elevator',
            type: 'elevator',
            ip: '192.168.1.100',
            port: 81,
            description: 'Main building elevator with 4 floors',
            capabilities: ['door_control', 'floor_selection', 'status_monitoring', 'emergency_stop']
        });

        // Register door relay
        const doorRelay = this.relayManager.registerRelay({
            id: 'door-warehouse-001',
            name: 'Warehouse Door',
            type: 'door',
            ip: '192.168.1.101',
            port: 81,
            description: 'Warehouse entrance door',
            capabilities: ['door_control', 'status_monitoring']
        });

        // Register light relay
        const lightRelay = this.relayManager.registerRelay({
            id: 'light-parking-001',
            name: 'Parking Lot Lights',
            type: 'light',
            ip: '192.168.1.102',
            port: 81,
            description: 'Parking lot lighting system',
            capabilities: ['light_control', 'status_monitoring']
        });

        console.log('✅ Registered 3 relays successfully');
        console.log('   - Elevator relay:', elevatorRelay.name);
        console.log('   - Door relay:', doorRelay.name);
        console.log('   - Light relay:', lightRelay.name);
    }

    async testRobotAssociations() {
        console.log('\n=== Test 2: Robot Associations ===');

        // Associate relays with robots
        this.relayManager.associateRelayWithRobot('elevator-main-001', 'robot-alpha-001');
        this.relayManager.associateRelayWithRobot('door-warehouse-001', 'robot-alpha-001');
        this.relayManager.associateRelayWithRobot('light-parking-001', 'robot-beta-002');

        // Test getting relays for robots
        const robotAlphaRelays = this.relayManager.getRelaysForRobot('robot-alpha-001');
        const robotBetaRelays = this.relayManager.getRelaysForRobot('robot-beta-002');

        console.log('✅ Robot associations created:');
        console.log('   - Robot Alpha has', robotAlphaRelays.length, 'relays');
        console.log('   - Robot Beta has', robotBetaRelays.length, 'relays');

        // Test elevator-specific relays
        const elevatorRelays = this.relayManager.getElevatorRelaysForRobot('robot-alpha-001');
        console.log('   - Robot Alpha has', elevatorRelays.length, 'elevator relays');
    }

    async testTemplateAssociations() {
        console.log('\n=== Test 3: Template Associations ===');

        // Associate relays with templates
        this.relayManager.associateRelayWithTemplate('elevator-main-001', 'template-multi-floor');
        this.relayManager.associateRelayWithTemplate('door-warehouse-001', 'template-warehouse');
        this.relayManager.associateRelayWithTemplate('light-parking-001', 'template-parking');

        // Test getting relays for templates
        const multiFloorRelays = this.relayManager.getRelaysForTemplate('template-multi-floor');
        const warehouseRelays = this.relayManager.getRelaysForTemplate('template-warehouse');

        console.log('✅ Template associations created:');
        console.log('   - Multi-floor template has', multiFloorRelays.length, 'relays');
        console.log('   - Warehouse template has', warehouseRelays.length, 'relays');

        // Test elevator-specific relays for templates
        const elevatorRelays = this.relayManager.getElevatorRelaysForTemplate('template-multi-floor');
        console.log('   - Multi-floor template has', elevatorRelays.length, 'elevator relays');
    }

    async testRelayOperations() {
        console.log('\n=== Test 4: Relay Operations ===');

        try {
            // Test connecting to a relay (this would fail in test environment)
            console.log('Testing relay connection...');
            // await this.relayManager.connectToRelay('elevator-main-001');
            console.log('⚠️  Relay connection test skipped (no actual ESP32)');

            // Test relay status
            const status = this.relayManager.getRelayStatus('elevator-main-001');
            console.log('✅ Relay status retrieved:', status.name, '-', status.status);

            // Test relay action execution (would fail without connection)
            console.log('Testing relay action execution...');
            // await this.relayManager.executeRelayAction('robot-alpha-001', 'open_door');
            console.log('⚠️  Relay action test skipped (no actual connection)');

        } catch (error) {
            console.log('⚠️  Expected error in test environment:', error.message);
        }
    }

    async testRelayManagement() {
        console.log('\n=== Test 5: Relay Management ===');

        // Test updating relay
        const updatedRelay = this.relayManager.updateRelay('elevator-main-001', {
            description: 'Updated description for main building elevator'
        });
        console.log('✅ Relay updated:', updatedRelay.description);

        // Test getting all relays
        const allRelays = this.relayManager.getAllRelays();
        console.log('✅ Retrieved all relays:', allRelays.length, 'total');

        // Test removing a relay
        this.relayManager.removeRelay('light-parking-001');
        const remainingRelays = this.relayManager.getAllRelays();
        console.log('✅ Relay removed, remaining:', remainingRelays.length, 'relays');
    }

    async testStatistics() {
        console.log('\n=== Test 6: Statistics ===');

        const stats = this.relayManager.getRelayStatistics();
        console.log('✅ Relay statistics:');
        console.log('   - Total relays:', stats.total);
        console.log('   - Online:', stats.online);
        console.log('   - Offline:', stats.offline);
        console.log('   - Error:', stats.error);
        console.log('   - Type distribution:', stats.types);
    }

    // Demo function to show how to use the system
    async demonstrateUsage() {
        console.log('\n=== Usage Demonstration ===');

        // Example: Robot workflow with elevator
        console.log('🤖 Example: Robot workflow with elevator');
        
        const robotId = 'robot-alpha-001';
        const elevatorRelays = this.relayManager.getElevatorRelaysForRobot(robotId);
        
        if (elevatorRelays.length > 0) {
            console.log('   - Robot has elevator access');
            console.log('   - Available elevator:', elevatorRelays[0].name);
            
            // In a real scenario, you would:
            // 1. Connect to the elevator relay
            // 2. Execute elevator operations
            // 3. Coordinate with robot movements
        }

        // Example: Template-based relay access
        console.log('📋 Example: Template-based relay access');
        
        const templateId = 'template-multi-floor';
        const templateRelays = this.relayManager.getRelaysForTemplate(templateId);
        
        console.log('   - Template has access to', templateRelays.length, 'relays');
        templateRelays.forEach(relay => {
            console.log(`   - ${relay.name} (${relay.type})`);
        });
    }
}

// Run the tests
async function main() {
    const tester = new RelayRegistrationTester();
    
    // Run all tests
    await tester.runTests();
    
    // Demonstrate usage
    await tester.demonstrateUsage();
    
    console.log('\n🎯 Relay Registration System Test Complete!');
    console.log('\nKey Features Demonstrated:');
    console.log('✅ Relay registration with capabilities');
    console.log('✅ Robot-relay associations');
    console.log('✅ Template-relay associations');
    console.log('✅ Relay management operations');
    console.log('✅ Statistics and monitoring');
    console.log('✅ Type-specific relay filtering');
}

// Parse command line arguments
const args = process.argv.slice(2);
const testName = args[0];

if (testName === 'demo') {
    // Run just the demonstration
    const tester = new RelayRegistrationTester();
    tester.demonstrateUsage();
} else {
    // Run full test suite
    main().catch(console.error);
} 
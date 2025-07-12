const EventEmitter = require('events');
const ESP32ElevatorController = require('./ESP32ElevatorController');

class RelayManager extends EventEmitter {
    constructor() {
        super();
        this.relays = new Map(); // relayId -> relayInfo
        this.robotRelayAssociations = new Map(); // robotId -> [relayIds]
        this.templateRelayAssociations = new Map(); // templateId -> [relayIds]
        this.elevatorControllers = new Map(); // relayId -> ESP32ElevatorController
        this.buildingRelayGroups = new Map(); // buildingId -> [relayIds]
        this.relayTemplates = new Map(); // templateId -> relayTemplate
    }

    // Load relay templates from configuration
    async loadRelayTemplates() {
        try {
            const fs = require('fs');
            const path = require('path');
            const templatesPath = path.join(__dirname, '../data/relay-templates.json');
            
            // Check if file exists before trying to read it
            if (!fs.existsSync(templatesPath)) {
                console.log('Relay templates file not found, starting with empty templates');
                return;
            }
            
            const templatesData = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
            
            for (const [templateId, template] of Object.entries(templatesData)) {
                this.relayTemplates.set(templateId, template);
                console.log(`Loaded relay template: ${template.templateName} with ${template.relayConfigs.length} relays`);
            }
        } catch (error) {
            console.error('Error loading relay templates:', error);
            console.log('Continuing with empty relay templates');
        }
    }

    // Register multiple relays from a template
    async registerRelaysFromTemplate(templateId, buildingId, customizations = {}) {
        const template = this.relayTemplates.get(templateId);
        if (!template) {
            throw new Error(`Relay template ${templateId} not found`);
        }

        const registeredRelays = [];
        
        for (const relayConfig of template.relayConfigs) {
            const relayId = relayConfig.relayId;
            const customizedConfig = { ...relayConfig, ...customizations[relayId] };
            
            try {
                const relay = this.registerRelay({
                    id: relayId,
                    name: customizedConfig.relayName,
                    type: customizedConfig.relayType,
                    ip: customizedConfig.ipAddress,
                    port: customizedConfig.port || 81,
                    description: `Relay for ${customizedConfig.relayName}`,
                    capabilities: customizedConfig.capabilities || [],
                    buildingId: buildingId,
                    templateId: templateId,
                    channels: customizedConfig.channels,
                    inputPins: customizedConfig.inputPins
                });
                
                registeredRelays.push(relay);
                
                // Group relays by building
                if (!this.buildingRelayGroups.has(buildingId)) {
                    this.buildingRelayGroups.set(buildingId, []);
                }
                this.buildingRelayGroups.get(buildingId).push(relayId);
                
            } catch (error) {
                console.error(`Error registering relay ${relayId}:`, error);
            }
        }
        
        return registeredRelays;
    }

    // Register a new relay
    registerRelay(relayInfo) {
        const {
            id,
            name,
            type, // 'elevator', 'door', 'light', etc.
            ip,
            port = 81,
            description = '',
            capabilities = [], // ['door_control', 'floor_selection', etc.]
            robotId = null,
            templateId = null,
            buildingId = null,
            channels = {}, // 8-channel configuration
            inputPins = [] // 8 input pins
        } = relayInfo;

        if (this.relays.has(id)) {
            throw new Error(`Relay with ID ${id} already exists`);
        }

        const relay = {
            id,
            name,
            type,
            ip,
            port,
            description,
            capabilities,
            status: 'offline',
            lastSeen: null,
            robotId,
            templateId,
            buildingId,
            channels,
            inputPins,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.relays.set(id, relay);

        // Associate with robot if specified
        if (robotId) {
            this.associateRelayWithRobot(id, robotId);
        }

        // Associate with template if specified
        if (templateId) {
            this.associateRelayWithTemplate(id, templateId);
        }

        this.emit('relayRegistered', relay);
        return relay;
    }

    // Associate relay with a robot
    associateRelayWithRobot(relayId, robotId) {
        if (!this.relays.has(relayId)) {
            throw new Error(`Relay ${relayId} not found`);
        }

        // Remove from previous robot association
        for (const [existingRobotId, relayIds] of this.robotRelayAssociations.entries()) {
            const index = relayIds.indexOf(relayId);
            if (index > -1) {
                relayIds.splice(index, 1);
                if (relayIds.length === 0) {
                    this.robotRelayAssociations.delete(existingRobotId);
                }
            }
        }

        // Add to new robot association
        if (!this.robotRelayAssociations.has(robotId)) {
            this.robotRelayAssociations.set(robotId, []);
        }
        this.robotRelayAssociations.get(robotId).push(relayId);

        // Update relay info
        const relay = this.relays.get(relayId);
        relay.robotId = robotId;
        relay.updatedAt = new Date();

        this.emit('relayRobotAssociationChanged', { relayId, robotId });
    }

    // Associate relay with a template
    associateRelayWithTemplate(relayId, templateId) {
        if (!this.relays.has(relayId)) {
            throw new Error(`Relay ${relayId} not found`);
        }

        // Remove from previous template association
        for (const [existingTemplateId, relayIds] of this.templateRelayAssociations.entries()) {
            const index = relayIds.indexOf(relayId);
            if (index > -1) {
                relayIds.splice(index, 1);
                if (relayIds.length === 0) {
                    this.templateRelayAssociations.delete(existingTemplateId);
                }
            }
        }

        // Add to new template association
        if (!this.templateRelayAssociations.has(templateId)) {
            this.templateRelayAssociations.set(templateId, []);
        }
        this.templateRelayAssociations.get(templateId).push(relayId);

        // Update relay info
        const relay = this.relays.get(relayId);
        relay.templateId = templateId;
        relay.updatedAt = new Date();

        this.emit('relayTemplateAssociationChanged', { relayId, templateId });
    }

    // Get relays for a specific robot
    getRelaysForRobot(robotId) {
        const relayIds = this.robotRelayAssociations.get(robotId) || [];
        return relayIds.map(id => this.relays.get(id)).filter(Boolean);
    }

    // Get relays for a specific template
    getRelaysForTemplate(templateId) {
        const relayIds = this.templateRelayAssociations.get(templateId) || [];
        return relayIds.map(id => this.relays.get(id)).filter(Boolean);
    }

    // Get relays for a specific building
    getRelaysForBuilding(buildingId) {
        const relayIds = this.buildingRelayGroups.get(buildingId) || [];
        return relayIds.map(id => this.relays.get(id)).filter(Boolean);
    }

    // Get elevator relays for a robot/template/building
    getElevatorRelaysForRobot(robotId) {
        return this.getRelaysForRobot(robotId).filter(relay => relay.type === 'elevator');
    }

    getElevatorRelaysForTemplate(templateId) {
        return this.getRelaysForTemplate(templateId).filter(relay => relay.type === 'elevator');
    }

    getElevatorRelaysForBuilding(buildingId) {
        return this.getRelaysForBuilding(buildingId).filter(relay => relay.type === 'elevator');
    }

    // Connect to a relay
    async connectToRelay(relayId) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            throw new Error(`Relay ${relayId} not found`);
        }

        // Only connect if relay has an IP address
        if (!relay.ip) {
            console.log(`Relay ${relayId} (${relay.name}) has no IP address yet. Waiting for it to connect first.`);
            return null;
        }

        if (relay.type === 'elevator') {
            const controller = new ESP32ElevatorController({
                ip: relay.ip,
                port: relay.port,
                relayId: relay.id,
                channels: relay.channels,
                inputPins: relay.inputPins
            });

            // Set up event listeners
            controller.on('connected', () => {
                relay.status = 'online';
                relay.lastSeen = new Date();
                this.emit('relayConnected', relay);
            });

            controller.on('disconnected', () => {
                relay.status = 'offline';
                this.emit('relayDisconnected', relay);
            });

            controller.on('error', (error) => {
                relay.status = 'error';
                this.emit('relayError', { relay, error });
            });

            controller.on('inputChanged', (inputData) => {
                this.emit('relayInputChanged', { relay, inputData });
            });

            this.elevatorControllers.set(relayId, controller);
            await controller.connect();
            return controller;
        }

        throw new Error(`Unsupported relay type: ${relay.type}`);
    }

    // Connect to relay when IP becomes available
    async connectToRelayWhenIPAvailable(relayId, ipAddress) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            console.log(`Relay ${relayId} not found in RelayManager`);
            return null;
        }

        // Update IP address
        relay.ip = ipAddress;
        
        // Try to connect now that we have the IP
        console.log(`Attempting to connect to relay ${relayId} at ${ipAddress}:${relay.port}`);
        return await this.connectToRelay(relayId);
    }

    // Disconnect from a relay
    disconnectFromRelay(relayId) {
        const controller = this.elevatorControllers.get(relayId);
        if (controller) {
            controller.disconnect();
            this.elevatorControllers.delete(relayId);
        }

        const relay = this.relays.get(relayId);
        if (relay) {
            relay.status = 'offline';
            this.emit('relayDisconnected', relay);
        }
    }

    // Execute relay action for a specific robot
    async executeRelayAction(robotId, action, params = {}) {
        const elevatorRelays = this.getElevatorRelaysForRobot(robotId);
        
        for (const relay of elevatorRelays) {
            try {
                const controller = this.elevatorControllers.get(relay.id);
                if (!controller) {
                    // Try to connect if we have an IP address
                    if (relay.ip) {
                        await this.connectToRelay(relay.id);
                    } else {
                        console.log(`Relay ${relay.id} (${relay.name}) not connected and no IP available. Skipping action.`);
                        continue;
                    }
                }
                
                const activeController = this.elevatorControllers.get(relay.id);
                if (activeController) {
                    await activeController.executeAction(action, params);
                }
            } catch (error) {
                console.error(`Error executing action ${action} on relay ${relay.id}:`, error);
            }
        }
    }

    // Execute relay action for a specific building
    async executeRelayActionForBuilding(buildingId, action, params = {}) {
        const elevatorRelays = this.getElevatorRelaysForBuilding(buildingId);
        
        for (const relay of elevatorRelays) {
            try {
                const controller = this.elevatorControllers.get(relay.id);
                if (!controller) {
                    // Try to connect if we have an IP address
                    if (relay.ip) {
                        await this.connectToRelay(relay.id);
                    } else {
                        console.log(`Relay ${relay.id} (${relay.name}) not connected and no IP available. Skipping action.`);
                        continue;
                    }
                }
                
                const activeController = this.elevatorControllers.get(relay.id);
                if (activeController) {
                    await activeController.executeAction(action, params);
                }
            } catch (error) {
                console.error(`Error executing action ${action} on relay ${relay.id}:`, error);
            }
        }
    }

    // Get relay status
    getRelayStatus(relayId) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            return null;
        }

        const controller = this.elevatorControllers.get(relayId);
        return {
            ...relay,
            controllerConnected: !!controller,
            controllerStatus: controller ? controller.getStatus() : null
        };
    }

    // Get all relays
    getAllRelays() {
        return Array.from(this.relays.values());
    }

    // Remove relay
    removeRelay(relayId) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            throw new Error(`Relay ${relayId} not found`);
        }

        // Disconnect controller
        this.disconnectFromRelay(relayId);

        // Remove from associations
        this.associateRelayWithRobot(relayId, null);
        this.associateRelayWithTemplate(relayId, null);

        // Remove from building group
        if (relay.buildingId) {
            const buildingRelays = this.buildingRelayGroups.get(relay.buildingId);
            if (buildingRelays) {
                const index = buildingRelays.indexOf(relayId);
                if (index > -1) {
                    buildingRelays.splice(index, 1);
                    if (buildingRelays.length === 0) {
                        this.buildingRelayGroups.delete(relay.buildingId);
                    }
                }
            }
        }

        // Remove relay
        this.relays.delete(relayId);
        this.emit('relayRemoved', relay);
    }

    // Update relay
    updateRelay(relayId, updates) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            throw new Error(`Relay ${relayId} not found`);
        }

        Object.assign(relay, updates, { updatedAt: new Date() });
        this.emit('relayUpdated', relay);
        return relay;
    }

    // Get relay statistics
    getRelayStatistics() {
        const totalRelays = this.relays.size;
        const onlineRelays = Array.from(this.relays.values()).filter(r => r.status === 'online').length;
        const offlineRelays = Array.from(this.relays.values()).filter(r => r.status === 'offline').length;
        const errorRelays = Array.from(this.relays.values()).filter(r => r.status === 'error').length;

        return {
            total: totalRelays,
            online: onlineRelays,
            offline: offlineRelays,
            error: errorRelays,
            onlinePercentage: totalRelays > 0 ? (onlineRelays / totalRelays * 100).toFixed(2) : 0
        };
    }

    // Get relay type distribution
    getRelayTypeDistribution() {
        const distribution = {};
        for (const relay of this.relays.values()) {
            distribution[relay.type] = (distribution[relay.type] || 0) + 1;
        }
        return distribution;
    }

    // Get building relay statistics
    getBuildingRelayStatistics() {
        const buildingStats = {};
        for (const [buildingId, relayIds] of this.buildingRelayGroups.entries()) {
            const relays = relayIds.map(id => this.relays.get(id)).filter(Boolean);
            const onlineCount = relays.filter(r => r.status === 'online').length;
            buildingStats[buildingId] = {
                totalRelays: relays.length,
                onlineRelays: onlineCount,
                offlineRelays: relays.length - onlineCount,
                onlinePercentage: relays.length > 0 ? (onlineCount / relays.length * 100).toFixed(2) : 0
            };
        }
        return buildingStats;
    }

    // Initialize relay manager
    async initialize() {
        await this.loadRelayTemplates();
        await this.loadRelaysFromDatabase();
        console.log(`RelayManager initialized with ${this.relayTemplates.size} templates`);
    }

    // Load relays from database
    async loadRelaysFromDatabase() {
        try {
            const db = require('../db');
            const result = await db.query(`
                SELECT id, name, type, ip_address as ip, 
                       COALESCE(port, 81) as port, 
                       mac_address, status, last_seen,
                       created_at, updated_at
                FROM relays 
                WHERE status != 'deleted'
            `);
            
            for (const row of result.rows) {
                // Convert database row to relay object
                const relay = {
                    id: row.id,
                    name: row.name,
                    type: row.type || 'elevator',
                    ip: row.ip, // This might be null initially
                    port: row.port,
                    macAddress: row.mac_address,
                    status: row.status || 'offline',
                    lastSeen: row.last_seen,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    capabilities: [], // Default capabilities
                    channels: {}, // Default channel config
                    inputPins: [] // Default input pins
                };
                
                this.relays.set(relay.id, relay);
                console.log(`Loaded relay from database: ${relay.name} (${relay.id}) - IP: ${relay.ip || 'Not connected yet'}`);
            }
            
            console.log(`Loaded ${result.rows.length} relays from database (will connect when they register)`);
        } catch (err) {
            console.error('Error loading relays from database:', err);
        }
    }

    // Update relay IP address
    async updateRelayIP(relayId, ipAddress) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            throw new Error(`Relay ${relayId} not found`);
        }
        
        relay.ip = ipAddress;
        relay.updatedAt = new Date();
        
        // Update database
        try {
            const db = require('../db');
            await db.query(`
                UPDATE relays 
                SET ip_address = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [ipAddress, relayId]);
            console.log(`Updated relay ${relayId} IP address to ${ipAddress}`);
        } catch (err) {
            console.error(`Error updating relay IP address in database for ${relayId}:`, err);
        }
        
        this.emit('relayUpdated', relay);
        return relay;
    }

    // Find relay by MAC address
    findRelayByMAC(macAddress) {
        for (const relay of this.relays.values()) {
            if (relay.macAddress === macAddress) {
                return relay;
            }
        }
        return null;
    }
}

module.exports = RelayManager; 
 
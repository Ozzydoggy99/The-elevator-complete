const EventEmitter = require('events');

class RelayManager extends EventEmitter {
    constructor() {
        super();
        this.relays = new Map(); // relayId -> relayInfo
        this.robotRelayAssociations = new Map(); // robotId -> [relayIds]
        this.templateRelayAssociations = new Map(); // templateId -> [relayIds]
        this.elevatorControllers = new Map(); // relayId -> ESP32ElevatorController
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
            templateId = null
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

    // Get elevator relays for a robot/template
    getElevatorRelaysForRobot(robotId) {
        return this.getRelaysForRobot(robotId).filter(relay => relay.type === 'elevator');
    }

    getElevatorRelaysForTemplate(templateId) {
        return this.getRelaysForTemplate(templateId).filter(relay => relay.type === 'elevator');
    }

    // Connect to a relay
    async connectToRelay(relayId) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            throw new Error(`Relay ${relayId} not found`);
        }

        if (relay.type === 'elevator') {
            const ESP32ElevatorController = require('./ESP32ElevatorController');
            const controller = new ESP32ElevatorController({
                ip: relay.ip,
                port: relay.port
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

            this.elevatorControllers.set(relayId, controller);
            await controller.connect();
            return controller;
        }

        throw new Error(`Unsupported relay type: ${relay.type}`);
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
        const relays = this.getRelaysForRobot(robotId);
        
        for (const relay of relays) {
            if (relay.type === 'elevator' && relay.capabilities.includes(action)) {
                const controller = this.elevatorControllers.get(relay.id);
                if (controller && controller.connected) {
                    try {
                        switch (action) {
                            case 'open_door':
                                await controller.openDoor();
                                break;
                            case 'close_door':
                                await controller.closeDoor();
                                break;
                            case 'select_floor':
                                await controller.selectFloor(params.floor);
                                break;
                            case 'go_to_floor':
                                await controller.goToFloor(params.floor, params.robotController);
                                break;
                            default:
                                throw new Error(`Unknown elevator action: ${action}`);
                        }
                        return { success: true, relayId: relay.id };
                    } catch (error) {
                        this.emit('relayActionError', { relay, action, error });
                        throw error;
                    }
                }
            }
        }
        
        throw new Error(`No suitable relay found for action: ${action}`);
    }

    // Get relay status
    getRelayStatus(relayId) {
        const relay = this.relays.get(relayId);
        if (!relay) {
            return null;
        }

        const controller = this.elevatorControllers.get(relayId);
        const controllerStatus = controller ? controller.getStatus() : null;

        return {
            ...relay,
            controllerStatus
        };
    }

    // Get all relays
    getAllRelays() {
        return Array.from(this.relays.values());
    }

    // Remove relay
    removeRelay(relayId) {
        this.disconnectFromRelay(relayId);
        
        // Remove from associations
        for (const [robotId, relayIds] of this.robotRelayAssociations.entries()) {
            const index = relayIds.indexOf(relayId);
            if (index > -1) {
                relayIds.splice(index, 1);
                if (relayIds.length === 0) {
                    this.robotRelayAssociations.delete(robotId);
                }
            }
        }

        for (const [templateId, relayIds] of this.templateRelayAssociations.entries()) {
            const index = relayIds.indexOf(relayId);
            if (index > -1) {
                relayIds.splice(index, 1);
                if (relayIds.length === 0) {
                    this.templateRelayAssociations.delete(templateId);
                }
            }
        }

        this.relays.delete(relayId);
        this.emit('relayRemoved', relayId);
    }

    // Update relay configuration
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
        const total = this.relays.size;
        const online = Array.from(this.relays.values()).filter(r => r.status === 'online').length;
        const offline = Array.from(this.relays.values()).filter(r => r.status === 'offline').length;
        const error = Array.from(this.relays.values()).filter(r => r.status === 'error').length;

        return {
            total,
            online,
            offline,
            error,
            types: this.getRelayTypeDistribution()
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
}

module.exports = RelayManager; 
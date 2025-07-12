const WebSocket = require('ws');
const EventEmitter = require('events');

class ESP32ElevatorController extends EventEmitter {
    constructor(config) {
        super();
        this.config = {
            ip: config.ip,
            port: config.port || 81,
            relayId: config.relayId,
            channels: config.channels || {},
            inputPins: config.inputPins || [],
            reconnectInterval: 5000,
            heartbeatInterval: 30000,
            commandTimeout: 10000
        };
        
        this.ws = null;
        this.connected = false;
        this.lastHeartbeat = 0;
        this.pendingCommands = new Map();
        this.commandId = 0;
        this.relayStates = new Map();
        this.inputStates = new Map();
        
        // Initialize channel states
        for (let i = 0; i < 8; i++) {
            this.relayStates.set(i, false);
            this.inputStates.set(i, false);
        }
        
        // Parse channel configuration
        this.parseChannelConfig();
    }

    parseChannelConfig() {
        this.channelFunctions = new Map();
        this.functionChannels = new Map();
        
        for (const [channelKey, channelConfig] of Object.entries(this.config.channels)) {
            const channelIndex = parseInt(channelKey.replace('channel', ''));
            const functionName = channelConfig.function;
            
            this.channelFunctions.set(channelIndex, {
                function: functionName,
                enabled: channelConfig.enabled,
                safetyRequired: channelConfig.safetyRequired,
                inputPin: channelConfig.inputPin
            });
            
            this.functionChannels.set(functionName, channelIndex);
        }
        
        console.log(`Parsed ${this.channelFunctions.size} channels for relay ${this.config.relayId}`);
    }

    async connect() {
        return new Promise((resolve, reject) => {
            // Validate IP address
            if (!this.config.ip) {
                const error = new Error(`No IP address configured for relay ${this.config.relayId}`);
                console.error(error.message);
                reject(error);
                return;
            }
            
            const wsUrl = `ws://${this.config.ip}:${this.config.port}`;
            console.log(`Connecting to ESP32 relay at ${wsUrl}`);
            
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log(`Connected to ESP32 relay ${this.config.relayId}`);
                this.connected = true;
                this.lastHeartbeat = Date.now();
                this.emit('connected');
                resolve();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', () => {
                console.log(`Disconnected from ESP32 relay ${this.config.relayId}`);
                this.connected = false;
                this.emit('disconnected');
                this.scheduleReconnect();
            });

            this.ws.on('error', (error) => {
                console.error(`WebSocket error for relay ${this.config.relayId}:`, error);
                this.emit('error', error);
                reject(error);
            });
            
            // Set connection timeout
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error(`Connection timeout for relay ${this.config.relayId}`));
                }
            }, this.config.commandTimeout);
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
                this.connected = false;
    }

    scheduleReconnect() {
        if (this.ws) return; // Already trying to reconnect
        
        setTimeout(() => {
            if (!this.connected) {
                console.log(`Attempting to reconnect to relay ${this.config.relayId}`);
                this.connect().catch(error => {
                    console.error(`Reconnection failed for relay ${this.config.relayId}:`, error);
                });
            }
        }, this.config.reconnectInterval);
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            console.log(`Received message from relay ${this.config.relayId}:`, message);
            
            switch (message.type) {
                case 'full_state':
                    this.handleStateUpdate(message);
                    break;
                case 'input_changed':
                    this.handleInputChange(message);
                    break;
                case 'command_response':
                    this.handleCommandResponse(message);
                    break;
                case 'heartbeat':
                    this.lastHeartbeat = Date.now();
                    break;
                default:
                    console.log(`Unknown message type from relay ${this.config.relayId}:`, message.type);
            }
        } catch (error) {
            console.error(`Error parsing message from relay ${this.config.relayId}:`, error);
        }
    }

    handleStateUpdate(message) {
        // Update relay states
        if (message.relays && Array.isArray(message.relays)) {
            for (let i = 0; i < Math.min(message.relays.length, 8); i++) {
                this.relayStates.set(i, message.relays[i] === 1);
            }
        }
        
        // Update input states
        if (message.inputs && Array.isArray(message.inputs)) {
            for (let i = 0; i < Math.min(message.inputs.length, 8); i++) {
                this.inputStates.set(i, message.inputs[i] === 1);
            }
        }
        
        this.emit('stateUpdated', {
            relayStates: Object.fromEntries(this.relayStates),
            inputStates: Object.fromEntries(this.inputStates)
        });
    }

    handleInputChange(message) {
        if (message.inputIndex !== undefined && message.state !== undefined) {
            this.inputStates.set(message.inputIndex, message.state);
            
            this.emit('inputChanged', {
                inputIndex: message.inputIndex,
                state: message.state,
                function: this.getFunctionForInput(message.inputIndex)
            });
        }
    }

    handleCommandResponse(message) {
        const commandId = message.commandId;
        const pendingCommand = this.pendingCommands.get(commandId);
        
        if (pendingCommand) {
            this.pendingCommands.delete(commandId);
            
            if (message.success) {
                pendingCommand.resolve(message.result);
            } else {
                pendingCommand.reject(new Error(message.error || 'Command failed'));
            }
        }
    }

    getFunctionForInput(inputIndex) {
        for (const [channelIndex, config] of this.channelFunctions.entries()) {
            if (config.inputPin === inputIndex) {
                return config.function;
        }
        }
        return null;
    }

    async sendCommand(command, params = {}) {
        if (!this.connected) {
            throw new Error(`Relay ${this.config.relayId} is not connected`);
        }

        const commandId = ++this.commandId;
        const message = {
            type: 'command',
            commandId: commandId,
            command: command,
            params: params
        };
        
        return new Promise((resolve, reject) => {
            // Set command timeout
            const timeout = setTimeout(() => {
                this.pendingCommands.delete(commandId);
                reject(new Error(`Command timeout: ${command}`));
            }, this.config.commandTimeout);
            
            this.pendingCommands.set(commandId, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            
            this.ws.send(JSON.stringify(message));
        });
    }

    // Elevator control methods
    async selectFloor(floor) {
        const functionName = `floor_${floor}`;
        const channelIndex = this.functionChannels.get(functionName);
        
        if (channelIndex === undefined) {
            throw new Error(`Floor ${floor} not configured for relay ${this.config.relayId}`);
        }
        
        const channelConfig = this.channelFunctions.get(channelIndex);
        if (!channelConfig.enabled) {
            throw new Error(`Floor ${floor} channel is disabled on relay ${this.config.relayId}`);
        }
        
        console.log(`Selecting floor ${floor} on relay ${this.config.relayId} (channel ${channelIndex})`);
        return this.sendCommand('set_relay', {
            relay: functionName,
            state: true
        });
    }

    async openDoor() {
        const channelIndex = this.functionChannels.get('door_open');
        
        if (channelIndex === undefined) {
            throw new Error(`Door open not configured for relay ${this.config.relayId}`);
        }
        
        const channelConfig = this.channelFunctions.get(channelIndex);
        if (!channelConfig.enabled) {
            throw new Error(`Door open channel is disabled on relay ${this.config.relayId}`);
        }
        
        console.log(`Opening door on relay ${this.config.relayId} (channel ${channelIndex})`);
        return this.sendCommand('set_relay', {
            relay: 'door_open',
            state: true
        });
    }

    async closeDoor() {
        const channelIndex = this.functionChannels.get('door_close');
        
        if (channelIndex === undefined) {
            throw new Error(`Door close not configured for relay ${this.config.relayId}`);
        }
        
        const channelConfig = this.channelFunctions.get(channelIndex);
        if (!channelConfig.enabled) {
            throw new Error(`Door close channel is disabled on relay ${this.config.relayId}`);
        }
        
        console.log(`Closing door on relay ${this.config.relayId} (channel ${channelIndex})`);
        return this.sendCommand('set_relay', {
            relay: 'door_close',
            state: true
        });
    }

    async hallCall() {
        const channelIndex = this.functionChannels.get('hall_call');
        
        if (channelIndex === undefined) {
            throw new Error(`Hall call not configured for relay ${this.config.relayId}`);
        }
        
        const channelConfig = this.channelFunctions.get(channelIndex);
        if (!channelConfig.enabled) {
            throw new Error(`Hall call channel is disabled on relay ${this.config.relayId}`);
        }

        console.log(`Sending hall call on relay ${this.config.relayId} (channel ${channelIndex})`);
        return this.sendCommand('set_relay', {
            relay: 'hall_call',
            state: true
        });
    }

    async emergencyStop() {
        const channelIndex = this.functionChannels.get('emergency_stop');
        
        if (channelIndex === undefined) {
            throw new Error(`Emergency stop not configured for relay ${this.config.relayId}`);
    }

        const channelConfig = this.channelFunctions.get(channelIndex);
        if (!channelConfig.enabled) {
            throw new Error(`Emergency stop channel is disabled on relay ${this.config.relayId}`);
        }
        
        console.log(`Activating emergency stop on relay ${this.config.relayId} (channel ${channelIndex})`);
        return this.sendCommand('set_relay', {
            relay: 'emergency_stop',
            state: true
        });
    }

    // Generic relay control
    async setRelay(functionName, state) {
        const channelIndex = this.functionChannels.get(functionName);
        
        if (channelIndex === undefined) {
            throw new Error(`Function ${functionName} not configured for relay ${this.config.relayId}`);
        }
        
        const channelConfig = this.channelFunctions.get(channelIndex);
        if (!channelConfig.enabled) {
            throw new Error(`Function ${functionName} channel is disabled on relay ${this.config.relayId}`);
        }
        
        console.log(`Setting ${functionName} to ${state} on relay ${this.config.relayId} (channel ${channelIndex})`);
        return this.sendCommand('set_relay', {
            relay: functionName,
            state: state
        });
    }

    // Execute any elevator action
    async executeAction(action, params = {}) {
        switch (action) {
            case 'select_floor':
                return this.selectFloor(params.floor);
            case 'open_door':
                return this.openDoor();
            case 'close_door':
                return this.closeDoor();
            case 'hall_call':
                return this.hallCall();
            case 'emergency_stop':
                return this.emergencyStop();
            case 'set_relay':
                return this.setRelay(params.function, params.state);
            default:
                throw new Error(`Unknown elevator action: ${action}`);
        }
    }

    // Status and monitoring methods
    getStatus() {
        return {
            connected: this.connected,
            relayId: this.config.relayId,
            ip: this.config.ip,
            port: this.config.port,
            lastHeartbeat: this.lastHeartbeat,
            relayStates: Object.fromEntries(this.relayStates),
            inputStates: Object.fromEntries(this.inputStates),
            channelFunctions: Object.fromEntries(this.channelFunctions),
            pendingCommands: this.pendingCommands.size
        };
    }

    getRelayState(channelIndex) {
        return this.relayStates.get(channelIndex) || false;
    }

    getInputState(inputIndex) {
        return this.inputStates.get(inputIndex) || false;
    }

    getFunctionState(functionName) {
        const channelIndex = this.functionChannels.get(functionName);
        if (channelIndex === undefined) return null;
        return this.getRelayState(channelIndex);
    }

    isConnected() {
        return this.connected;
    }

    getChannelConfig() {
        return Object.fromEntries(this.channelFunctions);
    }

    getAvailableFunctions() {
        return Array.from(this.functionChannels.keys());
    }

    // Safety and validation methods
    validateFloor(floor) {
        const functionName = `floor_${floor}`;
        return this.functionChannels.has(functionName);
    }

    validateFunction(functionName) {
        return this.functionChannels.has(functionName);
    }

    isChannelEnabled(channelIndex) {
        const config = this.channelFunctions.get(channelIndex);
        return config ? config.enabled : false;
    }

    isSafetyRequired(functionName) {
        const channelIndex = this.functionChannels.get(functionName);
        if (channelIndex === undefined) return false;
        
        const config = this.channelFunctions.get(channelIndex);
        return config ? config.safetyRequired : false;
    }
}

module.exports = ESP32ElevatorController; 
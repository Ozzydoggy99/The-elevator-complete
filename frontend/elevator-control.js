// Elevator Control System JavaScript
class ElevatorControlSystem {
    constructor() {
        this.connected = false;
        this.currentFloor = 1;
        this.targetFloor = null;
        this.status = 'unknown';
        this.relayStates = {};
        this.ws = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeRelayStatus();
        this.loadFloorCoordinates();
    }

    initializeElements() {
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionText = document.getElementById('connectionText');
        this.currentFloorEl = document.getElementById('currentFloor');
        this.targetFloorEl = document.getElementById('targetFloor');
        this.elevatorStatusEl = document.getElementById('elevatorStatus');
        
        // Control elements
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.openDoorBtn = document.getElementById('openDoorBtn');
        this.closeDoorBtn = document.getElementById('closeDoorBtn');
        
        // Floor selection
        this.floorButtons = document.querySelectorAll('.floor-btn');
        
        // Coordinate elements
        this.floorSelect = document.getElementById('floorSelect');
        this.approachX = document.getElementById('approachX');
        this.approachY = document.getElementById('approachY');
        this.entranceX = document.getElementById('entranceX');
        this.entranceY = document.getElementById('entranceY');
        this.exitX = document.getElementById('exitX');
        this.exitY = document.getElementById('exitY');
        this.saveCoordsBtn = document.getElementById('saveCoordsBtn');
        this.loadCoordsBtn = document.getElementById('loadCoordsBtn');
        
        // Workflow elements
        this.testMovementBtn = document.getElementById('testMovementBtn');
        this.maintenanceBtn = document.getElementById('maintenanceBtn');
        this.emergencyStopBtn = document.getElementById('emergencyStopBtn');
        
        // Log panel
        this.logPanel = document.getElementById('logPanel');
        
        // Relay status container
        this.relayStatusContainer = document.getElementById('relayStatus');
    }

    setupEventListeners() {
        // Connection controls
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        
        // Door controls
        this.openDoorBtn.addEventListener('click', () => this.openDoor());
        this.closeDoorBtn.addEventListener('click', () => this.closeDoor());
        
        // Floor selection
        this.floorButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const floor = parseInt(e.target.dataset.floor);
                this.selectFloor(floor);
            });
        });
        
        // Coordinate controls
        this.saveCoordsBtn.addEventListener('click', () => this.saveCoordinates());
        this.loadCoordsBtn.addEventListener('click', () => this.loadCoordinates());
        this.floorSelect.addEventListener('change', () => this.loadCoordinates());
        
        // Workflow controls
        this.testMovementBtn.addEventListener('click', () => this.testMovement());
        this.maintenanceBtn.addEventListener('click', () => this.runMaintenance());
        this.emergencyStopBtn.addEventListener('click', () => this.emergencyStop());
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    initializeRelayStatus() {
        const relays = [
            { name: 'Door Open', key: 'doorOpen' },
            { name: 'Door Close', key: 'doorClose' },
            { name: 'Floor 1', key: 'floor1' },
            { name: 'Floor 2', key: 'floor2' },
            { name: 'Floor 3', key: 'floor3' },
            { name: 'Floor 4', key: 'floor4' }
        ];

        this.relayStatusContainer.innerHTML = '';
        relays.forEach(relay => {
            const relayEl = document.createElement('div');
            relayEl.className = 'relay-item';
            relayEl.id = `relay-${relay.key}`;
            relayEl.innerHTML = `
                <span>${relay.name}</span>
                <span class="relay-state">OFF</span>
            `;
            this.relayStatusContainer.appendChild(relayEl);
        });
    }

    async connect() {
        try {
            this.log('Connecting to elevator system...', 'info');
            
            // Connect to backend WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/elevator`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.connected = true;
                this.updateConnectionStatus();
                this.log('Connected to elevator system', 'success');
                
                // Request initial status
                this.sendMessage({ type: 'get_status' });
            };
            
            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };
            
            this.ws.onclose = () => {
                this.connected = false;
                this.updateConnectionStatus();
                this.log('Disconnected from elevator system', 'error');
            };
            
            this.ws.onerror = (error) => {
                this.log('WebSocket error: ' + error.message, 'error');
            };
            
        } catch (error) {
            this.log('Connection failed: ' + error.message, 'error');
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.connected = false;
        this.updateConnectionStatus();
        this.log('Disconnected from elevator system', 'info');
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.log('Cannot send message: not connected', 'error');
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'status':
                this.updateStatus(message.data);
                break;
            case 'relay_states':
                this.updateRelayStates(message.states);
                break;
            case 'error':
                this.log('Error: ' + message.error, 'error');
                break;
            case 'log':
                this.log(message.message, message.level || 'info');
                break;
            default:
                this.log('Unknown message type: ' + message.type, 'error');
        }
    }

    updateConnectionStatus() {
        if (this.connected) {
            this.connectionStatus.className = 'status-indicator status-connected';
            this.connectionText.textContent = 'Connected';
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = false;
        } else {
            this.connectionStatus.className = 'status-indicator status-disconnected';
            this.connectionText.textContent = 'Disconnected';
            this.connectBtn.disabled = false;
            this.disconnectBtn.disabled = true;
        }
    }

    updateStatus(status) {
        this.currentFloor = status.currentFloor || this.currentFloor;
        this.targetFloor = status.targetFloor;
        this.status = status.status || this.status;
        
        this.currentFloorEl.textContent = this.currentFloor;
        this.targetFloorEl.textContent = this.targetFloor || '-';
        this.elevatorStatusEl.textContent = this.status;
        
        // Update floor button states
        this.floorButtons.forEach(btn => {
            const floor = parseInt(btn.dataset.floor);
            btn.classList.toggle('active', floor === this.currentFloor);
        });
    }

    updateRelayStates(states) {
        this.relayStates = states;
        
        Object.entries(states).forEach(([key, state]) => {
            const relayEl = document.getElementById(`relay-${key}`);
            if (relayEl) {
                const stateEl = relayEl.querySelector('.relay-state');
                stateEl.textContent = state ? 'ON' : 'OFF';
                relayEl.classList.toggle('active', state);
            }
        });
    }

    async openDoor() {
        if (!this.connected) {
            this.log('Cannot open door: not connected', 'error');
            return;
        }
        
        this.sendMessage({ type: 'open_door' });
        this.log('Opening elevator door...', 'info');
    }

    async closeDoor() {
        if (!this.connected) {
            this.log('Cannot close door: not connected', 'error');
            return;
        }
        
        this.sendMessage({ type: 'close_door' });
        this.log('Closing elevator door...', 'info');
    }

    async selectFloor(floor) {
        if (!this.connected) {
            this.log('Cannot select floor: not connected', 'error');
            return;
        }
        
        this.sendMessage({ type: 'select_floor', floor });
        this.log(`Selecting floor ${floor}...`, 'info');
    }

    async testMovement() {
        if (!this.connected) {
            this.log('Cannot test movement: not connected', 'error');
            return;
        }
        
        this.sendMessage({ type: 'test_movement' });
        this.log('Starting test movement (Floor 1 → 2 → 1)...', 'info');
    }

    async runMaintenance() {
        if (!this.connected) {
            this.log('Cannot run maintenance: not connected', 'error');
            return;
        }
        
        this.sendMessage({ type: 'maintenance_test' });
        this.log('Starting maintenance test...', 'info');
    }

    async emergencyStop() {
        this.sendMessage({ type: 'emergency_stop' });
        this.log('EMERGENCY STOP ACTIVATED', 'error');
    }

    async saveCoordinates() {
        const floor = parseInt(this.floorSelect.value);
        const coordinates = {
            approach: {
                x: parseFloat(this.approachX.value),
                y: parseFloat(this.approachY.value)
            },
            entrance: {
                x: parseFloat(this.entranceX.value),
                y: parseFloat(this.entranceY.value)
            },
            exit: {
                x: parseFloat(this.exitX.value),
                y: parseFloat(this.exitY.value)
            }
        };
        
        try {
            const response = await fetch('/api/elevator/coordinates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ floor, coordinates })
            });
            
            if (response.ok) {
                this.log(`Saved coordinates for floor ${floor}`, 'success');
            } else {
                this.log('Failed to save coordinates', 'error');
            }
        } catch (error) {
            this.log('Error saving coordinates: ' + error.message, 'error');
        }
    }

    async loadCoordinates() {
        const floor = parseInt(this.floorSelect.value);
        
        try {
            const response = await fetch(`/api/elevator/coordinates/${floor}`);
            
            if (response.ok) {
                const coordinates = await response.json();
                
                this.approachX.value = coordinates.approach?.x || '';
                this.approachY.value = coordinates.approach?.y || '';
                this.entranceX.value = coordinates.entrance?.x || '';
                this.entranceY.value = coordinates.entrance?.y || '';
                this.exitX.value = coordinates.exit?.x || '';
                this.exitY.value = coordinates.exit?.y || '';
                
                this.log(`Loaded coordinates for floor ${floor}`, 'success');
            } else {
                this.log('Failed to load coordinates', 'error');
            }
        } catch (error) {
            this.log('Error loading coordinates: ' + error.message, 'error');
        }
    }

    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.logPanel.appendChild(logEntry);
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
        
        // Keep only last 100 log entries
        while (this.logPanel.children.length > 100) {
            this.logPanel.removeChild(this.logPanel.firstChild);
        }
    }

    // Auto-connect on page load
    autoConnect() {
        setTimeout(() => {
            this.connect();
        }, 1000);
    }
}

// Initialize the elevator control system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const elevatorControl = new ElevatorControlSystem();
    elevatorControl.autoConnect();
    
    // Make it globally accessible for debugging
    window.elevatorControl = elevatorControl;
}); 
 
const ESP32ElevatorController = require('./ESP32ElevatorController');
const EventEmitter = require('events');

class ElevatorManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.elevatorController = null;
        this.connected = false;
        this.currentFloor = 1;
        this.targetFloor = null;
        this.status = 'idle'; // idle, moving, door_opening, door_closing, error
        this.floorCoordinates = new Map();
        this.elevatorPosition = { x: 0, y: 0 }; // Current elevator position
        
        // Initialize floor coordinates (can be loaded from database)
        this.initializeFloorCoordinates();
    }

    // Initialize default floor coordinates
    initializeFloorCoordinates() {
        const defaultCoordinates = {
            1: {
                approach: { x: -1.5, y: 0 },
                entrance: { x: 0, y: 0 },
                exit: { x: 1.5, y: 0 },
                elevatorPosition: { x: 0, y: 0 }
            },
            2: {
                approach: { x: -1.5, y: 0 },
                entrance: { x: 0, y: 0 },
                exit: { x: 1.5, y: 0 },
                elevatorPosition: { x: 0, y: 0 }
            },
            3: {
                approach: { x: -1.5, y: 0 },
                entrance: { x: 0, y: 0 },
                exit: { x: 1.5, y: 0 },
                elevatorPosition: { x: 0, y: 0 }
            },
            4: {
                approach: { x: -1.5, y: 0 },
                entrance: { x: 0, y: 0 },
                exit: { x: 1.5, y: 0 },
                elevatorPosition: { x: 0, y: 0 }
            }
        };

        for (const [floor, coords] of Object.entries(defaultCoordinates)) {
            this.floorCoordinates.set(parseInt(floor), coords);
        }
    }

    // Connect to elevator controller
    async connect() {
        try {
            this.elevatorController = new ESP32ElevatorController(this.config);
            
            // Set up event listeners
            this.elevatorController.on('connected', () => {
                this.connected = true;
                this.status = 'idle';
                this.emit('connected');
                console.log('Elevator controller connected');
            });

            this.elevatorController.on('disconnected', () => {
                this.connected = false;
                this.status = 'error';
                this.emit('disconnected');
                console.log('Elevator controller disconnected');
            });

            this.elevatorController.on('error', (error) => {
                this.status = 'error';
                this.emit('error', error);
                console.error('Elevator controller error:', error);
            });

            this.elevatorController.on('relay_state_change', (states) => {
                this.handleRelayStateChange(states);
            });

            await this.elevatorController.connect();
            return true;
        } catch (error) {
            this.status = 'error';
            this.emit('error', error);
            console.error('Failed to connect to elevator controller:', error);
            return false;
        }
    }

    // Handle relay state changes
    handleRelayStateChange(states) {
        // Update elevator status based on relay states
        if (states.doorOpen) {
            this.status = 'door_opening';
        } else if (states.doorClose) {
            this.status = 'door_closing';
        } else {
            // Check if any floor relay is active
            const activeFloor = Object.keys(states).find(key => 
                key.startsWith('floor') && states[key]
            );
            if (activeFloor) {
                this.status = 'moving';
                const floorNumber = parseInt(activeFloor.replace('floor', ''));
                this.targetFloor = floorNumber;
            } else if (this.status === 'moving' && this.targetFloor) {
                // Elevator has reached target floor
                this.currentFloor = this.targetFloor;
                this.targetFloor = null;
                this.status = 'idle';
                this.emit('floorReached', this.currentFloor);
            }
        }
        
        this.emit('statusChanged', {
            status: this.status,
            currentFloor: this.currentFloor,
            targetFloor: this.targetFloor
        });
    }

    // Get elevator status
    getStatus() {
        return {
            connected: this.connected,
            status: this.status,
            currentFloor: this.currentFloor,
            targetFloor: this.targetFloor,
            elevatorPosition: this.elevatorPosition
        };
    }

    // Get floor coordinates
    getFloorCoordinates(floor) {
        return this.floorCoordinates.get(floor);
    }

    // Set floor coordinates
    setFloorCoordinates(floor, coordinates) {
        this.floorCoordinates.set(floor, coordinates);
        this.emit('floorCoordinatesUpdated', { floor, coordinates });
    }

    // Basic elevator operations
    async openDoor() {
        if (!this.connected) {
            throw new Error('Elevator controller not connected');
        }
        this.status = 'door_opening';
        this.emit('statusChanged', { status: this.status });
        await this.elevatorController.openDoor();
        this.status = 'idle';
        this.emit('statusChanged', { status: this.status });
    }

    async closeDoor() {
        if (!this.connected) {
            throw new Error('Elevator controller not connected');
        }
        this.status = 'door_closing';
        this.emit('statusChanged', { status: this.status });
        await this.elevatorController.closeDoor();
        this.status = 'idle';
        this.emit('statusChanged', { status: this.status });
    }

    async selectFloor(floorNumber) {
        if (!this.connected) {
            throw new Error('Elevator controller not connected');
        }
        if (!this.floorCoordinates.has(floorNumber)) {
            throw new Error(`Invalid floor number: ${floorNumber}`);
        }
        
        this.targetFloor = floorNumber;
        this.status = 'moving';
        this.emit('statusChanged', { 
            status: this.status, 
            targetFloor: this.targetFloor 
        });
        
        await this.elevatorController.selectFloor(floorNumber);
    }

    // High-level elevator operations for workflows
    async goToFloor(targetFloor, robotController = null) {
        if (!this.connected) {
            throw new Error('Elevator controller not connected');
        }

        console.log(`Elevator: Moving from floor ${this.currentFloor} to floor ${targetFloor}`);
        
        try {
            // 1. Open door at current floor
            await this.openDoor();
            
            // 2. Wait for robot to enter (if robot controller provided)
            if (robotController) {
                const currentCoords = this.getFloorCoordinates(this.currentFloor);
                if (currentCoords) {
                    console.log('Elevator: Waiting for robot to enter elevator...');
                    await robotController.moveTo(currentCoords.entrance);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for robot to settle
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Default wait time
            }
            
            // 3. Close door
            await this.closeDoor();
            
            // 4. Select target floor
            await this.selectFloor(targetFloor);
            
            // 5. Wait for elevator to reach target floor
            const floorDifference = Math.abs(targetFloor - this.currentFloor);
            const travelTime = floorDifference * 5000; // 5 seconds per floor
            console.log(`Elevator: Waiting ${travelTime/1000} seconds for elevator to reach floor ${targetFloor}`);
            await new Promise(resolve => setTimeout(resolve, travelTime));
            
            // 6. Open door at target floor
            await this.openDoor();
            
            // 7. Wait for robot to exit (if robot controller provided)
            if (robotController) {
                const targetCoords = this.getFloorCoordinates(targetFloor);
                if (targetCoords) {
                    console.log('Elevator: Waiting for robot to exit elevator...');
                    await robotController.moveTo(targetCoords.exit);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for robot to settle
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Default wait time
            }
            
            // 8. Close door
            await this.closeDoor();
            
            console.log(`Elevator: Successfully moved to floor ${targetFloor}`);
            return true;
            
        } catch (error) {
            console.error('Elevator: Error during floor movement:', error);
            this.status = 'error';
            this.emit('error', error);
            throw error;
        }
    }

    // Workflow integration: Execute elevator step
    async executeElevatorStep(step, robotController = null) {
        const { action, floor, waitTime = 5000 } = step;
        
        switch (action) {
            case 'open_door':
                await this.openDoor();
                break;
                
            case 'close_door':
                await this.closeDoor();
                break;
                
            case 'select_floor':
                await this.selectFloor(floor);
                break;
                
            case 'go_to_floor':
                await this.goToFloor(floor, robotController);
                break;
                
            case 'wait_for_robot_enter':
                if (robotController) {
                    const coords = this.getFloorCoordinates(this.currentFloor);
                    if (coords) {
                        await robotController.moveTo(coords.entrance);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                break;
                
            case 'wait_for_robot_exit':
                if (robotController) {
                    const coords = this.getFloorCoordinates(this.currentFloor);
                    if (coords) {
                        await robotController.moveTo(coords.exit);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                break;
                
            default:
                throw new Error(`Unknown elevator action: ${action}`);
        }
    }

    // Disconnect elevator controller
    disconnect() {
        if (this.elevatorController) {
            this.elevatorController.disconnect();
        }
        this.connected = false;
        this.status = 'disconnected';
        this.emit('disconnected');
    }
}

module.exports = ElevatorManager; 
 
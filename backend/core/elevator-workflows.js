// Elevator Workflow Templates
// These templates define elevator operations that can be integrated into robot workflows

const elevatorWorkflowTemplates = {
    // Simple elevator movement between floors
    'elevator_move': {
        name: 'Elevator Move',
        description: 'Move elevator from current floor to target floor',
        steps: [
            {
                id: 'open_door_current',
                name: 'Open Door at Current Floor',
                action: 'elevator_action',
                elevatorAction: 'open_door',
                description: 'Open elevator door at current floor'
            },
            {
                id: 'wait_robot_enter',
                name: 'Wait for Robot to Enter',
                action: 'elevator_action',
                elevatorAction: 'wait_for_robot_enter',
                waitTime: 5000,
                description: 'Wait for robot to enter elevator'
            },
            {
                id: 'close_door_current',
                name: 'Close Door at Current Floor',
                action: 'elevator_action',
                elevatorAction: 'close_door',
                description: 'Close elevator door at current floor'
            },
            {
                id: 'select_target_floor',
                name: 'Select Target Floor',
                action: 'elevator_action',
                elevatorAction: 'select_floor',
                floor: '{{targetFloor}}',
                description: 'Select target floor on elevator panel'
            },
            {
                id: 'wait_elevator_move',
                name: 'Wait for Elevator Movement',
                action: 'wait',
                duration: '{{floorTravelTime}}',
                description: 'Wait for elevator to reach target floor'
            },
            {
                id: 'open_door_target',
                name: 'Open Door at Target Floor',
                action: 'elevator_action',
                elevatorAction: 'open_door',
                description: 'Open elevator door at target floor'
            },
            {
                id: 'wait_robot_exit',
                name: 'Wait for Robot to Exit',
                action: 'elevator_action',
                elevatorAction: 'wait_for_robot_exit',
                waitTime: 5000,
                description: 'Wait for robot to exit elevator'
            },
            {
                id: 'close_door_target',
                name: 'Close Door at Target Floor',
                action: 'elevator_action',
                elevatorAction: 'close_door',
                description: 'Close elevator door at target floor'
            }
        ]
    },

    // Multi-floor pickup workflow with elevator
    'multi_floor_pickup': {
        name: 'Multi-Floor Pickup',
        description: 'Pickup task involving elevator movement between floors',
        steps: [
            {
                id: 'move_to_elevator_approach',
                name: 'Move to Elevator Approach',
                action: 'move_to',
                coordinates: '{{elevatorApproachCoords}}',
                description: 'Move to elevator approach point'
            },
            {
                id: 'move_to_elevator_entrance',
                name: 'Move to Elevator Entrance',
                action: 'move_to',
                coordinates: '{{elevatorEntranceCoords}}',
                description: 'Move to elevator entrance'
            },
            {
                id: 'elevator_move_to_pickup_floor',
                name: 'Use Elevator to Pickup Floor',
                action: 'elevator_move',
                targetFloor: '{{pickupFloor}}',
                description: 'Use elevator to reach pickup floor'
            },
            {
                id: 'move_to_pickup_location',
                name: 'Move to Pickup Location',
                action: 'move_to',
                coordinates: '{{pickupCoords}}',
                description: 'Move to pickup location'
            },
            {
                id: 'perform_pickup',
                name: 'Perform Pickup',
                action: 'pickup',
                description: 'Perform pickup operation'
            },
            {
                id: 'move_to_elevator_approach_return',
                name: 'Move to Elevator Approach (Return)',
                action: 'move_to',
                coordinates: '{{elevatorApproachCoords}}',
                description: 'Move to elevator approach point for return'
            },
            {
                id: 'move_to_elevator_entrance_return',
                name: 'Move to Elevator Entrance (Return)',
                action: 'move_to',
                coordinates: '{{elevatorEntranceCoords}}',
                description: 'Move to elevator entrance for return'
            },
            {
                id: 'elevator_move_to_destination_floor',
                name: 'Use Elevator to Destination Floor',
                action: 'elevator_move',
                targetFloor: '{{destinationFloor}}',
                description: 'Use elevator to reach destination floor'
            },
            {
                id: 'move_to_dropoff_location',
                name: 'Move to Dropoff Location',
                action: 'move_to',
                coordinates: '{{dropoffCoords}}',
                description: 'Move to dropoff location'
            },
            {
                id: 'perform_dropoff',
                name: 'Perform Dropoff',
                action: 'dropoff',
                description: 'Perform dropoff operation'
            }
        ]
    },

    // Multi-floor dropoff workflow with elevator
    'multi_floor_dropoff': {
        name: 'Multi-Floor Dropoff',
        description: 'Dropoff task involving elevator movement between floors',
        steps: [
            {
                id: 'move_to_elevator_approach',
                name: 'Move to Elevator Approach',
                action: 'move_to',
                coordinates: '{{elevatorApproachCoords}}',
                description: 'Move to elevator approach point'
            },
            {
                id: 'move_to_elevator_entrance',
                name: 'Move to Elevator Entrance',
                action: 'move_to',
                coordinates: '{{elevatorEntranceCoords}}',
                description: 'Move to elevator entrance'
            },
            {
                id: 'elevator_move_to_dropoff_floor',
                name: 'Use Elevator to Dropoff Floor',
                action: 'elevator_move',
                targetFloor: '{{dropoffFloor}}',
                description: 'Use elevator to reach dropoff floor'
            },
            {
                id: 'move_to_dropoff_location',
                name: 'Move to Dropoff Location',
                action: 'move_to',
                coordinates: '{{dropoffCoords}}',
                description: 'Move to dropoff location'
            },
            {
                id: 'perform_dropoff',
                name: 'Perform Dropoff',
                action: 'dropoff',
                description: 'Perform dropoff operation'
            }
        ]
    },

    // Elevator maintenance workflow
    'elevator_maintenance': {
        name: 'Elevator Maintenance',
        description: 'Test elevator functionality on all floors',
        steps: [
            {
                id: 'test_floor_1',
                name: 'Test Floor 1',
                action: 'elevator_action',
                elevatorAction: 'test_floor',
                floor: 1,
                description: 'Test elevator functionality on floor 1'
            },
            {
                id: 'test_floor_2',
                name: 'Test Floor 2',
                action: 'elevator_action',
                elevatorAction: 'test_floor',
                floor: 2,
                description: 'Test elevator functionality on floor 2'
            },
            {
                id: 'test_floor_3',
                name: 'Test Floor 3',
                action: 'elevator_action',
                elevatorAction: 'test_floor',
                floor: 3,
                description: 'Test elevator functionality on floor 3'
            },
            {
                id: 'test_floor_4',
                name: 'Test Floor 4',
                action: 'elevator_action',
                elevatorAction: 'test_floor',
                floor: 4,
                description: 'Test elevator functionality on floor 4'
            }
        ]
    }
};

// Helper function to create elevator workflow with parameters
function createElevatorWorkflow(templateName, parameters = {}) {
    const template = elevatorWorkflowTemplates[templateName];
    if (!template) {
        throw new Error(`Elevator workflow template '${templateName}' not found`);
    }

    // Deep clone the template
    const workflow = JSON.parse(JSON.stringify(template));
    
    // Replace placeholders with actual values
    workflow.steps = workflow.steps.map(step => {
        const newStep = { ...step };
        
        // Replace template variables
        Object.keys(parameters).forEach(key => {
            const placeholder = `{{${key}}}`;
            if (typeof newStep.coordinates === 'string' && newStep.coordinates.includes(placeholder)) {
                newStep.coordinates = parameters[key];
            }
            if (typeof newStep.floor === 'string' && newStep.floor.includes(placeholder)) {
                newStep.floor = parameters[key];
            }
            if (typeof newStep.targetFloor === 'string' && newStep.targetFloor.includes(placeholder)) {
                newStep.targetFloor = parameters[key];
            }
            if (typeof newStep.duration === 'string' && newStep.duration.includes(placeholder)) {
                newStep.duration = parameters[key];
            }
        });
        
        return newStep;
    });
    
    return workflow;
}

// Helper function to calculate floor travel time
function calculateFloorTravelTime(fromFloor, toFloor, secondsPerFloor = 5) {
    return Math.abs(toFloor - fromFloor) * secondsPerFloor * 1000; // Convert to milliseconds
}

// Helper function to get elevator coordinates for a floor
function getElevatorCoordinates(floor, elevatorManager) {
    const coords = elevatorManager.getFloorCoordinates(floor);
    if (!coords) {
        throw new Error(`No coordinates found for floor ${floor}`);
    }
    return coords;
}

module.exports = {
    elevatorWorkflowTemplates,
    createElevatorWorkflow,
    calculateFloorTravelTime,
    getElevatorCoordinates
}; 
 
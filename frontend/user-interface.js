// Check authentication
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token || !user || (user.role !== 'boss' && user.role !== 'user')) {
    window.location.href = '/login.html';
}

// Update UI with user and template info
const usernameElement = document.getElementById('username');
if (usernameElement) {
    usernameElement.textContent = user.username;
}

// Clock functionality
const clockElement = document.getElementById('clock');
function updateClock() {
    if (clockElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        clockElement.textContent = timeString;
    }
}

// Start clock
updateClock();
setInterval(updateClock, 1000);

// Get template ID from URL or user data
const urlParams = new URLSearchParams(window.location.search);
const templateId = urlParams.get('templateId') || user.templateId;

if (!templateId) {
    alert('No template ID found. Please log in again.');
    window.location.href = '/login.html';
}

// Load template info
fetch(`/api/templates/${templateId}`, {
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
.then(response => {
    if (!response.ok) {
        throw new Error('Failed to load template');
    }
    return response.json();
})
.then(template => {
    const templateNameElement = document.getElementById('templateName');
    if (templateNameElement) {
        templateNameElement.textContent = template.name;
    }
    const headerElement = document.querySelector('.user-header');
    if (headerElement) {
        headerElement.style.backgroundColor = template.color;
    }
})
.catch(error => {
    console.error('Error loading template:', error);
    alert('Error loading template. Please try again.');
});

// Handle logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });
}

// Workflow state
let currentWorkflow = {
    type: null, // 'pickup' or 'dropoff'
    floor: null,
    shelfPoint: null
};

// Workflow selection
const pickupOption = document.getElementById('pickupOption');
if (pickupOption) {
    pickupOption.addEventListener('click', () => {
        currentWorkflow.type = 'pickup';
        showFloorSelection();
    });
}

const dropoffOption = document.getElementById('dropoffOption');
if (dropoffOption) {
    dropoffOption.addEventListener('click', () => {
        currentWorkflow.type = 'dropoff';
        showFloorSelection();
    });
}

// Floor selection
function showFloorSelection() {
    const workflowPage = document.getElementById('workflowPage');
    const floorPage = document.getElementById('floorPage');
    const shelfPage = document.getElementById('shelfPage');

    if (workflowPage) workflowPage.style.display = 'none';
    if (floorPage) floorPage.style.display = 'block';
    if (shelfPage) shelfPage.style.display = 'none';

    // Clear any existing floor grid content
    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.innerHTML = '<div style="text-align: center; padding: 20px;">Loading floors...</div>';
    }

    // Add a small delay to ensure proper data loading on first run
    setTimeout(() => {
        loadFloorData();
    }, 100);
}

function loadFloorData() {

    // Load template info to get the assigned robot
    fetch(`/api/templates/${templateId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load template');
        }
        return response.json();
    })
    .then(template => {
        // Parse robot if stored as JSONB string
        let robot = template.robot;
        if (typeof robot === 'string') {
            try {
                robot = JSON.parse(robot);
            } catch (e) {
                console.error('Error parsing robot JSON:', e);
                robot = null;
            }
        }
        // Get the robot's serial number from the template
        const robotSerial = robot?.serial_number || robot?.serialNumber || (template.robots && (template.robots[0]?.serial_number || template.robots[0]?.serialNumber));
        if (!robotSerial) throw new Error('No robot assigned to this template');
        
        // Fetch robot maps from backend cache with cache-busting
        return fetch('/api/robot-maps', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        }).then(res => {
            if (!res.ok) {
                throw new Error('Failed to fetch robot maps');
            }
            return res.json();
        }).then(robotMaps => {
            console.log('Robot maps response:', robotMaps);
            const robotData = (robotMaps || []).find(r => r.robot.serialNumber === robotSerial);
            if (!robotData) {
                console.error('No robot data found for serial:', robotSerial);
                console.error('Available robots:', robotMaps.map(r => r.robot.serialNumber));
                throw new Error('No map data for assigned robot');
            }
            console.log('Found robot data:', robotData);
            return robotData.maps;
        });
    })
    .then(maps => {
        const floorGrid = document.getElementById('floorGrid');
        if (!floorGrid) return;
        floorGrid.innerHTML = '';
        
        if (!maps || maps.length === 0) {
            floorGrid.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No floors available</div>';
            return;
        }
        
        maps.forEach(map => {
            if (!map.map_name) {
                console.warn('Map name is missing for a floor:', map);
                return;
            }
            const floorNumber = map.map_name.replace(/[^0-9]/g, '');
            const floorCard = document.createElement('div');
            floorCard.className = 'floor-card';
            floorCard.textContent = floorNumber || map.map_name;
            floorCard.onclick = () => selectFloor(map.map_name, map.id);
            floorGrid.appendChild(floorCard);
        });
    })
    .catch(error => {
        console.error('Error loading floors:', error);
        const floorGrid = document.getElementById('floorGrid');
        if (floorGrid) {
            floorGrid.innerHTML = `<div style="text-align: center; padding: 20px; color: #f44336;">Error loading floors: ${error.message}</div>`;
        }
        
        // Retry once after a delay if it's the first attempt
        setTimeout(() => {
            console.log('Retrying floor data load...');
            loadFloorData();
        }, 2000);
    });
}

function selectFloor(floorName, mapId) {
    currentWorkflow.floor = floorName.replace(/[^0-9]/g, '');
    showShelfPoints(floorName, mapId);
}

// Shelf point selection
function showShelfPoints(floorName, mapId) {
    const workflowPage = document.getElementById('workflowPage');
    const floorPage = document.getElementById('floorPage');
    const shelfPage = document.getElementById('shelfPage');

    if (workflowPage) workflowPage.style.display = 'none';
    if (floorPage) floorPage.style.display = 'none';
    if (shelfPage) shelfPage.style.display = 'block';

    // Clear any existing shelf grid content
    const shelfGrid = document.getElementById('shelfGrid');
    if (shelfGrid) {
        shelfGrid.innerHTML = '<div style="text-align: center; padding: 20px;">Loading shelf points...</div>';
    }

    // Load template info to get the assigned robot
    fetch(`/api/templates/${templateId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load template');
        }
        return response.json();
    })
    .then(template => {
        // Parse robot if stored as JSONB string
        let robot = template.robot;
        if (typeof robot === 'string') {
            try {
                robot = JSON.parse(robot);
            } catch (e) {
                console.error('Error parsing robot JSON:', e);
                robot = null;
            }
        }
        // Get the robot's serial number from the template
        const robotSerial = robot?.serial_number || robot?.serialNumber || (template.robots && (template.robots[0]?.serial_number || template.robots[0]?.serialNumber));
        if (!robotSerial) throw new Error('No robot assigned to this template');
        
        // Fetch robot maps from backend cache with cache-busting
        return fetch('/api/robot-maps', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        }).then(res => {
            if (!res.ok) {
                throw new Error('Failed to fetch robot maps');
            }
            return res.json();
        }).then(robotMaps => {
            console.log('Robot maps response for shelf points:', robotMaps);
            const robotData = (robotMaps || []).find(r => r.robot.serialNumber === robotSerial);
            if (!robotData) {
                console.error('No robot data found for serial:', robotSerial);
                throw new Error('No map data for assigned robot');
            }
            // Find the selected map
            const map = robotData.maps.find(m => m.map_name === floorName || m.id === mapId);
            if (!map) {
                console.error('Map not found for floor:', floorName, 'or mapId:', mapId);
                console.error('Available maps:', robotData.maps.map(m => ({ name: m.map_name, id: m.id })));
                throw new Error('Map not found');
            }
            
            // Filter and process points
            const uniquePoints = new Set();
            if (map.features && Array.isArray(map.features)) {
                map.features.forEach(feature => {
                    const name = feature.name;
                    if (name && (name.includes('_load') || name.includes('_load_docking'))) {
                        const baseName = name.split('_')[0];
                        // Only add points that don't start with '0' (not pickup/dropoff points)
                        if (!baseName.startsWith('0')) {
                            uniquePoints.add(baseName);
                        }
                    }
                });
            }
            return Array.from(uniquePoints);
        });
    })
    .then(points => {
        const shelfGrid = document.getElementById('shelfGrid');
        if (!shelfGrid) return;
        shelfGrid.innerHTML = '';
        
        if (points.length === 0) {
            const noPoints = document.createElement('div');
            noPoints.className = 'no-points';
            noPoints.textContent = 'No shelf points available for this floor';
            shelfGrid.appendChild(noPoints);
            return;
        }

        points.forEach(point => {
            const shelfCard = document.createElement('div');
            shelfCard.className = 'shelf-card';
            shelfCard.innerHTML = `
                <div class="shelf-card-content">
                    <span class="shelf-number">${point}</span>
                </div>
            `;
            shelfCard.onclick = () => {
                // Remove selected class from all cards
                document.querySelectorAll('.shelf-card').forEach(card => {
                    card.classList.remove('selected');
                });
                // Add selected class to clicked card
                shelfCard.classList.add('selected');
                // Update current workflow
                currentWorkflow.shelfPoint = point;
                
                // Check if this is a recurring task
                const urlParams = new URLSearchParams(window.location.search);
                const isRecurring = urlParams.get('recurring') === 'true';

                if (isRecurring) {
                    // For recurring tasks, redirect immediately without showing confirm button
                    const workflowData = encodeURIComponent(JSON.stringify(currentWorkflow));
                    window.location.href = `reschedule-recurring-task.html?templateId=${templateId}&workflow=${workflowData}`;
                } else {
                    // For normal tasks, show confirm button
                    const confirmBtn = document.getElementById('confirmBtn');
                    if (confirmBtn) {
                        confirmBtn.style.display = 'block';
                    }
                }
            };
            shelfGrid.appendChild(shelfCard);
        });
    })
    .catch(error => {
        console.error('Error loading shelf points:', error);
        const shelfGrid = document.getElementById('shelfGrid');
        if (shelfGrid) {
            shelfGrid.innerHTML = `<div style="text-align: center; padding: 20px; color: #f44336;">Error loading shelf points: ${error.message}</div>`;
        }
    });
}

// Back button functionality
const backToTaskManagementBtn = document.getElementById('backToTaskManagementBtn');
if (backToTaskManagementBtn) {
    backToTaskManagementBtn.addEventListener('click', () => {
        // Go back to task management page
        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('templateId');
        
        if (templateId) {
            window.location.href = `task-management.html?templateId=${templateId}`;
        } else {
            window.location.href = 'task-management.html';
        }
    });
}

const backToWorkflowBtn = document.getElementById('backToWorkflowBtn');
if (backToWorkflowBtn) {
    backToWorkflowBtn.addEventListener('click', () => {
        // Reset workflow state
        currentWorkflow = {
            type: null,
            floor: null,
            shelfPoint: null
        };
        
        // Show workflow page
        const workflowPage = document.getElementById('workflowPage');
        const floorPage = document.getElementById('floorPage');
        const shelfPage = document.getElementById('shelfPage');
        const confirmBtn = document.getElementById('confirmBtn');
        
        if (workflowPage) workflowPage.style.display = 'block';
        if (floorPage) floorPage.style.display = 'none';
        if (shelfPage) shelfPage.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
    });
}

const backToFloorBtn = document.getElementById('backToFloorBtn');
if (backToFloorBtn) {
    backToFloorBtn.addEventListener('click', () => {
        // Reset shelf point selection
        currentWorkflow.shelfPoint = null;
        
        // Show floor selection page
        const workflowPage = document.getElementById('workflowPage');
        const floorPage = document.getElementById('floorPage');
        const shelfPage = document.getElementById('shelfPage');
        const confirmBtn = document.getElementById('confirmBtn');
        
        if (workflowPage) workflowPage.style.display = 'none';
        if (floorPage) floorPage.style.display = 'block';
        if (shelfPage) shelfPage.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
    });
}

// Confirm selection
const confirmBtn = document.getElementById('confirmBtn');
if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
        if (!currentWorkflow.type || !currentWorkflow.floor || !currentWorkflow.shelfPoint) {
            alert('Please complete all selections');
            return;
        }

        // Normal task - send to queue-task endpoint
        fetch(`/api/templates/${templateId}/queue-task`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                type: currentWorkflow.type,
                floor: currentWorkflow.floor,
                shelfPoint: currentWorkflow.shelfPoint
            })
        })
        .then(async response => {
            console.log('Queue-task creation response status:', response.status);
            let data;
            try {
                data = await response.json();
            } catch (e) {
                data = null;
            }
            console.log('Queue-task creation response body:', data);
            if (!response.ok) {
                throw new Error(data && data.error ? data.error : 'Failed to queue task');
            }
            alert('Task queued successfully');
            // Redirect back to task management
            const urlParams = new URLSearchParams(window.location.search);
            const templateId = urlParams.get('templateId');
            if (templateId) {
                window.location.href = `task-management.html?templateId=${templateId}`;
            } else {
                window.location.href = 'task-management.html';
            }
        })
        .catch(error => {
            console.error('Error creating task:', error);
            alert(error.message || 'Error creating task. Please try again.');
        });
    });
}

 
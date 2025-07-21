// Task Queue Page JavaScript
class TaskQueueSystem {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.templateId = null;
        
        this.checkAuthentication();
        this.initializeElements();
        this.setupEventListeners();
        this.startClock();
        this.loadTaskQueue();
    }

    checkAuthentication() {
        console.log('Checking authentication...');
        console.log('Token exists:', !!this.token);
        console.log('User data:', this.user);
        
        if (!this.token) {
            console.log('No token found, redirecting to login');
            window.location.href = 'login.html';
            return;
        }
        
        // Get template ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.templateId = urlParams.get('templateId');
        console.log('Template ID from URL:', this.templateId);
        
        if (document.getElementById('username') && this.user) {
            document.getElementById('username').textContent = this.user.username;
        }
    }

    initializeElements() {
        this.taskQueueContent = document.getElementById('taskQueueContent');
        this.taskHistoryContent = document.getElementById('taskHistoryContent');
        this.backBtn = document.getElementById('backBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.clockElement = document.getElementById('clock');
    }

    setupEventListeners() {
        this.backBtn.addEventListener('click', () => {
            this.goBack();
        });

        this.logoutBtn.addEventListener('click', () => {
            this.logout();
        });
    }

    async loadTaskQueue() {
        try {
            console.log('Loading task queue...');
            console.log('Current template ID:', this.templateId);
            console.log('Current user:', this.user);
            
            // If no template ID, try to find the user's template
            if (!this.templateId) {
                console.log('No template ID, searching for user template...');
                this.templateId = await this.findUserTemplate();
                console.log('Found template ID:', this.templateId);
            }

            if (!this.templateId) {
                this.showError('No template found for this user');
                return;
            }

            console.log('Fetching data for template ID:', this.templateId);
            
            // Check if user has permission for this template
            if (this.user && this.user.templateId && this.user.templateId != this.templateId) {
                console.warn('User templateId mismatch:', this.user.templateId, 'vs', this.templateId);
            }
            
            // Fetch template, robots, queue, and recurring tasks data
            const [template, robots, queue, recurringTasks] = await Promise.all([
                this.fetchTemplate(this.templateId),
                this.fetchRobots(),
                this.fetchQueue(this.templateId),
                this.fetchRecurringTasks(this.templateId)
            ]);

            // Store current queue for task details modal
            this.currentQueue = queue;

            // Get robots attached to this template
            const attachedRobots = this.getAttachedRobots(template, robots);
            
            // Render the task queue (including recurring tasks)
            this.renderTaskQueue(template, attachedRobots, queue, recurringTasks);
            
            // Render task history
            this.renderTaskHistory(queue);

        } catch (error) {
            console.error('Error loading task queue:', error);
            this.showError('Failed to load task queue: ' + error.message);
        }
    }

    async findUserTemplate() {
        try {
            console.log('Finding user template for:', this.user.username);
            console.log('Using token:', this.token ? 'Token exists' : 'No token');
            
            const response = await fetch('/api/templates', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            console.log('Templates response status:', response.status);
            console.log('Templates response headers:', response.headers);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Templates response error:', errorText);
                throw new Error(`Failed to fetch templates: ${response.status} ${response.statusText}`);
            }
            
            const templates = await response.json();
            console.log('Templates found:', templates);
            
            // Find template for the current user
            const userTemplate = templates.find(t => 
                t.boss_user && t.boss_user.username === this.user.username
            );
            
            console.log('User template found:', userTemplate);
            return userTemplate ? userTemplate.id : null;
        } catch (error) {
            console.error('Error finding user template:', error);
            return null;
        }
    }

    async fetchTemplate(templateId) {
        console.log('Fetching template with ID:', templateId);
        console.log('Using token:', this.token ? this.token.substring(0, 20) + '...' : 'No token');
        
        // Try to decode the JWT token to see what's in it
        try {
            const tokenParts = this.token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                console.log('JWT Token payload:', payload);
                console.log('Token expiration:', new Date(payload.exp * 1000));
                console.log('Current time:', new Date());
                if (payload.exp * 1000 < Date.now()) {
                    console.error('Token has expired!');
                    alert('Your session has expired. Please log in again.');
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = 'login.html';
                    return;
                }
            }
        } catch (e) {
            console.error('Error decoding JWT token:', e);
        }
        
        const response = await fetch(`/api/templates/${templateId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        console.log('Template response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Template response error:', errorText);
            
            if (response.status === 403) {
                console.error('Access forbidden - token may be invalid or expired');
                alert('Access denied. Please log in again.');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
                return;
            }
            
            throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
        }
        
        const template = await response.json();
        console.log('Template fetched:', template);
        return template;
    }

    async fetchRobots() {
        const response = await fetch('/api/robots', {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch robots');
        }
        
        const robots = await response.json();
        return robots.map(this.normalizeRobot);
    }

    async fetchQueue(templateId) {
        const response = await fetch(`/api/templates/${templateId}/queue`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch queue');
        }
        
        return response.json();
    }

    async fetchRecurringTasks(templateId) {
        try {
            const response = await fetch(`/api/templates/${templateId}/recurring-tasks`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) {
                console.warn('Failed to fetch recurring tasks:', response.status);
                return [];
            }
            
            return response.json();
        } catch (error) {
            console.warn('Error fetching recurring tasks:', error);
            return [];
        }
    }

    normalizeRobot(robot) {
        return {
            ...robot,
            serialNumber: robot.serial_number || robot.serialNumber,
            publicIp: robot.public_ip || robot.publicIp,
            privateIp: robot.private_ip || robot.privateIp,
            secretKey: robot.secret_key || robot.secretKey,
            name: robot.name || robot.serial_number || robot.serialNumber
        };
    }

    getAttachedRobots(template, robots) {
        // Parse robots/robot if needed
        let templateRobots = template.robots;
        let templateRobot = template.robot;
        
        if (typeof templateRobots === 'string') {
            try { templateRobots = JSON.parse(templateRobots); } catch (e) { templateRobots = null; }
        }
        if (typeof templateRobot === 'string') {
            try { templateRobot = JSON.parse(templateRobot); } catch (e) { templateRobot = null; }
        }
        
        // Get robots attached to this template (always as array)
        let attachedRobots = [];
        if (templateRobots && Array.isArray(templateRobots)) {
            attachedRobots = robots.filter(r => 
                templateRobots.some(tr => (tr.serial_number || tr.serialNumber) === r.serialNumber)
            );
        } else if (templateRobot) {
            const serial = templateRobot.serial_number || templateRobot.serialNumber;
            attachedRobots = robots.filter(r => r.serialNumber === serial);
        }
        
        return attachedRobots;
    }

    renderTaskQueue(template, robots, queue, recurringTasks = []) {
        const robotsHtml = robots.length > 0 
            ? robots.map(r => `${r.name || ''} (${r.serialNumber})`).join(', ')
            : 'None';

        // Process queued tasks (excluding canceled and failed tasks)
        const queuedTasks = (queue || []).filter(task => 
            task.status !== 'cancelled' && 
            task.status !== 'failed' && 
            task.status !== 'canceled'
        );

        // Process recurring tasks - convert them to task format for display
        const recurringTaskDisplay = (recurringTasks || []).map(rt => ({
            id: `recurring_${rt.id}`,
            type: rt.task_type,
            floor: rt.floor,
            shelfPoint: rt.shelf_point,
            robot_serial_number: robots.length > 0 ? robots[0].serialNumber : null,
            status: 'scheduled',
            is_recurring: true,
            recurring_task_id: rt.id,
            schedule: {
                time: rt.schedule_time,
                days_of_week: rt.days_of_week,
                is_recurring: true
            },
            created_at: rt.created_at
        }));

        // Combine queued and recurring tasks
        const allTasks = [...queuedTasks, ...recurringTaskDisplay];
        
        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        
        // Generate 24-hour grid
        const gridHtml = this.generate24HourGrid(allTasks, robots, currentHour);

        // Add go home buttons for each robot in the template
        const goHomeButtons = robots.map(robot => `
            <button onclick="taskQueueSystem.goHome('${robot.serialNumber}')"
                    style="background:#4CAF50; color:white; border:none; border-radius:4px; padding:8px 16px; cursor:pointer; font-size:14px; transition:background 0.2s; margin-left:8px;"
                    onmouseover="this.style.background='#45a049'"
                    onmouseout="this.style.background='#4CAF50'">
                Go Home (${robot.name || robot.serialNumber})
            </button>
        `).join('');

        this.taskQueueContent.innerHTML = `
            <div style="max-width: 1400px; margin: 0 auto; padding: 20px;">
                <div style="background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); padding: 20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #333;">${template.name} - 24-Hour Task Schedule</h2>
                        <div style="display:flex; gap:8px;">
                            ${goHomeButtons}
                        </div>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <strong>Robots:</strong> ${robotsHtml}
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>Current Time:</strong> <span id="currentTimeDisplay">${currentTime.toLocaleTimeString()}</span>
                    </div>
                    ${gridHtml}
                </div>
            </div>
        `;
    }

    renderTaskHistory(queue) {
        // Filter for completed, failed, and canceled tasks
        const completedTasks = (queue || []).filter(task => 
            task.status === 'completed' || 
            task.status === 'failed' || 
            task.status === 'canceled' || 
            task.status === 'cancelled'
        );

        // Sort by creation time (newest first)
        completedTasks.sort((a, b) => {
            const timeA = new Date(a.created_at || a.createdAt || a.updated_at || a.updatedAt || 0);
            const timeB = new Date(b.created_at || b.createdAt || b.updated_at || b.updatedAt || 0);
            return timeB - timeA;
        });

        // Take only the last 50 tasks for performance
        const recentTasks = completedTasks.slice(0, 50);

        if (recentTasks.length === 0) {
            this.taskHistoryContent.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #666;">
                    <div>No task history available</div>
                </div>
            `;
            return;
        }

        const historyHtml = recentTasks.map(task => {
            const taskTime = new Date(task.created_at || task.createdAt || task.updated_at || task.updatedAt || Date.now());
            const taskType = task.type || 'unknown';
            const taskStatus = task.status || 'unknown';
            const statusColor = this.getTaskHistoryStatusColor(taskStatus);
            
            return `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    border-bottom: 1px solid #eee;
                    transition: background-color 0.2s;
                " onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='transparent'">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="
                            width: 12px;
                            height: 12px;
                            border-radius: 50%;
                            background-color: ${statusColor};
                        "></div>
                        <div>
                            <div style="font-weight: bold; color: #333;">${taskType}</div>
                            <div style="font-size: 12px; color: #666;">
                                Floor: ${task.floor || 'N/A'} | Shelf: ${task.shelfPoint || 'N/A'}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 14px; color: #333;">${taskTime.toLocaleTimeString()}</div>
                        <div style="font-size: 12px; color: #666;">${taskTime.toLocaleDateString()}</div>
                        <div style="
                            font-size: 12px;
                            font-weight: bold;
                            color: ${statusColor};
                            text-transform: uppercase;
                        ">${taskStatus}</div>
                    </div>
                </div>
            `;
        }).join('');

        this.taskHistoryContent.innerHTML = `
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px;">
                ${historyHtml}
            </div>
            <div style="margin-top: 10px; text-align: center; font-size: 12px; color: #666;">
                Showing last ${recentTasks.length} completed tasks
            </div>
        `;
    }

    getTaskHistoryStatusColor(status) {
        switch (status.toLowerCase()) {
            case 'completed':
                return '#4CAF50';
            case 'failed':
                return '#f44336';
            case 'canceled':
            case 'cancelled':
                return '#FF9800';
            default:
                return '#666';
        }
    }

    generate24HourGrid(tasks, robots, currentHour) {
        // Create grid container
        let gridHtml = `
            <div style="
                display: grid;
                grid-template-columns: 80px repeat(24, 1fr);
                grid-template-rows: auto repeat(${robots.length}, 80px);
                gap: 1px;
                background: #ddd;
                border: 1px solid #ccc;
                border-radius: 8px;
                overflow: hidden;
                margin-top: 20px;
            ">
        `;

        // Add header row with hour labels
        gridHtml += `<div style="background: #f8f9fa; padding: 10px; text-align: center; font-weight: bold; border-bottom: 1px solid #ccc;">Robot</div>`;
        for (let hour = 0; hour < 24; hour++) {
            const isCurrentHour = hour === currentHour;
            gridHtml += `
                <div style="
                    background: ${isCurrentHour ? '#e3f2fd' : '#f8f9fa'};
                    padding: 8px 4px;
                    text-align: center;
                    font-weight: bold;
                    font-size: 12px;
                    border-bottom: 1px solid #ccc;
                    border-right: 1px solid #ccc;
                    ${isCurrentHour ? 'border: 2px solid #2196F3;' : ''}
                ">
                    ${hour.toString().padStart(2, '0')}:00
                </div>
            `;
        }

        // Add robot rows
        robots.forEach((robot, robotIndex) => {
            // Robot name column
            gridHtml += `
                <div style="
                    background: #f8f9fa;
                    padding: 10px;
                    text-align: center;
                    font-weight: bold;
                    border-right: 1px solid #ccc;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                ">
                    ${robot.name || robot.serialNumber}
                </div>
            `;

            // Hour columns for this robot
            for (let hour = 0; hour < 24; hour++) {
                const tasksInHour = this.getTasksForHour(tasks, robot.serialNumber, hour);
                const isCurrentHour = hour === currentHour;
                
                gridHtml += `
                    <div style="
                        background: ${isCurrentHour ? '#e3f2fd' : '#fff'};
                        padding: 4px;
                        border-right: 1px solid #ccc;
                        position: relative;
                        min-height: 80px;
                        ${isCurrentHour ? 'border: 2px solid #2196F3;' : ''}
                    ">
                `;

                // Add tasks for this hour
                tasksInHour.forEach(task => {
                    const taskColor = this.getTaskColor(task.status);
                    const taskType = task.type || 'unknown';
                    
                    // Create tooltip with recurring schedule info
                    let tooltip = `${taskType} - ${task.status}`;
                    if (task.status === 'scheduled' && task.schedule && task.schedule.days_of_week) {
                        const days = task.schedule.days_of_week.map(day => 
                            day.charAt(0).toUpperCase() + day.slice(1)
                        ).join(', ');
                        tooltip += `\nRecurs on: ${days}`;
                        if (task.schedule.time) {
                            tooltip += `\nTime: ${task.schedule.time}`;
                        }
                    }
                    
                    gridHtml += `
                        <div style="
                            background: ${taskColor};
                            border: 1px solid #333;
                            border-radius: 4px;
                            padding: 4px;
                            margin: 2px 0;
                            font-size: 10px;
                            cursor: pointer;
                            position: relative;
                            min-height: 20px;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                        " 
                        onclick="taskQueueSystem.showTaskDetails('${task.id}')"
                        title="${tooltip}">
                            <div style="font-weight: bold; font-size: 9px;">${taskType}</div>
                            <div style="font-size: 8px;">${task.status}</div>
                            ${(task.status === 'queued' || task.status === 'in_progress') ? 
                                `<button onclick="event.stopPropagation(); taskQueueSystem.cancelTask('${task.id}')" 
                                    style="position: absolute; top: 2px; right: 2px; background: #ff4444; color: white; border: none; border-radius: 2px; padding: 1px 3px; cursor: pointer; font-size: 8px;">
                                    ×
                                </button>` : ''
                            }
                            ${(task.status === 'scheduled' || task.is_recurring || task.type === 'recurring') ? 
                                `<button onclick="event.stopPropagation(); taskQueueSystem.removeRecurringTask('${task.id}')" 
                                    style="position: absolute; top: 2px; right: 2px; background: #9C27B0; color: white; border: none; border-radius: 2px; padding: 1px 3px; cursor: pointer; font-size: 8px;">
                                    ×
                                </button>` : ''
                            }
                        </div>
                    `;
                });

                gridHtml += `</div>`;
            }
        });

        gridHtml += `</div>`;

        // Add legend
        gridHtml += `
            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0;">Task Status Legend:</h4>
                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <div style="width: 20px; height: 20px; background: #4CAF50; border-radius: 3px;"></div>
                        <span>Completed</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <div style="width: 20px; height: 20px; background: #2196F3; border-radius: 3px;"></div>
                        <span>In Progress</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <div style="width: 20px; height: 20px; background: #FF9800; border-radius: 3px;"></div>
                        <span>Queued</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <div style="width: 20px; height: 20px; background: #9C27B0; border-radius: 3px;"></div>
                        <span>Scheduled</span>
                    </div>
                </div>
            </div>
        `;

        return gridHtml;
    }

    getTasksForHour(tasks, robotSerial, hour) {
        return tasks.filter(task => {
            if (task.robot_serial_number !== robotSerial) return false;
            
            // Handle different task types
            if (task.is_recurring || task.type === 'recurring') {
                // For recurring tasks, check if they should run at this hour
                return this.shouldShowRecurringTask(task, hour);
            } else {
                // For normal tasks, show based on creation time or scheduled time
                const taskTime = new Date(task.created_at || task.createdAt || task.scheduled_time || Date.now());
                const taskHour = taskTime.getHours();
                
                // Show tasks in the hour they were created/scheduled
                return taskHour === hour;
            }
        });
    }

    shouldShowRecurringTask(task, hour) {
        // Check if this recurring task should run at the given hour
        const schedule = task.schedule || {};
        
        // Check if task has specific time defined
        if (schedule.time) {
            const [scheduleHour] = schedule.time.split(':').map(Number);
            if (scheduleHour !== hour) {
                return false;
            }
        }
        
        // Check if task has days of week defined
        if (schedule.days_of_week && Array.isArray(schedule.days_of_week)) {
            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            return schedule.days_of_week.includes(today);
        }
        
        // Default: show recurring tasks every 4 hours if no specific schedule
        return hour % 4 === 0;
    }

    getTaskColor(status) {
        switch (status) {
            case 'completed':
                return '#4CAF50';
            case 'in_progress':
                return '#2196F3';
            case 'queued':
                return '#FF9800';
            case 'scheduled':
                return '#9C27B0'; // Purple for scheduled recurring tasks
            case 'failed':
            case 'cancelled':
                return '#f44336';
            case 'recurring':
                return '#9C27B0';
            default:
                return '#757575';
        }
    }

    showTaskDetails(taskId) {
        // Find the task in the current queue
        const task = this.currentQueue?.find(t => t.id === taskId);
        if (!task) {
            console.log('Task not found:', taskId);
            return;
        }

        // Create a simple modal to show task details
        const modalHtml = `
            <div id="taskModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            ">
                <div style="
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Task Details</h3>
                        <button onclick="document.getElementById('taskModal').remove()" style="
                            background: none;
                            border: none;
                            font-size: 20px;
                            cursor: pointer;
                            color: #666;
                        ">×</button>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>Task ID:</strong> ${task.id}
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>Type:</strong> ${task.type || 'Unknown'}
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>Status:</strong> ${task.status || 'Unknown'}
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>Robot:</strong> ${task.robot_serial_number || 'Unknown'}
                    </div>
                    ${task.floor ? `<div style="margin-bottom: 10px;"><strong>Floor:</strong> ${task.floor}</div>` : ''}
                    ${task.shelfPoint ? `<div style="margin-bottom: 10px;"><strong>Shelf Point:</strong> ${task.shelfPoint}</div>` : ''}
                    ${task.created_at ? `<div style="margin-bottom: 10px;"><strong>Created:</strong> ${new Date(task.created_at).toLocaleString()}</div>` : ''}
                    ${task.completed_at ? `<div style="margin-bottom: 10px;"><strong>Completed:</strong> ${new Date(task.completed_at).toLocaleString()}</div>` : ''}
                    ${task.is_recurring ? `<div style="margin-bottom: 10px;"><strong>Recurring:</strong> Yes</div>` : ''}
                    ${task.schedule ? `<div style="margin-bottom: 10px;"><strong>Schedule:</strong> ${JSON.stringify(task.schedule)}</div>` : ''}
                    <div style="margin-top: 20px; display: flex; gap: 10px;">
                        ${(task.status === 'queued' || task.status === 'in_progress') ? 
                            `<button onclick="taskQueueSystem.cancelTask('${task.id}'); document.getElementById('taskModal').remove();" 
                                style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                                Cancel Task
                            </button>` : ''
                        }
                        ${(task.is_recurring || task.type === 'recurring') ? 
                            `<button onclick="taskQueueSystem.removeRecurringTask('${task.id}'); document.getElementById('taskModal').remove();" 
                                style="background: #9C27B0; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                                Remove Recurring Task
                            </button>` : ''
                        }
                        <button onclick="document.getElementById('taskModal').remove()" style="
                            background: #666; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;
                        ">Close</button>
                    </div>
                </div>
            </div>
        `;

        // Remove any existing modal
        const existingModal = document.getElementById('taskModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add the new modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async cancelTask(taskId) {
        try {
            const response = await fetch(`/api/templates/${this.templateId}/queue/${taskId}/cancel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to cancel task');
            }
            
            // Refresh the task queue
            await this.loadTaskQueue();
        } catch (error) {
            console.error('Error cancelling task:', error);
            alert('Failed to cancel task: ' + error.message);
        }
    }

    async removeRecurringTask(taskId) {
        try {
            if (!confirm('Are you sure you want to remove this recurring task? This will stop all future occurrences.')) {
                return;
            }

            // Extract the actual recurring task ID from the display ID
            let recurringTaskId = taskId;
            if (taskId.startsWith('recurring_')) {
                recurringTaskId = taskId.replace('recurring_', '');
            }

            console.log('Removing recurring task:', {
                taskId: taskId,
                recurringTaskId: recurringTaskId,
                templateId: this.templateId,
                url: `/api/templates/${encodeURIComponent(this.templateId)}/recurring-tasks/${encodeURIComponent(recurringTaskId)}`
            });

            const response = await fetch(`/api/templates/${encodeURIComponent(this.templateId)}/recurring-tasks/${encodeURIComponent(recurringTaskId)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to remove recurring task');
            }
            
            // Refresh the task queue
            await this.loadTaskQueue();
            alert('Recurring task removed successfully');
        } catch (error) {
            console.error('Error removing recurring task:', error);
            alert('Failed to remove recurring task: ' + error.message);
        }
    }

    async goHome(robotSerial) {
        try {
            // Get the template to find the robot and map info
            const template = await this.fetchTemplate(this.templateId);

            // Parse robot data
            let robot = template.robot;
            if (typeof robot === 'string') {
                try { robot = JSON.parse(robot); } catch (e) { robot = null; }
            }
            if (!robot) {
                throw new Error('No robot found in template');
            }

            // Get the robot's maps to find the charger point
            const mapsResponse = await fetch(`/api/robot-maps`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!mapsResponse.ok) {
                throw new Error('Failed to fetch robot maps');
            }
            
            const robotMaps = await mapsResponse.json();
            const robotMap = robotMaps.find(rm => rm.robot.serialNumber === robotSerial);
            
            if (!robotMap || !robotMap.maps || robotMap.maps.length === 0) {
                throw new Error('No maps found for robot');
            }

            // Find the first map with a charger point
            let chargerPoint = null;
            let mapName = null;
            for (const map of robotMap.maps) {
                const features = typeof map.features === 'string' ? JSON.parse(map.features) : map.features;
                const charger = features.find(f => 
                    f.name === 'charger_docking' || 
                    f.name === 'Charging Station_docking' || 
                    f.name === 'charger' || 
                    f.name === 'Charging Station'
                );
                if (charger) {
                    chargerPoint = charger;
                    mapName = map.map_name;
                    break;
                }
            }
            
            if (!chargerPoint) {
                throw new Error('No charger point found in any map');
            }

            // Extract floor number from map name
            const floor = mapName.replace('Floor', '');

            // Queue the return task
            const queueResponse = await fetch(`/api/templates/${this.templateId}/queue-task`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'return_to_charger',
                    floor: floor,
                    shelfPoint: 'charger'
                })
            });

            if (!queueResponse.ok) {
                const errorData = await queueResponse.json();
                throw new Error(errorData.error || 'Failed to queue return task');
            }

            // Refresh the task queue
            await this.loadTaskQueue();
        } catch (error) {
            console.error('Error sending robot home:', error);
            alert('Failed to send robot home: ' + error.message);
        }
    }

    showError(message) {
        this.taskQueueContent.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="color: #f44336; font-size: 18px;">${message}</div>
            </div>
        `;
    }

    goBack() {
        // Go back to the task management page
        if (this.templateId) {
            window.location.href = `task-management.html?templateId=${this.templateId}`;
        } else {
            window.location.href = 'task-management.html';
        }
    }

    updateClock() {
        if (this.clockElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            this.clockElement.textContent = timeString;
        }
    }

    updateCurrentTimeDisplay() {
        const currentTimeDisplay = document.getElementById('currentTimeDisplay');
        if (currentTimeDisplay) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            currentTimeDisplay.textContent = timeString;
        }
    }

    startClock() {
        // Update clock immediately
        this.updateClock();
        // Update clock every second
        setInterval(() => {
            this.updateClock();
        }, 1000);
        
        // Also update current time display in task queue
        this.updateCurrentTimeDisplay();
        setInterval(() => {
            this.updateCurrentTimeDisplay();
        }, 1000);
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

// Initialize the system when the page loads
let taskQueueSystem;
document.addEventListener('DOMContentLoaded', () => {
    taskQueueSystem = new TaskQueueSystem();
}); 
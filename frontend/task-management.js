// Task Management Interface JavaScript
class TaskManagementSystem {
    constructor() {
        this.checkAuthentication();
        this.initializeElements();
        this.setupEventListeners();
        this.startClock();
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        
        if (!token) {
            window.location.href = 'login.html';
            return;
        }
        
        try {
            const userData = JSON.parse(user);
            if (userData && document.getElementById('username')) {
                document.getElementById('username').textContent = userData.username;
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
            window.location.href = 'login.html';
        }
    }

    initializeElements() {
        // Task option buttons
        this.assignTaskOption = document.getElementById('assignTaskOption');
        this.scheduleTaskOption = document.getElementById('scheduleTaskOption');
        this.taskQueueOption = document.getElementById('taskQueueOption');
        
        // Logout button
        this.logoutBtn = document.getElementById('logoutBtn');
        
        // Clock element
        this.clockElement = document.getElementById('clock');
    }

    setupEventListeners() {
        // Assign Task button - redirects to the original user interface
        this.assignTaskOption.addEventListener('click', () => {
            this.navigateToAssignTask();
        });

        // Schedule Recurring Task button
        this.scheduleTaskOption.addEventListener('click', () => {
            this.navigateToScheduleTask();
        });

        // Task Queue button
        this.taskQueueOption.addEventListener('click', () => {
            this.navigateToTaskQueue();
        });

        // Logout button
        this.logoutBtn.addEventListener('click', () => {
            this.logout();
        });
    }

    updateClock() {
        if (this.clockElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            this.clockElement.textContent = timeString;
        }
    }

    startClock() {
        // Update clock immediately
        this.updateClock();
        // Update clock every second
        setInterval(() => {
            this.updateClock();
        }, 1000);
    }

    navigateToAssignTask() {
        // Redirect to the original user interface with pickup/drop-off functionality
        // Get the template ID from the current user's data if available
        const user = JSON.parse(localStorage.getItem('user'));
        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('templateId');
        
        if (templateId) {
            window.location.href = `user-interface.html?templateId=${templateId}`;
        } else {
            window.location.href = 'user-interface.html';
        }
    }

    navigateToScheduleTask() {
        // Redirect to the user interface with recurring flag
        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('templateId');
        
        if (templateId) {
            window.location.href = `user-interface.html?templateId=${templateId}&recurring=true`;
        } else {
            window.location.href = 'user-interface.html?recurring=true';
        }
    }

    navigateToTaskQueue() {
        // Redirect to the task queue page
        // Get the template ID from the current user's data if available
        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('templateId');
        
        if (templateId) {
            window.location.href = `task-queue.html?templateId=${templateId}`;
        } else {
            window.location.href = 'task-queue.html';
        }
    }

    logout() {
        // Clear authentication data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Redirect to login page
        window.location.href = 'login.html';
    }
}

// Initialize the system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TaskManagementSystem();
}); 
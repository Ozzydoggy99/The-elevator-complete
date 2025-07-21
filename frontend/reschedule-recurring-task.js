// Reschedule Recurring Task Page JavaScript
class RescheduleRecurringTaskSystem {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.templateId = null;
        this.currentWorkflow = null;
        
        this.checkAuthentication();
        this.initializeElements();
        this.setupEventListeners();
        this.startClock();
        this.loadTaskDetails();
    }

    checkAuthentication() {
        if (!this.token) {
            window.location.href = 'login.html';
            return;
        }
        
        // Get template ID and workflow from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.templateId = urlParams.get('templateId');
        const workflowData = urlParams.get('workflow');
        
        if (workflowData) {
            try {
                this.currentWorkflow = JSON.parse(decodeURIComponent(workflowData));
            } catch (e) {
                console.error('Error parsing workflow data:', e);
                this.showError('Invalid workflow data');
                return;
            }
        }
        
        if (document.getElementById('username') && this.user) {
            document.getElementById('username').textContent = this.user.username;
        }
    }

    initializeElements() {
        this.taskDetailsElement = document.getElementById('taskDetails');
        this.timeInput = document.getElementById('timeInput');
        this.everydayCheckbox = document.getElementById('everydayCheckbox');
        this.mondayCheckbox = document.getElementById('mondayCheckbox');
        this.tuesdayCheckbox = document.getElementById('tuesdayCheckbox');
        this.wednesdayCheckbox = document.getElementById('wednesdayCheckbox');
        this.thursdayCheckbox = document.getElementById('thursdayCheckbox');
        this.fridayCheckbox = document.getElementById('fridayCheckbox');
        this.saturdayCheckbox = document.getElementById('saturdayCheckbox');
        this.sundayCheckbox = document.getElementById('sundayCheckbox');
        this.confirmBtn = document.getElementById('confirmBtn');
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

        this.confirmBtn.addEventListener('click', () => {
            this.scheduleRecurringTask();
        });

        // Set default time to current time
        const now = new Date();
        this.timeInput.value = now.toTimeString().slice(0, 5);

        // Setup checkbox interactions
        this.setupCheckboxInteractions();
    }

    setupCheckboxInteractions() {
        // Everyday checkbox controls all other checkboxes
        this.everydayCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const dayCheckboxes = [
                this.mondayCheckbox, this.tuesdayCheckbox, this.wednesdayCheckbox,
                this.thursdayCheckbox, this.fridayCheckbox, this.saturdayCheckbox, this.sundayCheckbox
            ];
            
            dayCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
                checkbox.disabled = isChecked;
            });
        });

        // Individual day checkboxes
        const dayCheckboxes = [
            this.mondayCheckbox, this.tuesdayCheckbox, this.wednesdayCheckbox,
            this.thursdayCheckbox, this.fridayCheckbox, this.saturdayCheckbox, this.sundayCheckbox
        ];

        dayCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                // If any individual day is unchecked, uncheck "Everyday"
                if (!checkbox.checked) {
                    this.everydayCheckbox.checked = false;
                }
                
                // If all individual days are checked, check "Everyday"
                const allChecked = dayCheckboxes.every(cb => cb.checked);
                if (allChecked) {
                    this.everydayCheckbox.checked = true;
                }
                
                // Enable/disable individual checkboxes based on "Everyday" state
                const everydayChecked = this.everydayCheckbox.checked;
                dayCheckboxes.forEach(cb => {
                    cb.disabled = everydayChecked;
                });
            });
        });
    }

    loadTaskDetails() {
        if (!this.currentWorkflow) {
            this.showError('No workflow data available');
            return;
        }

        const taskDetailsHtml = `
            <div style="margin-bottom: 8px;"><strong>Type:</strong> ${this.currentWorkflow.type || 'Unknown'}</div>
            <div style="margin-bottom: 8px;"><strong>Floor:</strong> ${this.currentWorkflow.floor || 'Unknown'}</div>
            <div style="margin-bottom: 8px;"><strong>Shelf Point:</strong> ${this.currentWorkflow.shelfPoint || 'Unknown'}</div>
        `;

        this.taskDetailsElement.innerHTML = taskDetailsHtml;
    }

    getSelectedDays() {
        const days = [];
        
        if (this.everydayCheckbox.checked) {
            return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        }
        
        if (this.mondayCheckbox.checked) days.push('monday');
        if (this.tuesdayCheckbox.checked) days.push('tuesday');
        if (this.wednesdayCheckbox.checked) days.push('wednesday');
        if (this.thursdayCheckbox.checked) days.push('thursday');
        if (this.fridayCheckbox.checked) days.push('friday');
        if (this.saturdayCheckbox.checked) days.push('saturday');
        if (this.sundayCheckbox.checked) days.push('sunday');
        
        return days;
    }

    async scheduleRecurringTask() {
        if (!this.currentWorkflow || !this.templateId) {
            this.showError('Missing workflow or template data');
            return;
        }

        const time = this.timeInput.value;
        const selectedDays = this.getSelectedDays();

        if (!time) {
            this.showError('Please select a time');
            return;
        }

        if (selectedDays.length === 0) {
            this.showError('Please select at least one day of the week');
            return;
        }

        try {
            this.confirmBtn.disabled = true;
            this.confirmBtn.textContent = 'Scheduling...';

                    // Create the recurring task
        const response = await fetch(`/api/templates/${this.templateId}/recurring-tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: this.currentWorkflow.type,
                floor: this.currentWorkflow.floor,
                shelfPoint: this.currentWorkflow.shelfPoint,
                schedule: {
                    time: time,
                    days_of_week: selectedDays,
                    is_recurring: true
                }
            })
        });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to schedule recurring task');
            }

            const result = await response.json();
            alert('Recurring task scheduled successfully!');
            
            // Redirect to task queue to see the scheduled task
            window.location.href = `task-queue.html?templateId=${this.templateId}`;

        } catch (error) {
            console.error('Error scheduling recurring task:', error);
            this.showError('Failed to schedule recurring task: ' + error.message);
        } finally {
            this.confirmBtn.disabled = false;
            this.confirmBtn.textContent = 'Schedule Recurring Task';
        }
    }

    showError(message) {
        alert('Error: ' + message);
    }

    goBack() {
        // Go back to the user interface page with the workflow data
        if (this.currentWorkflow) {
            const workflowData = encodeURIComponent(JSON.stringify(this.currentWorkflow));
            window.location.href = `user-interface.html?templateId=${this.templateId}&workflow=${workflowData}`;
        } else {
            window.location.href = `task-management.html?templateId=${this.templateId}`;
        }
    }

    updateClock() {
        if (this.clockElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            this.clockElement.textContent = timeString;
        }
    }

    startClock() {
        this.updateClock();
        setInterval(() => {
            this.updateClock();
        }, 1000);
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

// Initialize the system when the page loads
let rescheduleRecurringTaskSystem;
document.addEventListener('DOMContentLoaded', () => {
    rescheduleRecurringTaskSystem = new RescheduleRecurringTaskSystem();
}); 
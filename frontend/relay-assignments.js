// Relay Assignments System JavaScript
class RelayAssignmentsSystem {
    constructor() {
        // Check authentication first
        this.checkAuth();
        
        this.connectedRelays = [];
        this.templates = [];
        this.selectedRelay = null;
        this.selectedTemplate = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadData();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }
        
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && document.getElementById('username')) {
                document.getElementById('username').textContent = user.username;
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
            window.location.href = 'login.html';
        }
    }

    // API helper function with authentication
    async apiCall(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        const baseUrl = window.location.origin;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };
        
        const response = await fetch(`${baseUrl}${endpoint}`, { ...defaultOptions, ...options });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API request failed');
        }
        
        return response;
    }

    initializeElements() {
        // List elements
        this.connectedRelaysList = document.getElementById('connectedRelaysList');
        this.templateList = document.getElementById('templateList');
        
        // Assignment controls
        this.assignmentControls = document.getElementById('assignmentControls');
        this.relaySelect = document.getElementById('relaySelect');
        this.templateSelect = document.getElementById('templateSelect');
        this.assignmentType = document.getElementById('assignmentType');
        this.assignBtn = document.getElementById('assignBtn');
        this.unassignBtn = document.getElementById('unassignBtn');
        
        // Statistics elements
        this.totalConnected = document.getElementById('totalConnected');
        this.assignedRelays = document.getElementById('assignedRelays');
        this.onlineRelays = document.getElementById('onlineRelays');
        this.totalTemplates = document.getElementById('totalTemplates');
    }

    setupEventListeners() {
        // Assignment controls
        this.relaySelect.addEventListener('change', (e) => {
            this.selectedRelay = e.target.value;
            this.updateAssignmentState();
        });

        this.templateSelect.addEventListener('change', (e) => {
            this.selectedTemplate = e.target.value;
            this.updateAssignmentState();
        });

        this.assignBtn.addEventListener('click', () => {
            this.assignRelay();
        });

        this.unassignBtn.addEventListener('click', () => {
            this.unassignRelay();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    }

    async loadData() {
        await Promise.all([
            this.loadConnectedRelays(),
            this.loadTemplates()
        ]);
        this.updateStatistics();
    }

    async loadConnectedRelays() {
        try {
            const response = await this.apiCall('/api/connected-relays/assignable');
            const data = await response.json();
            this.connectedRelays = data.relays;
                this.renderConnectedRelays();
                this.populateRelaySelect();
        } catch (error) {
            console.error('Error loading connected relays:', error);
            this.showNotification('Error loading connected relays', 'error');
        }
    }

    async loadTemplates() {
        try {
            const response = await this.apiCall('/api/templates');
                this.templates = await response.json();
                this.renderTemplateList();
                this.populateTemplateSelect();
        } catch (error) {
            console.error('Error loading templates:', error);
            this.showNotification('Error loading templates', 'error');
        }
    }

    renderConnectedRelays() {
        this.connectedRelaysList.innerHTML = '';
        
        if (this.connectedRelays.length === 0) {
            this.connectedRelaysList.innerHTML = '<p>No unassigned relays available. All relays in the system have been assigned to templates. Check the "Assigned Relays" page to see current assignments.</p>';
            return;
        }
        
        this.connectedRelays.forEach(relay => {
            const relayEl = document.createElement('div');
            relayEl.className = 'connected-relay';
            relayEl.dataset.relayMac = relay.mac;
            
            const capabilities = relay.capabilities || [];
            const capabilitiesText = capabilities.length > 0 ? capabilities.join(', ') : 'No capabilities defined';
            
            relayEl.innerHTML = `
                <div class="relay-header">
                    <div class="relay-name">${relay.name}</div>
                    <div class="relay-status status-${relay.status}">${relay.status.toUpperCase()}</div>
                </div>
                <div class="relay-details">
                    <div><strong>MAC:</strong> ${relay.mac}</div>
                    <div><strong>Location:</strong> ${relay.location || 'Not specified'}</div>
                    <div><strong>IP:</strong> ${relay.ip || 'Unknown'}:${relay.port || 81}</div>
                    <div><strong>Configuration:</strong> ${relay.config_name || 'Unknown'}</div>
                    <div><strong>Last Seen:</strong> ${relay.last_seen ? new Date(relay.last_seen).toLocaleString() : 'Never'}</div>
                </div>
                <div class="relay-capabilities">
                    <strong>Capabilities:</strong> ${capabilitiesText}
                </div>
                <div class="relay-assignments">
                    <strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Available for Assignment</span>
                </div>
            `;
            
            relayEl.addEventListener('click', () => {
                this.selectRelay(relay.mac);
            });
            
            this.connectedRelaysList.appendChild(relayEl);
        });
    }

    renderTemplateList() {
        this.templateList.innerHTML = '';
        
        this.templates.forEach(template => {
            const templateEl = document.createElement('div');
            templateEl.className = 'template-item';
            templateEl.dataset.templateId = template.id;
            
            templateEl.innerHTML = `
                <div class="template-name">${template.name}</div>
                <div class="template-type">${template.color} - ${template.description || 'No description'}</div>
            `;
            
            templateEl.addEventListener('click', () => {
                this.selectTemplate(template.id);
            });
            
            this.templateList.appendChild(templateEl);
        });
    }

    populateRelaySelect() {
        this.relaySelect.innerHTML = '<option value="">Select a relay...</option>';
        
        this.connectedRelays.forEach(relay => {
            const option = document.createElement('option');
            option.value = relay.mac;
            option.textContent = `${relay.name} (${relay.mac})`;
            this.relaySelect.appendChild(option);
        });
    }

    populateTemplateSelect() {
        this.templateSelect.innerHTML = '<option value="">Select a template...</option>';
        
        this.templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} (${template.color})`;
            this.templateSelect.appendChild(option);
        });
    }

    selectRelay(relayMac) {
        // Remove previous selection
        document.querySelectorAll('.connected-relay').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        const relayEl = document.querySelector(`[data-relay-mac="${relayMac}"]`);
        if (relayEl) {
            relayEl.classList.add('selected');
        }
        
        this.selectedRelay = relayMac;
        this.relaySelect.value = relayMac;
        this.showAssignmentControls();
        this.updateAssignmentState();
    }

    selectTemplate(templateId) {
        // Remove previous selection
        document.querySelectorAll('.template-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        const templateEl = document.querySelector(`[data-template-id="${templateId}"]`);
        if (templateEl) {
            templateEl.classList.add('selected');
        }
        
        this.selectedTemplate = templateId;
        this.templateSelect.value = templateId;
        this.updateAssignmentState();
    }

    showAssignmentControls() {
        this.assignmentControls.style.display = 'block';
    }

    updateAssignmentState() {
        const canAssign = this.selectedRelay && this.selectedTemplate;
        this.assignBtn.disabled = !canAssign;
        
        // Since we're only showing unassigned relays, the unassign button should be disabled
        this.unassignBtn.disabled = true;
    }

    async assignRelay() {
        if (!this.selectedRelay || !this.selectedTemplate) {
            this.showNotification('Please select both a relay and template', 'error');
            return;
        }

        try {
            const response = await this.apiCall('/api/relay-assignments/by-mac', {
                method: 'POST',
                body: JSON.stringify({
                    mac_address: this.selectedRelay,
                    template_id: this.selectedTemplate,
                    assignment_type: this.assignmentType.value
                })
            });

                const assignment = await response.json();
                
                // Refresh data since the relay will no longer appear in unassigned list
                this.selectedRelay = null;
                this.selectedTemplate = null;
                this.relaySelect.value = '';
                this.templateSelect.value = '';
                this.assignmentControls.style.display = 'none';
                
                await this.loadConnectedRelays();
                this.renderTemplateList();
                this.updateStatistics();
                this.showNotification('Relay assigned successfully', 'success');
        } catch (error) {
            console.error('Error assigning relay:', error);
            this.showNotification('Error assigning relay: ' + error.message, 'error');
        }
    }

    async unassignRelay() {
        if (!this.selectedRelay || !this.selectedTemplate) {
            this.showNotification('Please select both a relay and template', 'error');
            return;
        }

        try {
            await this.apiCall(`/api/relay-assignments/by-mac/${this.selectedRelay}/${this.selectedTemplate}`, {
                method: 'DELETE'
            });

                // Update local data
            const relay = this.connectedRelays.find(r => r.mac === this.selectedRelay);
                if (relay) {
                relay.assignments = relay.assignments.filter(a => a.template_id != this.selectedTemplate);
                }
                
                this.renderConnectedRelays();
                this.renderTemplateList();
                this.updateStatistics();
            this.showNotification('Relay assignment removed successfully', 'success');
        } catch (error) {
            console.error('Error removing assignment:', error);
            this.showNotification('Error removing assignment: ' + error.message, 'error');
        }
    }

    updateStatistics() {
        const totalRelays = this.connectedRelays.length;
        const assignedRelays = this.connectedRelays.filter(r => r.assignments.length > 0).length;
        const onlineRelays = this.connectedRelays.filter(r => r.status === 'online').length;
        const offlineRelays = this.connectedRelays.filter(r => r.status === 'offline').length;
        const totalTemplates = this.templates.length;

        this.totalConnected.textContent = totalRelays;
        this.assignedRelays.textContent = assignedRelays;
        this.onlineRelays.textContent = onlineRelays;
        this.totalTemplates.textContent = totalTemplates;
        
        // Update offline count if element exists
        const offlineElement = document.getElementById('offlineRelays');
        if (offlineElement) {
            offlineElement.textContent = offlineRelays;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const container = document.getElementById('notificationContainer');
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize the relay assignments system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const assignmentsSystem = new RelayAssignmentsSystem();
    
    // Make it globally accessible for debugging
    window.assignmentsSystem = assignmentsSystem;
}); 
 
 
 
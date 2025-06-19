// Relay Registration System JavaScript
class RelayRegistrationSystem {
    constructor() {
        this.selectedRelayId = null;
        this.relays = [];
        this.robots = [];
        this.templates = [];
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadData();
    }

    initializeElements() {
        // Form elements
        this.relayForm = document.getElementById('relayForm');
        this.relayId = document.getElementById('relayId');
        this.relayName = document.getElementById('relayName');
        this.relayType = document.getElementById('relayType');
        this.relayIp = document.getElementById('relayIp');
        this.relayPort = document.getElementById('relayPort');
        this.relayDescription = document.getElementById('relayDescription');
        
        // Capability checkboxes
        this.capabilityCheckboxes = document.querySelectorAll('input[type="checkbox"][value]');
        
        // Association elements
        this.robotSelect = document.getElementById('robotSelect');
        this.templateSelect = document.getElementById('templateSelect');
        this.associateBtn = document.getElementById('associateBtn');
        this.disassociateBtn = document.getElementById('disassociateBtn');
        
        // List elements
        this.relayList = document.getElementById('relayList');
        
        // Statistics elements
        this.totalRelays = document.getElementById('totalRelays');
        this.onlineRelays = document.getElementById('onlineRelays');
        this.offlineRelays = document.getElementById('offlineRelays');
        this.errorRelays = document.getElementById('errorRelays');
    }

    setupEventListeners() {
        // Form submission
        this.relayForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.registerRelay();
        });

        // Relay type change
        this.relayType.addEventListener('change', () => {
            this.updateCapabilitiesForType();
        });

        // Association controls
        this.associateBtn.addEventListener('click', () => this.associateRelay());
        this.disassociateBtn.addEventListener('click', () => this.disassociateRelay());

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    async loadData() {
        try {
            // Load relays
            await this.loadRelays();
            
            // Load robots
            await this.loadRobots();
            
            // Load templates
            await this.loadTemplates();
            
            // Update statistics
            this.updateStatistics();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Error loading data: ' + error.message, 'error');
        }
    }

    async loadRelays() {
        try {
            const response = await fetch('/api/relays');
            if (response.ok) {
                this.relays = await response.json();
                this.renderRelayList();
            } else {
                throw new Error('Failed to load relays');
            }
        } catch (error) {
            console.error('Error loading relays:', error);
            // For demo purposes, create some sample relays
            this.relays = [
                {
                    id: 'elevator-001',
                    name: 'Main Building Elevator',
                    type: 'elevator',
                    ip: '192.168.1.100',
                    port: 81,
                    status: 'online',
                    capabilities: ['door_control', 'floor_selection', 'status_monitoring'],
                    robotId: 'robot-001',
                    templateId: 'template-001'
                },
                {
                    id: 'door-001',
                    name: 'Warehouse Door',
                    type: 'door',
                    ip: '192.168.1.101',
                    port: 81,
                    status: 'offline',
                    capabilities: ['door_control', 'status_monitoring'],
                    robotId: null,
                    templateId: null
                }
            ];
            this.renderRelayList();
        }
    }

    async loadRobots() {
        try {
            const response = await fetch('/api/robots');
            if (response.ok) {
                this.robots = await response.json();
            } else {
                // For demo purposes, create sample robots
                this.robots = [
                    { id: 'robot-001', name: 'Robot Alpha', serialNumber: 'L382502104987ir' },
                    { id: 'robot-002', name: 'Robot Beta', serialNumber: 'L382502104988ir' }
                ];
            }
            this.populateRobotSelect();
        } catch (error) {
            console.error('Error loading robots:', error);
        }
    }

    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            if (response.ok) {
                this.templates = await response.json();
            } else {
                // For demo purposes, create sample templates
                this.templates = [
                    { id: 'template-001', name: 'Multi-Floor Pickup', type: 'pickup' },
                    { id: 'template-002', name: 'Single Floor Dropoff', type: 'dropoff' }
                ];
            }
            this.populateTemplateSelect();
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    populateRobotSelect() {
        this.robotSelect.innerHTML = '<option value="">Select Robot</option>';
        this.robots.forEach(robot => {
            const option = document.createElement('option');
            option.value = robot.id;
            option.textContent = `${robot.name} (${robot.serialNumber})`;
            this.robotSelect.appendChild(option);
        });
    }

    populateTemplateSelect() {
        this.templateSelect.innerHTML = '<option value="">Select Template</option>';
        this.templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} (${template.type})`;
            this.templateSelect.appendChild(option);
        });
    }

    updateCapabilitiesForType() {
        const type = this.relayType.value;
        
        // Reset all checkboxes
        this.capabilityCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Set default capabilities based on type
        switch (type) {
            case 'elevator':
                this.setCapability('door_control', true);
                this.setCapability('floor_selection', true);
                this.setCapability('status_monitoring', true);
                this.setCapability('emergency_stop', true);
                break;
            case 'door':
                this.setCapability('door_control', true);
                this.setCapability('status_monitoring', true);
                break;
            case 'light':
                this.setCapability('light_control', true);
                this.setCapability('status_monitoring', true);
                break;
            case 'gate':
                this.setCapability('gate_control', true);
                this.setCapability('status_monitoring', true);
                break;
        }
    }

    setCapability(capability, checked) {
        const checkbox = document.getElementById(`cap_${capability}`);
        if (checkbox) {
            checkbox.checked = checked;
        }
    }

    getSelectedCapabilities() {
        const capabilities = [];
        this.capabilityCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                capabilities.push(checkbox.value);
            }
        });
        return capabilities;
    }

    async registerRelay() {
        const relayData = {
            id: this.relayId.value,
            name: this.relayName.value,
            type: this.relayType.value,
            ip: this.relayIp.value,
            port: parseInt(this.relayPort.value),
            description: this.relayDescription.value,
            capabilities: this.getSelectedCapabilities()
        };

        try {
            const response = await fetch('/api/relays', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(relayData)
            });

            if (response.ok) {
                const newRelay = await response.json();
                this.relays.push(newRelay);
                this.renderRelayList();
                this.updateStatistics();
                this.relayForm.reset();
                this.showNotification('Relay registered successfully', 'success');
            } else {
                throw new Error('Failed to register relay');
            }
        } catch (error) {
            console.error('Error registering relay:', error);
            this.showNotification('Error registering relay: ' + error.message, 'error');
        }
    }

    renderRelayList() {
        this.relayList.innerHTML = '';
        
        this.relays.forEach(relay => {
            const relayEl = document.createElement('div');
            relayEl.className = 'relay-item';
            relayEl.dataset.relayId = relay.id;
            
            relayEl.innerHTML = `
                <div class="relay-header">
                    <div class="relay-name">${relay.name}</div>
                    <div class="relay-status status-${relay.status}">${relay.status.toUpperCase()}</div>
                </div>
                <div class="relay-details">
                    <div><strong>ID:</strong> ${relay.id}</div>
                    <div><strong>Type:</strong> ${relay.type}</div>
                    <div><strong>IP:</strong> ${relay.ip}:${relay.port}</div>
                    <div><strong>Capabilities:</strong> ${relay.capabilities.join(', ')}</div>
                </div>
                <div class="relay-associations">
                    ${relay.robotId ? `<span class="association-tag robot">Robot: ${this.getRobotName(relay.robotId)}</span>` : ''}
                    ${relay.templateId ? `<span class="association-tag template">Template: ${this.getTemplateName(relay.templateId)}</span>` : ''}
                </div>
            `;
            
            relayEl.addEventListener('click', () => {
                this.selectRelay(relay.id);
            });
            
            this.relayList.appendChild(relayEl);
        });
    }

    selectRelay(relayId) {
        // Remove previous selection
        document.querySelectorAll('.relay-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        const relayEl = document.querySelector(`[data-relay-id="${relayId}"]`);
        if (relayEl) {
            relayEl.classList.add('selected');
        }
        
        this.selectedRelayId = relayId;
        
        // Update association controls
        const relay = this.relays.find(r => r.id === relayId);
        if (relay) {
            this.robotSelect.value = relay.robotId || '';
            this.templateSelect.value = relay.templateId || '';
        }
    }

    getRobotName(robotId) {
        const robot = this.robots.find(r => r.id === robotId);
        return robot ? robot.name : 'Unknown';
    }

    getTemplateName(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        return template ? template.name : 'Unknown';
    }

    async associateRelay() {
        if (!this.selectedRelayId) {
            this.showNotification('Please select a relay first', 'error');
            return;
        }

        const robotId = this.robotSelect.value;
        const templateId = this.templateSelect.value;

        try {
            const response = await fetch(`/api/relays/${this.selectedRelayId}/associate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ robotId, templateId })
            });

            if (response.ok) {
                // Update local data
                const relay = this.relays.find(r => r.id === this.selectedRelayId);
                if (relay) {
                    relay.robotId = robotId || null;
                    relay.templateId = templateId || null;
                }
                
                this.renderRelayList();
                this.showNotification('Relay associated successfully', 'success');
            } else {
                throw new Error('Failed to associate relay');
            }
        } catch (error) {
            console.error('Error associating relay:', error);
            this.showNotification('Error associating relay: ' + error.message, 'error');
        }
    }

    async disassociateRelay() {
        if (!this.selectedRelayId) {
            this.showNotification('Please select a relay first', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/relays/${this.selectedRelayId}/disassociate`, {
                method: 'POST'
            });

            if (response.ok) {
                // Update local data
                const relay = this.relays.find(r => r.id === this.selectedRelayId);
                if (relay) {
                    relay.robotId = null;
                    relay.templateId = null;
                }
                
                this.renderRelayList();
                this.robotSelect.value = '';
                this.templateSelect.value = '';
                this.showNotification('Relay disassociated successfully', 'success');
            } else {
                throw new Error('Failed to disassociate relay');
            }
        } catch (error) {
            console.error('Error disassociating relay:', error);
            this.showNotification('Error disassociating relay: ' + error.message, 'error');
        }
    }

    updateStatistics() {
        const total = this.relays.length;
        const online = this.relays.filter(r => r.status === 'online').length;
        const offline = this.relays.filter(r => r.status === 'offline').length;
        const error = this.relays.filter(r => r.status === 'error').length;

        this.totalRelays.textContent = total;
        this.onlineRelays.textContent = online;
        this.offlineRelays.textContent = offline;
        this.errorRelays.textContent = error;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        // Set background color based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#4CAF50';
                break;
            case 'error':
                notification.style.backgroundColor = '#f44336';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ff9800';
                break;
            default:
                notification.style.backgroundColor = '#2196F3';
        }

        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize the relay registration system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const relaySystem = new RelayRegistrationSystem();
    
    // Make it globally accessible for debugging
    window.relaySystem = relaySystem;
}); 
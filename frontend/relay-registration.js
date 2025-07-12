// Relay Configuration Registration System JavaScript
class RelayConfigurationSystem {
    constructor() {
        this.configurations = [];
        this.checkAuthentication();
        this.initializeElements();
        this.loadConfigurations();
        this.setupEventListeners();
    }

    initializeElements() {
        // Form elements
        this.relayForm = document.getElementById('relayForm');
        this.relayId = document.getElementById('relayId');
        this.relayName = document.getElementById('relayName');
        this.ssid = document.getElementById('wifiSSID');
        this.password = document.getElementById('wifiPassword');
        this.macAddress = document.getElementById('macAddress');
        
        // List elements
        this.relayList = document.getElementById('relayList');
        
        // Statistics elements
        this.totalConfigs = document.getElementById('totalConfigs');
        this.totalConnected = document.getElementById('totalConnected');
        this.onlineRelays = document.getElementById('onlineRelays');
        this.offlineRelays = document.getElementById('offlineRelays');
    }

    setupEventListeners() {
        this.relayForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.registerConfiguration();
        });

        // Add logout functionality
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    async loadConfigurations() {
        try {
            const response = await apiCall('/api/relay-configurations');
            if (response.ok) {
                this.configurations = await response.json();
                this.renderConfigurationList();
            } else {
                throw new Error('Failed to load configurations');
            }
        } catch (error) {
            console.error('Error loading configurations:', error);
            // For demo purposes, create some sample configurations
            this.configurations = [
                {
                    id: 1,
                    relay_id: 'elevator-main-001',
                    relay_name: 'Main Building Elevator',
                    ssid: 'Skytech_Robots',
                    created_at: '2024-01-15T10:30:00Z'
                },
                {
                    id: 2,
                    relay_id: 'elevator-floors-001',
                    relay_name: 'Floors Only Relay',
                    ssid: 'Skytech_Robots',
                    created_at: '2024-01-16T14:20:00Z'
                }
            ];
            this.renderConfigurationList();
        }
    }

    async registerConfiguration() {
        try {
            // Validate MAC address format if provided
            const macAddress = this.macAddress.value.trim();
            if (macAddress && !this.isValidMacAddress(macAddress)) {
                this.showNotification('Invalid MAC address format. Use format: AA:BB:CC:DD:EE:FF', 'error');
                return;
            }

            const configData = {
                relay_id: this.relayId.value,
                relay_name: this.relayName.value,
                ssid: this.ssid.value,
                password: this.password.value,
                mac_address: macAddress || null
            };

            const response = await apiCall('/api/relay-configurations', {
                method: 'POST',
                body: JSON.stringify(configData)
            });

            if (response.ok) {
                const newConfig = await response.json();
                this.configurations.push(newConfig);
                this.renderConfigurationList();
                this.relayForm.reset();
                this.showNotification('Relay registered successfully', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to register relay');
            }
        } catch (error) {
            console.error('Error registering relay:', error);
            this.showNotification(error.message, 'error');
        }
    }

    renderConfigurationList() {
        this.relayList.innerHTML = '';
        
        this.configurations.forEach(config => {
            const configEl = document.createElement('div');
            configEl.className = 'relay-item';
            configEl.dataset.configId = config.id;
            
            const macDisplay = config.mac_address ? `<div><strong>MAC:</strong> ${config.mac_address}</div>` : '';
            
            configEl.innerHTML = `
                <div class="relay-header">
                    <div class="relay-name">${config.relay_name}</div>
                </div>
                <div class="relay-details">
                    <div><strong>ID:</strong> ${config.relay_id}</div>
                    <div><strong>WiFi:</strong> ${config.ssid}</div>
                    ${macDisplay}
                    <div><strong>Created:</strong> ${new Date(config.created_at).toLocaleDateString()}</div>
                </div>
            `;
            
            configEl.addEventListener('click', () => {
                this.selectConfiguration(config.id);
            });
            
            this.relayList.appendChild(configEl);
        });
    }

    selectConfiguration(configId) {
        // Remove active class from all items
        document.querySelectorAll('.relay-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to selected item
        const selectedItem = document.querySelector(`[data-config-id="${configId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const container = document.getElementById('notificationContainer');
        container.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove notification after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => container.removeChild(notification), 300);
        }, 5000);
    }

    isValidMacAddress(mac) {
        // MAC address format: AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        return macRegex.test(mac);
    }

    logout() {
        // Clear authentication data
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        
        // Redirect to login page
        window.location.href = 'login.html';
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        const username = localStorage.getItem('username');
        
        if (!token) {
            // No token found, redirect to login
            window.location.href = 'login.html';
            return;
        }
        
        // Display username
        const usernameElement = document.getElementById('username');
        if (usernameElement && username) {
            usernameElement.textContent = username;
        }
    }
}

// Initialize the system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new RelayConfigurationSystem();
});

// Global function for clearing form
function clearForm() {
    document.getElementById('relayForm').reset();
}

function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const baseUrl = window.location.origin;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    return fetch(`${baseUrl}${endpoint}`, { ...defaultOptions, ...options });
} 
 // Global function for clearing form
function clearForm() {
    document.getElementById('relayForm').reset();
}

function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const baseUrl = window.location.origin;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    return fetch(`${baseUrl}${endpoint}`, { ...defaultOptions, ...options });
} 
 


// Relay Programming System JavaScript
class RelayProgrammingSystem {
    constructor() {
        this.selectedPort = null;
        this.selectedConfig = null;
        this.isConnected = false;
        this.isProgramming = false;
        this.configurations = [];
        this.availablePorts = [];
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadData();
        this.scanPorts();
    }

    initializeElements() {
        // Connection elements
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        // Port elements
        this.portList = document.getElementById('portList');
        this.refreshPortsBtn = document.getElementById('refreshPortsBtn');
        
        // Configuration elements
        this.configSelect = document.getElementById('configSelect');
        
        // Control buttons
        this.connectBtn = document.getElementById('connectBtn');
        this.programBtn = document.getElementById('programBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        
        // Progress elements
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        // Log elements
        this.logContainer = document.getElementById('logContainer');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.exportLogBtn = document.getElementById('exportLogBtn');
        
        // Available relays list
        this.availableRelayList = document.getElementById('availableRelayList');
    }

    setupEventListeners() {
        // Port refresh
        if (this.refreshPortsBtn) {
            this.refreshPortsBtn.addEventListener('click', () => {
                this.scanPorts();
            });
        }

        // Configuration selection
        if (this.configSelect) {
            this.configSelect.addEventListener('change', (e) => {
                this.selectedConfig = e.target.value;
                this.updateProgrammingState();
            });
        }

        // Control buttons
        if (this.connectBtn) {
            this.connectBtn.addEventListener('click', () => {
                this.connectToRelay();
            });
        }

        if (this.programBtn) {
            this.programBtn.addEventListener('click', () => {
                this.programRelay();
            });
        }

        if (this.disconnectBtn) {
            this.disconnectBtn.addEventListener('click', () => {
                this.disconnectFromRelay();
            });
        }

        // Log buttons
        if (this.clearLogBtn) {
            this.clearLogBtn.addEventListener('click', () => {
                this.clearLog();
            });
        }

        if (this.exportLogBtn) {
            this.exportLogBtn.addEventListener('click', () => {
                this.exportLog();
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        }
    }

    async loadData() {
        try {
            const response = await apiCall('/api/relay-configurations');
            if (response.ok) {
                this.configurations = await response.json();
                this.populateConfigurationSelect();
                this.renderAvailableRelays();
            } else {
                throw new Error('Failed to load configurations');
            }
        } catch (error) {
            console.error('Error loading configurations:', error);
            this.log('Error loading configurations: ' + error.message, 'error');
        }
    }

    populateConfigurationSelect() {
        if (!this.configSelect) return;
        
        this.configSelect.innerHTML = '<option value="">Select a configuration...</option>';
        
        this.configurations.forEach(config => {
            const option = document.createElement('option');
            option.value = config.id;
            option.textContent = `${config.relay_name} (${config.relay_id})`;
            this.configSelect.appendChild(option);
        });
    }

    renderAvailableRelays() {
        if (!this.availableRelayList) return;
        
        this.availableRelayList.innerHTML = '';
        
        if (this.configurations.length === 0) {
            this.availableRelayList.innerHTML = '<div class="relay-item">No relay configurations available</div>';
            return;
        }
        
        this.configurations.forEach(config => {
            const relayEl = document.createElement('div');
            relayEl.className = 'relay-item';
            relayEl.dataset.configId = config.id;
            
            relayEl.innerHTML = `
                <div class="relay-header">
                    <div class="relay-name">${config.relay_name}</div>
                </div>
                <div class="relay-details">
                    <div><strong>ID:</strong> ${config.relay_id}</div>
                    <div><strong>WiFi:</strong> ${config.ssid}</div>
                    <div><strong>Server:</strong> skytechautomated.com:3000</div>
                </div>
            `;
            
            relayEl.addEventListener('click', () => {
                this.selectConfiguration(config.id);
            });
            
            this.availableRelayList.appendChild(relayEl);
        });
    }

    selectConfiguration(configId) {
        if (!this.configSelect) return;
        
        this.configSelect.value = configId;
        this.selectedConfig = configId;
        this.updateProgrammingState();
        this.log(`Selected configuration: ${this.getConfigName(configId)}`, 'info');
    }

    async scanPorts() {
        this.log('Scanning for available ports...', 'info');
        
        try {
            const response = await apiCall('/api/relay-programming/ports');
            
            if (response.status === 401 || response.status === 403) {
                // Authentication error - redirect to login
                this.log('Authentication failed. Redirecting to login...', 'error');
                this.showNotification('Session expired. Please log in again.', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return;
            }
            
            if (response.ok) {
                this.availablePorts = await response.json();
                this.renderPortList();
                this.log(`Found ${this.availablePorts.length} available port(s)`, 'success');
            } else {
                throw new Error('Failed to scan ports');
            }
        } catch (error) {
            console.error('Error scanning ports:', error);
            this.log('Error scanning ports: ' + error.message, 'error');
            this.showNotification('Failed to scan ports. Please check your connection.', 'error');
        }
    }

    renderPortList() {
        if (!this.portList) return;
        
        this.portList.innerHTML = '';
        
        if (this.availablePorts.length === 0) {
            this.portList.innerHTML = '<div class="port-item">No ports found</div>';
            return;
        }
        
        this.availablePorts.forEach(port => {
            const portEl = document.createElement('div');
            portEl.className = 'port-item';
            portEl.dataset.port = port.path;
            portEl.innerHTML = `
                <div><strong>${port.path}</strong></div>
                <div style="font-size: 12px; color: #666;">
                    ${port.manufacturer || 'Unknown'} - ${port.serialNumber || 'No Serial'}
                </div>
            `;
            
            portEl.addEventListener('click', () => {
                this.selectPort(port.path);
            });
            
            this.portList.appendChild(portEl);
        });
    }

    selectPort(portPath) {
        // Remove previous selection
        document.querySelectorAll('.port-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        const portEl = document.querySelector(`[data-port="${portPath}"]`);
        if (portEl) {
            portEl.classList.add('selected');
        }
        
        this.selectedPort = portPath;
        this.updateProgrammingState();
        this.log(`Selected port: ${portPath}`, 'info');
    }

    updateProgrammingState() {
        const canConnect = this.selectedPort && !this.isConnected;
        const canProgram = this.isConnected && this.selectedConfig && !this.isProgramming;
        const canDisconnect = this.isConnected;
        
        if (this.connectBtn) this.connectBtn.disabled = !canConnect;
        if (this.programBtn) this.programBtn.disabled = !canProgram;
        if (this.disconnectBtn) this.disconnectBtn.disabled = !canDisconnect;
    }

    async connectToRelay() {
        if (!this.selectedPort) {
            this.showNotification('Please select a port first', 'error');
            return;
        }

        this.log(`Connecting to ${this.selectedPort}...`, 'info');
        this.updateConnectionStatus('connecting');

        try {
            const response = await apiCall('/api/relay-programming/connect', {
                method: 'POST',
                body: JSON.stringify({ port: this.selectedPort })
            });

            if (response.status === 401 || response.status === 403) {
                // Authentication error - redirect to login
                this.log('Authentication failed. Redirecting to login...', 'error');
                this.showNotification('Session expired. Please log in again.', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return;
            }

            if (response.ok) {
                const result = await response.json();
                this.isConnected = true;
                this.updateConnectionStatus('connected');
                this.updateProgrammingState();
                this.log(`Connected to ${this.selectedPort}`, 'success');
                this.showNotification('Connected to relay successfully', 'success');
            } else {
                throw new Error('Failed to connect to relay');
            }
        } catch (error) {
            console.error('Error connecting to relay:', error);
            this.updateConnectionStatus('disconnected');
            this.log('Error connecting to relay: ' + error.message, 'error');
            this.showNotification('Failed to connect to relay', 'error');
        }
    }

    async programRelay() {
        if (!this.selectedConfig) {
            this.showNotification('Please select a configuration first', 'error');
            return;
        }

        this.isProgramming = true;
        this.updateProgrammingState();
        this.showProgress(true);

        this.log('🚀 Starting relay programming...', 'info');
        this.log(`📋 Configuration: ${this.getConfigName(this.selectedConfig)}`, 'info');
        this.log(`📡 Port: ${this.selectedPort}`, 'info');
        this.updateProgress(10, 'Initializing programming...');

        // Add timeout for the entire operation
        const programmingTimeout = setTimeout(() => {
            this.log('⏰ Programming operation timed out after 2 minutes', 'error');
            this.showNotification('Programming timed out. Please check the device and try again.', 'error');
            this.isProgramming = false;
            this.updateProgrammingState();
            this.showProgress(false);
            this.updateProgress(0, 'Operation timed out');
        }, 120000); // 2 minute timeout

        try {
            const response = await apiCall('/api/relay-programming/program', {
                method: 'POST',
                body: JSON.stringify({
                    port: this.selectedPort,
                    configId: this.selectedConfig
                })
            });

            clearTimeout(programmingTimeout);

            if (response.status === 401 || response.status === 403) {
                // Authentication error - redirect to login
                this.log('❌ Authentication failed. Redirecting to login...', 'error');
                this.showNotification('Session expired. Please log in again.', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return;
            }

            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    this.log('✅ Programming completed successfully!', 'success');
                    this.log(`🏷️  Relay ID: ${result.relay_id}`, 'info');
                    this.log(`🌐 IP Address: ${result.ip_address}`, 'info');
                    this.log(`🔧 Channels: ${result.details?.channels || 'Unknown'}`, 'info');
                    this.log(`📥 Input pins: ${result.details?.inputPins?.join(', ') || 'Unknown'}`, 'info');
                    this.log(`📤 Output pins: ${result.details?.outputPins?.join(', ') || 'Unknown'}`, 'info');
                    
                    if (result.details?.response) {
                        this.log(`📥 Device response: ${result.details.response}`, 'info');
                    }
                    
                    this.showNotification('🎉 Relay programmed successfully!', 'success');
                    this.updateProgress(100, 'Programming completed successfully');
                } else {
                    this.log(`❌ Programming failed: ${result.error}`, 'error');
                    if (result.details) {
                        this.log(`💡 Details: ${result.details}`, 'error');
                    }
                    this.showNotification(`Programming failed: ${result.error}`, 'error');
                    this.updateProgress(0, 'Programming failed');
                }
            } else {
                const error = await response.json();
                this.log(`❌ Server error: ${error.error || 'Unknown error'}`, 'error');
                throw new Error(error.error || 'Programming failed');
            }
        } catch (error) {
            clearTimeout(programmingTimeout);
            console.error('Error programming relay:', error);
            this.log(`❌ Error programming relay: ${error.message}`, 'error');
            this.showNotification(`Failed to program relay: ${error.message}`, 'error');
            this.updateProgress(0, 'Programming failed');
        }

        this.isProgramming = false;
        this.updateProgrammingState();
        this.showProgress(false);
    }

    async disconnectFromRelay() {
        this.log('Disconnecting from relay...', 'info');

        try {
            const response = await apiCall('/api/relay-programming/disconnect', {
                method: 'POST'
            });

            if (response.ok) {
                this.isConnected = false;
                this.updateConnectionStatus('disconnected');
                this.log('Disconnected from relay', 'info');
                this.showNotification('Relay disconnected', 'success');
            } else {
                throw new Error('Failed to disconnect');
            }
        } catch (error) {
            console.error('Error disconnecting from relay:', error);
            this.log('Error disconnecting from relay: ' + error.message, 'error');
        }

        this.updateProgrammingState();
    }

    updateConnectionStatus(status) {
        if (!this.statusIndicator || !this.statusText) return;
        
        this.statusIndicator.className = `status-indicator status-${status}`;
        
        switch (status) {
            case 'connected':
                this.statusText.textContent = 'Connected';
                break;
            case 'connecting':
                this.statusText.textContent = 'Connecting...';
                break;
            case 'disconnected':
                this.statusText.textContent = 'Disconnected';
                break;
        }
    }

    showProgress(show) {
        if (!this.progressContainer) return;
        
        this.progressContainer.style.display = show ? 'block' : 'none';
        if (!show) {
            this.updateProgress(0, 'Ready to program');
        }
    }

    updateProgress(percentage, text) {
        if (!this.progressFill || !this.progressText) return;
        
        this.progressFill.style.width = `${percentage}%`;
        this.progressText.textContent = text;
    }

    log(message, type = 'info') {
        if (!this.logContainer) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.logContainer.appendChild(logEntry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    clearLog() {
        if (!this.logContainer) return;
        this.logContainer.innerHTML = '';
    }

    exportLog() {
        if (!this.logContainer) return;
        
        const logText = this.logContainer.textContent;
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `relay-programming-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getConfigName(configId) {
        const config = this.configurations.find(c => c.id == configId);
        return config ? config.relay_name : 'Unknown';
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Hide and remove notification
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (container.contains(notification)) {
                    container.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the relay programming system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const programmingSystem = new RelayProgrammingSystem();
    
    // Make it globally accessible for debugging
    window.programmingSystem = programmingSystem;
});

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
 
 
 
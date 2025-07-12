// Relay Management JavaScript
let relays = [];
let templates = [];
let currentUser = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadTemplates();
    loadRelays();
    setInterval(loadRelays, 30000); // Refresh every 30 seconds
});

// Authentication
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    try {
        currentUser = JSON.parse(localStorage.getItem('user'));
    } catch (e) {
        console.error('Error parsing user data:', e);
        window.location.href = 'login.html';
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// API Functions
async function apiCall(endpoint, options = {}) {
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
    
    return response.json();
}

// Load templates
async function loadTemplates() {
    try {
        templates = await apiCall('/api/templates');
        populateTemplateSelects();
    } catch (error) {
        console.error('Error loading templates:', error);
        showNotification('Error loading templates', 'error');
    }
}

// Load relays
async function loadRelays() {
    try {
        relays = await apiCall('/api/relays');
        updateStatistics();
        renderRelays();
        populateTemplateFilter();
    } catch (error) {
        console.error('Error loading relays:', error);
        showNotification('Error loading relays', 'error');
    }
}

// Update statistics
function updateStatistics() {
    const total = relays.length;
    const online = relays.filter(r => r.status === 'online').length;
    const assigned = relays.filter(r => r.template_id).length;
    const unassigned = total - assigned;
    
    document.getElementById('total-relays').textContent = total;
    document.getElementById('online-relays').textContent = online;
    document.getElementById('assigned-relays').textContent = assigned;
    document.getElementById('unassigned-relays').textContent = unassigned;
}

// Render relays
function renderRelays() {
    const grid = document.getElementById('relay-grid');
    const filteredRelays = filterRelays();
    
    grid.innerHTML = filteredRelays.map(relay => `
        <div class="relay-card ${relay.status}">
            <div class="relay-header">
                <div class="relay-name">${relay.name}</div>
                <div class="relay-status status-${relay.status}">${relay.status}</div>
            </div>
            <div class="relay-info">
                <p><strong>MAC:</strong> ${relay.mac_address}</p>
                <p><strong>Location:</strong> ${relay.location || 'Not specified'}</p>
                <p><strong>Template:</strong> ${relay.template_name || 'Unassigned'}</p>
                <p><strong>Last Seen:</strong> ${relay.last_seen ? new Date(relay.last_seen).toLocaleString() : 'Never'}</p>
            </div>
            <div class="relay-actions">
                <button onclick="editRelay('${relay.mac_address}')" class="btn btn-small btn-secondary">Edit</button>
                <button onclick="testRelay('${relay.mac_address}')" class="btn btn-small btn-primary">Test</button>
                <button onclick="deleteRelay('${relay.mac_address}')" class="btn btn-small btn-danger">Delete</button>
            </div>
        </div>
    `).join('');
}

// Filter relays
function filterRelays() {
    const statusFilter = document.getElementById('status-filter').value;
    const templateFilter = document.getElementById('template-filter').value;
    const searchFilter = document.getElementById('search-filter').value.toLowerCase();
    
    return relays.filter(relay => {
        const statusMatch = !statusFilter || relay.status === statusFilter;
        const templateMatch = !templateFilter || relay.template_id == templateFilter;
        const searchMatch = !searchFilter || 
            relay.name.toLowerCase().includes(searchFilter) ||
            relay.mac_address.toLowerCase().includes(searchFilter) ||
            (relay.location && relay.location.toLowerCase().includes(searchFilter));
        
        return statusMatch && templateMatch && searchMatch;
    });
}

// Populate template selects
function populateTemplateSelects() {
    const selects = ['relay-template', 'bulk-template', 'template-filter'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">No Template</option>' +
                templates.map(template => 
                    `<option value="${template.id}">${template.name}</option>`
                ).join('');
        }
    });
}

// Populate template filter
function populateTemplateFilter() {
    const select = document.getElementById('template-filter');
    const uniqueTemplates = [...new Set(relays.map(r => r.template_id).filter(Boolean))];
    
    select.innerHTML = '<option value="">All Templates</option>' +
        uniqueTemplates.map(templateId => {
            const template = templates.find(t => t.id == templateId);
            return template ? `<option value="${template.id}">${template.name}</option>` : '';
        }).join('');
}

// Modal functions
function showAddRelayModal() {
    document.getElementById('modal-title').textContent = 'Add New Relay';
    document.getElementById('relayForm').reset();
    document.getElementById('relayModal').style.display = 'block';
}

function showEditRelayModal(mac) {
    const relay = relays.find(r => r.mac_address === mac);
    if (!relay) return;
    
    document.getElementById('modal-title').textContent = 'Edit Relay';
    document.getElementById('mac-address').value = relay.mac_address;
    document.getElementById('mac-address').readOnly = true;
    document.getElementById('relay-name').value = relay.name;
    document.getElementById('relay-location').value = relay.location || '';
    document.getElementById('relay-description').value = relay.description || '';
    document.getElementById('relay-template').value = relay.template_id || '';
    
    document.getElementById('relayModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('relayModal').style.display = 'none';
}

function showBulkAssignModal() {
    const unassignedRelays = relays.filter(r => !r.template_id);
    const relayList = document.getElementById('bulk-relay-list');
    
    relayList.innerHTML = unassignedRelays.map(relay => `
        <div>
            <input type="checkbox" id="relay-${relay.mac_address}" value="${relay.mac_address}">
            <label for="relay-${relay.mac_address}">${relay.name} (${relay.mac_address})</label>
        </div>
    `).join('');
    
    document.getElementById('bulkAssignModal').style.display = 'block';
}

function closeBulkModal() {
    document.getElementById('bulkAssignModal').style.display = 'none';
}

// Form handlers
document.getElementById('relayForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        if (data.mac_address && relays.find(r => r.mac_address === data.mac_address)) {
            // Update existing relay
            await apiCall(`/api/relays/${data.mac_address}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            showNotification('Relay updated successfully', 'success');
        } else {
            // Create new relay
            await apiCall('/api/relays', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showNotification('Relay created successfully', 'success');
        }
        
        closeModal();
        loadRelays();
    } catch (error) {
        console.error('Error saving relay:', error);
        showNotification(error.message, 'error');
    }
});

document.getElementById('bulkAssignForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const templateId = document.getElementById('bulk-template').value;
    const selectedRelays = Array.from(document.querySelectorAll('#bulk-relay-list input:checked'))
        .map(cb => cb.value);
    
    if (selectedRelays.length === 0) {
        showNotification('Please select at least one relay', 'error');
        return;
    }
    
    try {
        for (const mac of selectedRelays) {
            await apiCall(`/api/relays/${mac}/assign`, {
                method: 'POST',
                body: JSON.stringify({ template_id: templateId })
            });
        }
        
        showNotification(`${selectedRelays.length} relays assigned successfully`, 'success');
        closeBulkModal();
        loadRelays();
    } catch (error) {
        console.error('Error bulk assigning relays:', error);
        showNotification(error.message, 'error');
    }
});

// Action functions
function editRelay(mac) {
    showEditRelayModal(mac);
}

async function deleteRelay(mac) {
    if (!confirm('Are you sure you want to delete this relay?')) return;
    
    try {
        await apiCall(`/api/relays/${mac}`, { method: 'DELETE' });
        showNotification('Relay deleted successfully', 'success');
        loadRelays();
    } catch (error) {
        console.error('Error deleting relay:', error);
        showNotification(error.message, 'error');
    }
}

async function testRelay(mac) {
    try {
        await apiCall(`/api/relays/${mac}/command`, {
            method: 'POST',
            body: JSON.stringify({ command: 'floor1_on' })
        });
        
        setTimeout(async () => {
            await apiCall(`/api/relays/${mac}/command`, {
                method: 'POST',
                body: JSON.stringify({ command: 'floor1_off' })
            });
        }, 2000);
        
        showNotification('Test command sent to relay', 'success');
    } catch (error) {
        console.error('Error testing relay:', error);
        showNotification(error.message, 'error');
    }
}

function refreshRelays() {
    loadRelays();
    showNotification('Relays refreshed', 'info');
}

// Utility functions
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    // Set background color based on type
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
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
 
 
 
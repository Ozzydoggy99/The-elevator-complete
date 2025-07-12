// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login.html';
}

// Update username display
const user = JSON.parse(localStorage.getItem('user'));
if (user) {
    document.getElementById('username').textContent = user.username;
}

// Handle logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
});

// Channel function options - most used at the top
const channelFunctions = [
    { value: 'hall_call', label: 'Hall Call' },
    { value: 'door_open', label: 'Door Open' },
    { value: 'door_close', label: 'Door Close' },
    { value: 'basementodt', label: 'Basement ODT' },
    { value: 'floor1', label: 'Floor 1' },
    { value: 'floor2', label: 'Floor 2' },
    { value: 'floor3', label: 'Floor 3' },
    { value: 'floor4', label: 'Floor 4' },
    { value: 'floor5', label: 'Floor 5' },
    { value: 'floor6', label: 'Floor 6' },
    { value: 'floor7', label: 'Floor 7' },
    { value: 'floor8', label: 'Floor 8' },
    { value: 'floor9', label: 'Floor 9' },
    { value: 'floor10', label: 'Floor 10' },
    { value: 'floor11', label: 'Floor 11' },
    { value: 'floor12', label: 'Floor 12' },
    { value: 'floor13', label: 'Floor 13' },
    { value: 'floor14', label: 'Floor 14' },
    { value: 'floor15', label: 'Floor 15' },
    { value: 'floor16', label: 'Floor 16' },
    { value: 'floor17', label: 'Floor 17' },
    { value: 'floor18', label: 'Floor 18' },
    { value: 'floor19', label: 'Floor 19' },
    { value: 'floor20', label: 'Floor 20' },
    { value: 'floor21', label: 'Floor 21' },
    { value: 'floor22', label: 'Floor 22' },
    { value: 'floor23', label: 'Floor 23' },
    { value: 'floor24', label: 'Floor 24' },
    { value: 'floor25', label: 'Floor 25' },
    { value: 'floor26', label: 'Floor 26' },
    { value: 'floor27', label: 'Floor 27' },
    { value: 'floor28', label: 'Floor 28' },
    { value: 'floor29', label: 'Floor 29' },
    { value: 'floor30', label: 'Floor 30' },
    { value: 'floor31', label: 'Floor 31' },
    { value: 'floor32', label: 'Floor 32' },
    { value: 'floor33', label: 'Floor 33' },
    { value: 'floor34', label: 'Floor 34' },
    { value: 'floor35', label: 'Floor 35' },
    { value: 'floor36', label: 'Floor 36' },
    { value: 'floor37', label: 'Floor 37' },
    { value: 'floor38', label: 'Floor 38' },
    { value: 'floor39', label: 'Floor 39' },
    { value: 'floor40', label: 'Floor 40' },
    { value: 'floor41', label: 'Floor 41' },
    { value: 'floor42', label: 'Floor 42' },
    { value: 'floor43', label: 'Floor 43' },
    { value: 'floor44', label: 'Floor 44' },
    { value: 'floor45', label: 'Floor 45' },
    { value: 'floor46', label: 'Floor 46' },
    { value: 'floor47', label: 'Floor 47' },
    { value: 'floor48', label: 'Floor 48' },
    { value: 'floor49', label: 'Floor 49' },
    { value: 'floor50', label: 'Floor 50' },
    { value: 'floor51', label: 'Floor 51' },
    { value: 'floor52', label: 'Floor 52' },
    { value: 'floor53', label: 'Floor 53' },
    { value: 'floor54', label: 'Floor 54' },
    { value: 'floor55', label: 'Floor 55' },
    { value: 'floor56', label: 'Floor 56' },
    { value: 'floor57', label: 'Floor 57' },
    { value: 'floor58', label: 'Floor 58' },
    { value: 'floor59', label: 'Floor 59' },
    { value: 'floor60', label: 'Floor 60' }
];

// Load assigned relays
async function loadAssignedRelays() {
    try {
        const response = await fetch('/api/assigned-relays', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load assigned relays');
        }

        const data = await response.json();
        displayAssignedRelays(data.templates);
    } catch (error) {
        console.error('Error loading assigned relays:', error);
        document.getElementById('relayGrid').innerHTML = '<div class="no-assignments">Error loading assigned relays. Please try again.</div>';
    }
}

// Display assigned relays
function displayAssignedRelays(templates) {
    const relayGrid = document.getElementById('relayGrid');
    relayGrid.innerHTML = '';

    if (!templates || templates.length === 0) {
        relayGrid.innerHTML = '<div class="no-assignments">No assigned relays found.</div>';
        return;
    }

    // Flatten all relays from all templates into a single array
    const allRelays = [];
    templates.forEach(template => {
        if (template.relays && template.relays.length > 0) {
            template.relays.forEach(relay => {
                allRelays.push({
                    ...relay,
                    template: {
                        id: template.id,
                        name: template.name,
                        color: template.color
                    }
                });
            });
        }
    });

    if (allRelays.length === 0) {
        relayGrid.innerHTML = '<div class="no-assignments">No assigned relays found.</div>';
        return;
    }

    allRelays.forEach(relay => {
        const card = createRelayCard(relay);
        relayGrid.appendChild(card);
    });
}

// Create relay card
function createRelayCard(relay) {
    const card = document.createElement('div');
    card.className = 'relay-card';
    card.dataset.relayId = relay.id;
    
    const statusClass = relay.is_connected ? 'status-online' : 'status-offline';
    const statusText = relay.is_connected ? 'ONLINE' : 'OFFLINE';
    
    card.innerHTML = `
        <div class="relay-card-header">
            <div>
                <h3>${relay.name}</h3>
                <span class="template-badge" style="background-color: ${relay.template.color}" data-template-id="${relay.template.id}">
                    ${relay.template.name}
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="${statusClass}">${statusText}</span>
                <button class="unassign-btn" onclick="unassignRelay('${relay.template.id}', '${relay.id}')">
                    Unassign
                </button>
                <button class="expand-btn" onclick="toggleRelayCard(this)">▼</button>
            </div>
        </div>
        <div class="relay-card-content">
            <div class="relay-info">
                <div class="relay-info-item">
                    <span class="relay-info-label">MAC Address:</span>
                    <span class="relay-info-value">${relay.mac_address}</span>
                </div>
                <div class="relay-info-item">
                    <span class="relay-info-label">IP Address:</span>
                    <span class="relay-info-value">${relay.ip_address || 'Unknown'}:${relay.port}</span>
                </div>
                <div class="relay-info-item">
                    <span class="relay-info-label">Location:</span>
                    <span class="relay-info-value">${relay.location || 'Not specified'}</span>
                </div>
                <div class="relay-info-item">
                    <span class="relay-info-label">Configuration:</span>
                    <span class="relay-info-value">${relay.config_name || 'Unknown'}</span>
                </div>
                <div class="relay-info-item">
                    <span class="relay-info-label">Assignment Type:</span>
                    <span class="relay-info-value">${relay.assignment_type || 'Not specified'}</span>
                </div>
                <div class="relay-info-item">
                    <span class="relay-info-label">Last Seen:</span>
                    <span class="relay-info-value">${relay.last_seen ? new Date(relay.last_seen).toLocaleString() : 'Never'}</span>
                </div>
            </div>
            
            <div class="channel-config">
                <h4>Channel Configuration</h4>
                <div class="channel-grid">
                    ${generateChannelSelects(relay.channel_config)}
                </div>
                <button class="save-config-btn" onclick="saveChannelConfig('${relay.id}', this)">
                    Save Configuration
                </button>
            </div>
        </div>
    `;

    return card;
}

// Generate channel select dropdowns
function generateChannelSelects(currentConfig = {}) {
    let html = '';
    
    for (let i = 1; i <= 8; i++) {
        const currentValue = currentConfig[i] || '';
        
        html += `
            <div class="channel-item">
                <label for="channel${i}">Channel ${i}</label>
                <select id="channel${i}" data-channel="${i}">
                    <option value="">No Function</option>
                    ${channelFunctions.map(func => 
                        `<option value="${func.value}" ${currentValue === func.value ? 'selected' : ''}>
                            ${func.label}
                        </option>`
                    ).join('')}
                </select>
            </div>
        `;
    }
    
    return html;
}

// Toggle relay card expansion
function toggleRelayCard(button) {
    const card = button.closest('.relay-card');
    card.classList.toggle('expanded');
    button.textContent = card.classList.contains('expanded') ? '▲' : '▼';
}

// Unassign relay from template
async function unassignRelay(templateId, relayId) {
    if (!confirm('Are you sure you want to unassign this relay from the template?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/assigned-relays/${templateId}/${relayId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // Remove the card from the UI
            const card = document.querySelector(`[data-relay-id="${relayId}"]`);
            if (card) {
                card.remove();
            }
            
            // Check if there are any cards left
            const remainingCards = document.querySelectorAll('.relay-card');
            if (remainingCards.length === 0) {
                document.getElementById('relayGrid').innerHTML = '<div class="no-assignments">No assigned relays found.</div>';
            }
            
            alert('Relay unassigned successfully');
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to unassign relay');
        }
    } catch (error) {
        console.error('Error unassigning relay:', error);
        alert('Error unassigning relay');
    }
}

// Save channel configuration
async function saveChannelConfig(relayId, button) {
    const card = button.closest('.relay-card');
    const selects = card.querySelectorAll('select[data-channel]');
    
    const channelConfig = {};
    selects.forEach(select => {
        const channel = select.dataset.channel;
        const value = select.value;
        if (value) {
            channelConfig[channel] = value;
        }
    });
    
    // Get template ID from the card
    const templateId = card.querySelector('.template-badge').dataset.templateId;
    
    // Disable button and show loading state
    button.disabled = true;
    button.textContent = 'Saving...';
    
    try {
        const response = await fetch(`/api/relays/${relayId}/channel-config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                channel_config: channelConfig,
                template_id: templateId
            })
        });
        
        if (response.ok) {
            button.textContent = 'Saved!';
            setTimeout(() => {
                button.textContent = 'Save Configuration';
                button.disabled = false;
            }, 2000);
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save configuration');
            button.textContent = 'Save Configuration';
            button.disabled = false;
        }
    } catch (error) {
        console.error('Error saving channel configuration:', error);
        alert('Error saving channel configuration');
        button.textContent = 'Save Configuration';
        button.disabled = false;
    }
}

// Load assigned relays when page loads
loadAssignedRelays(); 
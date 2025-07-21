const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const WorkflowManager = require('./core/WorkflowManager');
const RobotManager = require('./core/RobotManager');
const MapManager = require('./core/MapManager');
const RecurringTaskScheduler = require('./core/RecurringTaskScheduler');
const RelayManager = require('./core/RelayManager');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const robotMaps = require('./robot-maps.js');
const db = require('../db');
const JWT_SECRET = 'your-secret-key';
const cron = require('node-cron');
const { determineWorkflowType } = require('./core/multifloor-workflows');
const { SerialPort } = require('serialport');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Create a second server instance for elevator relays on port 80
const relayServer = http.createServer();
const relayWss = new WebSocket.Server({ 
    server: relayServer,
    path: '/elevator'
});

// Store connected relays, keyed by their MAC address
// Each entry contains: { ws: WebSocket, ip: string }
const connectedRelays = new Map();

// Ensure JSON and CORS middleware are set before any routes
app.use(express.json());
app.use(cors());

// Initialize managers
const workflowManager = new WorkflowManager();
const robotManager = new RobotManager();
const mapManager = new MapManager();
const relayManager = new RelayManager();
const recurringTaskScheduler = new RecurringTaskScheduler();

// Initialize database tables
async function initializeDatabase() {
    try {
        // Create relay_configurations table if it doesn't exist (don't drop existing data)
        await db.query(`
            CREATE TABLE IF NOT EXISTS relay_configurations (
                id SERIAL PRIMARY KEY,
                relay_id VARCHAR(255) UNIQUE NOT NULL,
                relay_name VARCHAR(255) NOT NULL,
                ssid VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                ip_address VARCHAR(15),
                port INTEGER DEFAULT 81,
                channel_config JSONB NOT NULL DEFAULT '{}',
                capabilities TEXT[] DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Add missing columns to templates table if they don't exist

        await db.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS multifloor BOOLEAN DEFAULT FALSE;`);
        
        // Add ip_address column to relays table if it doesn't exist
        await db.query(`ALTER TABLE relays ADD COLUMN IF NOT EXISTS ip_address VARCHAR(15);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_relays_ip_address ON relays(ip_address);`);
        
        console.log('Database tables initialized successfully');
    } catch (err) {
        console.error('Error initializing database tables:', err);
    }
}

// Initialize database on startup
initializeDatabase();

// Initialize managers
(async () => {
    try {
        await relayManager.initialize();
        console.log('RelayManager initialized successfully');
    } catch (err) {
        console.error('Error initializing RelayManager:', err);
    }
})();

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// === Template and user endpoints (from server.js) ===
app.get('/api/templates', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM templates ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

app.post('/api/templates', authenticateToken, async (req, res) => {
            const { name, color, robotId, bossUser, multifloor } = req.body;

    if (!name || !color || !robotId || !bossUser || !bossUser.username || !bossUser.password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Find the robot by id
        const robotResult = await db.query('SELECT * FROM robots WHERE id = $1', [robotId]);
        if (robotResult.rows.length === 0) {
        return res.status(404).json({ error: 'Robot not found' });
    }
        const robot = robotResult.rows[0];

        // Insert the template
        const insertSql = `
            INSERT INTO templates (name, color, robot, boss_user, multifloor)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const result = await db.query(insertSql, [
        name,
        color,
            JSON.stringify(robot),
            JSON.stringify(bossUser),
            multifloor || false
        ]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating template:', err);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

app.put('/api/templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, color, multifloor } = req.body;

    try {
        const result = await db.query(
            'UPDATE templates SET name = $1, color = $2, multifloor = $3 WHERE id = $4 RETURNING *',
            [name, color, multifloor || false, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating template:', err);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

app.delete('/api/templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // Start a transaction
        await db.query('BEGIN');

        // Hard delete the template
        const result = await db.query('DELETE FROM templates WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Template not found' });
        }

        // Commit the transaction
        await db.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error deleting template:', err);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

app.get('/api/templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
        if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
    }
        const template = result.rows[0];
        // If robot is stored as JSONB, parse it if needed
        if (template.robot && typeof template.robot === 'string') {
            try {
                template.robot = JSON.parse(template.robot);
            } catch (e) {
                console.error('Error parsing robot JSON:', e);
            }
    }
    res.json(template);
    } catch (err) {
        console.error('Error fetching template:', err);
        res.status(500).json({ error: 'Failed to fetch template' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        console.error('Missing username or password in login request:', req.body);
        return res.status(400).json({ error: 'Missing username or password' });
    }
    if (username === 'Ozzydog' && password === 'Ozzydog') {
        const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
        res.json({
            token,
            user: {
                username,
                role: 'admin'
            }
        });
        return;
    }
    try {
        const result = await db.query('SELECT * FROM templates');
        const templates = result.rows;
    for (const template of templates) {
            let bossUser = template.boss_user;
            if (typeof bossUser === 'string') {
                try { bossUser = JSON.parse(bossUser); } catch (e) { bossUser = null; }
            }
            if (bossUser && bossUser.username === username && bossUser.password === password) {
                const token = jwt.sign({ username, role: 'boss', templateId: template.id, templateName: template.name }, JWT_SECRET, { expiresIn: '1h' });
            res.json({
                token,
                user: {
                    username,
                    role: 'boss',
                    templateId: template.id,
                    templateName: template.name
                }
            });
            return;
        }
        if (template.users) {
                // If users are stored as JSONB, parse if needed
                let users = template.users;
                if (typeof users === 'string') {
                    try { users = JSON.parse(users); } catch (e) { users = []; }
                }
                const user = users.find(u => u.username === username && u.password === password);
            if (user) {
                    const token = jwt.sign({ username, role: 'user', templateId: template.id, templateName: template.name }, JWT_SECRET, { expiresIn: '1h' });
                res.json({
                    token,
                    user: {
                        username,
                        role: 'user',
                        templateId: template.id,
                        templateName: template.name
                    }
                });
                return;
            }
        }
    }
    res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/templates/:id/users', (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;
    const templates = readData(TEMPLATES_FILE);
    const template = templates.find(t => t.id === id);
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    if (!template.users) {
        template.users = [];
    }
    if (template.users.some(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    template.users.push({ username, password });
    writeData(TEMPLATES_FILE, templates);
    res.status(201).json({ message: 'User added successfully' });
});

app.get('/api/templates/:id/users', (req, res) => {
    const { id } = req.params;
    const templates = readData(TEMPLATES_FILE);
    const template = templates.find(t => t.id === id);
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template.users || []);
});

app.delete('/api/templates/:id/users/:username', authenticateToken, async (req, res) => {
    const { id, username } = req.params;
    try {
        // Start a transaction
        await db.query('BEGIN');

        // Get the current template
        const templateResult = await db.query('SELECT boss_user FROM templates WHERE id = $1', [id]);
        
        if (templateResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Template not found' });
        }

        const currentBossUser = templateResult.rows[0].boss_user;
        
        // If the boss user matches the username to remove, set it to null
        if (currentBossUser && currentBossUser.username === username) {
            await db.query('UPDATE templates SET boss_user = NULL WHERE id = $1', [id]);
        }

        // Commit the transaction
        await db.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error removing user from template:', err);
        res.status(500).json({ error: 'Failed to remove user from template' });
    }
});

// Simple user authentication
const users = {
    'Ozzydog': {
        password: 'Ozzydog',
        role: 'admin'
    }
};

// Middleware to check authentication
const checkAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = Buffer.from(token, 'base64').toString();
        const [username, password] = decoded.split(':');
        
        if (users[username] && users[username].password === password) {
            req.user = { username, role: users[username].role };
            next();
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// The system will automatically connect to robots from the database
// No hardcoded robot configuration needed

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Robot registration endpoint
app.post('/api/robots/register', async (req, res) => {
    console.log('Robot registration request body:', req.body);
    const { serialNumber, secretKey, name, publicIp, publicIP, privateIp, privateIP, maps } = req.body;
    const finalPublicIp = publicIp || publicIP;
    const finalPrivateIp = privateIp || privateIP;
    if (!serialNumber || !secretKey || !name || !finalPublicIp || !finalPrivateIp) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await db.query('BEGIN');

        // Insert or update robot
        const robotResult = await db.query(
            `INSERT INTO robots (serial_number, secret_key, name, public_ip, private_ip)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (serial_number) DO UPDATE
             SET secret_key = $2, name = $3, public_ip = $4, private_ip = $5
             RETURNING serial_number`,
            [serialNumber, secretKey, name, finalPublicIp, finalPrivateIp]
        );

        // Confirm robot was inserted/updated
        if (!robotResult.rows.length) {
            await db.query('ROLLBACK');
            return res.status(500).json({ error: 'Failed to insert robot' });
        }

        // Only insert maps if robot insert succeeded
        if (maps && Array.isArray(maps)) {
            await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [serialNumber]);
            for (const map of maps) {
                await db.query(
                    `INSERT INTO maps (
                        robot_serial_number, map_name, features, uid, create_time, map_version, overlays_version, thumbnail_url, image_url, url
                    ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8, $9, $10)`,
                    [
                        serialNumber,
                        map.map_name,
                        map.features,
                        map.uid,
                        map.create_time,
                        map.map_version,
                        map.overlays_version,
                        map.thumbnail_url,
                        map.image_url,
                        map.url
                    ]
                );
            }
        }

        // Connect to the new robot after registration
        try {
            robotManager.addRobot({
                serialNumber: serialNumber,
                secretKey: secretKey,
                publicIP: finalPublicIp,
                privateIP: finalPrivateIp
            });
            await robotManager.connectRobot(serialNumber);
            console.log(`Connected to new robot: ${name} (${serialNumber})`);
        } catch (err) {
            console.error('Failed to connect to new robot:', err);
        }

        await db.query('COMMIT');
        res.json({ message: 'Robot registered successfully' });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error registering robot:', error);
        res.status(500).json({ error: 'Failed to register robot' });
    }
});

// Get all robots endpoint
app.get('/api/robots', authenticateToken, async (req, res) => {
    const user = req.user;
    try {
        const robotsResult = await db.query('SELECT * FROM robots ORDER BY id');
        // Normalize fields to camelCase for frontend compatibility
        const robots = robotsResult.rows.map(robot => ({
            ...robot,
            publicIp: robot.public_ip,
            privateIp: robot.private_ip,
            secretKey: robot.secret_key,
            serialNumber: robot.serial_number,
        }));
    if (user.role === 'admin') {
        // Admin sees all robots
        return res.json(robots);
    } else if (user.role === 'boss' || user.role === 'user') {
        // Boss/user sees only robots assigned to their template
            const templatesResult = await db.query('SELECT * FROM templates');
            const templates = templatesResult.rows;
            const template = templates.find(t => t.id == user.templateId);
        if (!template || !template.robot) {
            return res.json([]);
        }
        // Support both single robot and robots array
        let assignedRobots = [];
        if (template.robots && Array.isArray(template.robots)) {
                assignedRobots = robots.filter(r => template.robots.some(tr => (tr.serial_number || tr.serialNumber) === r.serial_number));
        } else if (template.robot) {
                assignedRobots = robots.filter(r => (template.robot.serial_number || template.robot.serialNumber) === r.serial_number);
        }
        return res.json(assignedRobots);
    } else {
        // Unknown role
        return res.status(403).json({ error: 'Forbidden' });
        }
    } catch (error) {
        console.error('Error fetching robots from database:', error);
        res.status(500).json({ error: 'Failed to fetch robots from database' });
    }
});

// Update robot endpoint
app.put('/api/robots/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, publicIP, privateIP, secretKey } = req.body;

    if (!name || !publicIP || !privateIP || !secretKey) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const sql = `UPDATE robots 
                SET name = ?, publicIP = ?, privateIP = ?, secretKey = ?
                WHERE id = ?`;

    db.query(sql, [name, publicIP, privateIP, secretKey, id], (err, result) => {
        if (err) {
            console.error('Error updating robot:', err);
            return res.status(500).json({ error: 'Failed to update robot' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Robot not found' });
        }

        res.json({ message: 'Robot updated successfully' });
    });
});

// Delete robot endpoint
app.delete('/api/robots/:serialNumber', authenticateToken, async (req, res) => {
    const { serialNumber } = req.params;

    try {
        // Start a transaction
        await db.query('BEGIN');

        // Delete related task_queue entries
        await db.query('DELETE FROM task_queue WHERE robot_serial_number = $1', [serialNumber]);

        // Delete associated maps
        await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [serialNumber]);

        // Hard delete the robot
        const result = await db.query('DELETE FROM robots WHERE serial_number = $1', [serialNumber]);

        if (result.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Robot not found' });
        }

        // Remove robot from robot manager
        try {
            robotManager.removeRobot(serialNumber);
        } catch (err) {
            console.error('Error removing robot from manager:', err);
        }

        // Commit the transaction
        await db.query('COMMIT');

        res.json({ message: 'Robot deleted successfully' });
    } catch (err) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error deleting robot:', err);
        res.status(500).json({ error: 'Failed to delete robot' });
    }
});

// Protected API routes
app.post('/api/robots', checkAuth, (req, res) => {
    try {
        const robotId = robotManager.addRobot(req.body);
        res.json({ robotId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/workflows', checkAuth, (req, res) => {
    try {
        const workflow = workflowManager.createWorkflow(
            req.body.template,
            req.body.robotId,
            req.body.mapId,
            req.body.options
        );
        res.json({ workflowId: workflow.id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/maps', checkAuth, (req, res) => {
    try {
        const maps = mapManager.getAllMaps();
        res.json({ maps });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get robot maps
app.get('/api/robot-maps', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT r.serial_number, r.secret_key, 
                   json_agg(json_build_object(
                       'id', m.id,
                       'map_name', m.map_name,
                       'features', m.features
                   )) as maps
            FROM robots r
            LEFT JOIN maps m ON r.serial_number = m.robot_serial_number
            GROUP BY r.serial_number, r.secret_key
        `);

        const robotMaps = result.rows.map(row => ({
            robot: {
                serialNumber: row.serial_number,
                secretKey: row.secret_key
            },
            maps: row.maps[0] === null ? [] : row.maps
        }));

        console.log('Sending robotMaps to frontend:', JSON.stringify(robotMaps, null, 2));
        res.json(robotMaps);
    } catch (error) {
        console.error('Error fetching robot maps:', error);
        res.status(500).json({ error: 'Failed to fetch robot maps' });
    }
});

// Update robot maps
app.post('/api/robot-maps', async (req, res) => {
    const { serialNumber, maps } = req.body;
    if (!serialNumber || !maps) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Start a transaction
        await db.query('BEGIN');

        // Delete existing maps for this robot
        await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [serialNumber]);

        // Insert new maps
        for (const map of maps) {
            await db.query(
                `INSERT INTO maps (
                    robot_serial_number, map_name, features, uid, create_time, map_version, overlays_version, thumbnail_url, image_url, url
                ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8, $9, $10)`,
                [
                    serialNumber,
                    map.map_name,
                    map.features,
                    map.uid,
                    map.create_time,
                    map.map_version,
                    map.overlays_version,
                    map.thumbnail_url,
                    map.image_url,
                    map.url
                ]
            );
        }

        // Commit the transaction
        await db.query('COMMIT');

        res.json({ message: 'Maps updated successfully' });
    } catch (error) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error updating robot maps:', error);
        res.status(500).json({ error: 'Failed to update robot maps' });
    }
});

// WebSocket connection handling
wss.on('connection', async (ws, req) => {
    // Extract MAC address from the connection URL to identify relays
    const url = new URL(req.url, `http://${req.headers.host}`);
    const macAddress = url.searchParams.get('id');

    if (macAddress) {
        // --- This is a Relay Connection ---
        // Extract IP address from the connection
        const relayIP = req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
        
        // Check if the received ID is a valid MAC address format
        const isValidMacAddress = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress);
        console.log('[DEBUG] Relay WebSocket connection: macAddress =', macAddress, 'relayIP =', relayIP, 'isValidMacAddress =', isValidMacAddress);
        
        if (!isValidMacAddress) {
            console.log(`[DEBUG] ⚠️  Received non-MAC address ID: ${macAddress}. Will extract MAC from device registration.`);
        }
        
        console.log(`[DEBUG] Relay connected with ID: ${macAddress} from IP: ${relayIP}`);
        
        // Store both WebSocket and IP address
        connectedRelays.set(macAddress, {
            ws: ws,
            ip: relayIP,
            actualMacAddress: null // Will be set when device registers
        });

        // Insert or update connected_relays table
        try {
            console.log('[DEBUG] Attempting to insert/update connected_relays for', macAddress, relayIP);
            const result = await db.query(`
                INSERT INTO connected_relays (mac_address, status, is_connected, last_seen, ip_address)
                VALUES ($1, 'online', TRUE, CURRENT_TIMESTAMP, $2)
                ON CONFLICT (mac_address) DO UPDATE
                SET status = 'online', is_connected = TRUE, last_seen = CURRENT_TIMESTAMP, ip_address = $2
                `, [macAddress, relayIP]);
            console.log('[DEBUG] Insert/update for connected_relays completed for', macAddress, 'Result:', result.rowCount);
        } catch (err) {
            console.error('[DEBUG] Error inserting/updating connected_relays for', macAddress, err);
        }

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                console.log(`Received message from relay ${macAddress}:`, data);

                // Handle device registration (accept both old and new formats)
                if (data.type === 'device_register' || data.type === 'register') {
                    console.log(`Relay ${macAddress} registering as ${data.device_name}`);
                    console.log(`🔍 Full device registration data:`, JSON.stringify(data, null, 2));
                    
                    // Extract MAC address from registration message (new format uses 'mac', old format uses 'mac_address')
                    const actualMac = data.mac || data.mac_address;
                    const deviceIP = data.ip;
                    
                    if (actualMac) {
                        const relayData = connectedRelays.get(macAddress);
                        if (relayData) {
                            relayData.actualMacAddress = actualMac;
                            console.log(`✅ Updated actual MAC address: ${actualMac}`);
                        }
                    } else {
                        console.log(`⚠️  No mac field in device registration`);
                        // Generate a proper MAC address from the device_id if it's not a MAC
                        const isValidMac = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress);
                        if (!isValidMac) {
                            // Generate a MAC address based on the device_id
                            const hash = require('crypto').createHash('md5').update(macAddress).digest('hex');
                            const generatedMac = `${hash.substring(0,2)}:${hash.substring(2,4)}:${hash.substring(4,6)}:${hash.substring(6,8)}:${hash.substring(8,10)}:${hash.substring(10,12)}`;
                            const relayData = connectedRelays.get(macAddress);
                            if (relayData) {
                                relayData.actualMacAddress = generatedMac;
                                console.log(`🔧 Generated MAC address: ${generatedMac} from device_id: ${macAddress}`);
                            }
                        }
                    }
                    
                    // Update IP address if provided
                    if (deviceIP) {
                        const relayData = connectedRelays.get(macAddress);
                        if (relayData) {
                            relayData.ip = deviceIP;
                            console.log(`✅ Updated IP address: ${deviceIP}`);
                        }
                        
                        // Update IP address in database
                        try {
                            await db.query(`
                                UPDATE relays 
                                SET ip_address = $1, last_seen = CURRENT_TIMESTAMP
                                WHERE mac_address = $2
                            `, [deviceIP, macAddress]);
                            console.log(`✅ Updated relay IP address in database: ${macAddress} -> ${deviceIP}`);
                            
                            // Also update RelayManager if relay exists
                            const relay = relayManager.findRelayByMAC(macAddress);
                            if (relay) {
                                await relayManager.updateRelayIP(relay.id, deviceIP);
                                console.log(`✅ Updated RelayManager IP for relay ${relay.id}: ${deviceIP}`);
                                
                                // Try to connect to the relay now that we have its IP
                                try {
                                    await relayManager.connectToRelayWhenIPAvailable(relay.id, deviceIP);
                                    console.log(`✅ Successfully connected to relay ${relay.id} for command sending`);
                                } catch (err) {
                                    console.error(`❌ Failed to connect to relay ${relay.id} for command sending:`, err);
                                }
                            }
                        } catch (err) {
                            console.error(`Error updating relay IP address in database for ${macAddress}:`, err);
                        }
                    }
                }
                
                // Handle state updates (accept both old and new formats)
                if (data.type === 'full_state' || data.type === 'state') {
                    console.log(`Relay ${macAddress} state:`, {
                        relays: data.relays,
                        inputs: data.inputs
                    });
                    
                    // Update IP address if provided in state message
                    if (data.ip) {
                        const relayData = connectedRelays.get(macAddress);
                        if (relayData) {
                            relayData.ip = data.ip;
                        }
                    }
                }
                
                // Look up relay configuration from relay_configurations table based on MAC address
                try {
                    const relayResult = await db.query(`
                        SELECT rc.*, cr.name as relay_name
                        FROM relay_configurations rc
                        LEFT JOIN connected_relays cr ON cr.relay_configuration_id = rc.id
                        WHERE cr.mac_address = $1 OR rc.relay_id = $1
                    `, [macAddress]);
                    
                    if (relayResult.rows.length > 0) {
                        const relayConfig = relayResult.rows[0];
                        const channelConfig = relayConfig.channel_config || {};
                        
                        // Convert channel_config to the format expected by firmware
                        const relays = [];
                        const inputPins = [];
                        
                        // Parse channel configuration
                        for (let i = 0; i < 8; i++) {
                            const channelKey = `channel${i}`;
                            const channel = channelConfig[channelKey];
                            
                            if (channel) {
                                relays.push({
                                    bitPosition: i,
                                    inputPin: channel.inputPin || -1,
                                    function: channel.function || `unused_${i}`,
                                    enabled: channel.enabled !== false,
                                    safetyRequired: channel.safetyRequired || false
                                });
                                inputPins.push(channel.inputPin || -1);
                            } else {
                                relays.push({
                                    bitPosition: i,
                                    inputPin: -1,
                                    function: `unused_${i}`,
                                    enabled: false,
                                    safetyRequired: false
                                });
                                inputPins.push(-1);
                            }
                        }
                        
                        // Send the relay's configuration from relay_configurations table
                        const configMessage = {
                            type: "config",
                            device_id: relayConfig.relay_id || macAddress,
                            device_name: relayConfig.relay_name || relayConfig.relay_name || "ESP32 Relay Controller",
                            num_relays: 8,
                            num_inputs: 8,
                            relays: relays,
                            input_pins: inputPins
                        };
                        
                        ws.send(JSON.stringify(configMessage));
                        console.log(`Sent relay configuration for ${relayConfig.relay_name || relayConfig.relay_id} to relay ${macAddress}`);
                    } else {
                        console.log(`Relay configuration not found for ${macAddress}, skipping config send`);
                    }
                } catch (err) {
                    console.error(`Error looking up relay configuration for ${macAddress}:`, err);
                }
            }
            
            catch (error) {
                console.error(`Error parsing message from relay ${macAddress}:`, error);
            }
        });

        ws.on('close', async () => {
            const relayData = connectedRelays.get(macAddress);
            const relayIP = relayData ? relayData.ip : 'unknown';
            console.log(`Relay disconnected: ${macAddress} from IP: ${relayIP}`);
            connectedRelays.delete(macAddress);

            // Update relay status to offline
            try {
                await db.query(`
                    UPDATE relays 
                    SET status = 'offline'
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`Updated relay status to offline: ${macAddress}`);
            } catch (err) {
                console.error(`Error updating relay status for ${macAddress}:`, err);
            }
            // Update connected_relays table to mark as offline
            try {
                await db.query(`
                    UPDATE connected_relays
                    SET status = 'offline', is_connected = FALSE, last_seen = CURRENT_TIMESTAMP
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`Updated connected_relays status to offline: ${macAddress}`);
            } catch (err) {
                console.error(`Error updating connected_relays status for ${macAddress}:`, err);
            }
        });

        ws.on('error', async (error) => {
            const relayData = connectedRelays.get(macAddress);
            const relayIP = relayData ? relayData.ip : 'unknown';
            console.error(`Error with relay ${macAddress} from IP: ${relayIP}:`, error);
            connectedRelays.delete(macAddress);
            
            // Update relay status to error
            try {
                await db.query(`
                    UPDATE relays 
                    SET status = 'error'
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`Updated relay status to error: ${macAddress}`);
            } catch (err) {
                console.error(`Error updating relay status for ${macAddress}:`, err);
            }
            // Update connected_relays table to mark as error
            try {
                await db.query(`
                    UPDATE connected_relays
                    SET status = 'error', is_connected = FALSE, last_seen = CURRENT_TIMESTAMP
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`Updated connected_relays status to error: ${macAddress}`);
            } catch (err) {
                console.error(`Error updating connected_relays status for ${macAddress}:`, err);
            }
        });

    } else {
        // --- This is a Robot or UI Connection (Original Logic) ---
        console.log('New client connected (robot or UI)');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
                handleWebSocketMessage(ws, data); // Using the original handler
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });

    ws.on('close', () => {
            console.log('Client disconnected (robot or UI)');
    });
        
        ws.on('error', (error) => {
             console.error('Error with client (robot or UI):', error);
        });
    }
});

// New API endpoint to send commands to a specific relay
app.post('/api/relays/:mac/command', async (req, res) => {
    const { mac } = req.params;
    const { command, type, relay, state } = req.body;

    // Simple relay command - send relay number directly to ESP32
    const messageToSend = {
        type: 'relay_control',
        relay: relay,  // Use relay number directly (0-7)
        state: state
    };

    const relayData = connectedRelays.get(mac);

    if (relayData && relayData.ws.readyState === WebSocket.OPEN) {
        relayData.ws.send(JSON.stringify(messageToSend));
        res.status(200).json({ message: `Command '${messageToSend.type}' sent to relay ${mac} at IP: ${relayData.ip}` });
    } else {
        res.status(404).json({ error: `Relay with MAC address ${mac} not connected or not ready.` });
    }
});

// API endpoint to get all connected relays with their IP addresses
app.get('/api/relays/connected', (req, res) => {
    const connectedRelaysList = [];
    
    for (const [mac, relayData] of connectedRelays.entries()) {
        connectedRelaysList.push({
            mac: mac,
            ip: relayData.ip,
            status: relayData.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected'
        });
    }
    
    res.json({
        count: connectedRelaysList.length,
        relays: connectedRelaysList
    });
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data) {
    switch (data.type) {
        case 'register_robot':
            const robotId = robotManager.addRobot(data.robot);
            ws.send(JSON.stringify({ type: 'robot_registered', robotId }));
            break;

        case 'start_workflow':
            const workflow = workflowManager.createWorkflow(
                data.template,
                data.robotId,
                data.mapId,
                data.options
            );
            await workflowManager.startWorkflow(workflow.id);
            ws.send(JSON.stringify({ type: 'workflow_started', workflowId: workflow.id }));
            break;

        case 'get_robot_status':
            const status = robotManager.getRobotStatus(data.robotId);
            ws.send(JSON.stringify({ type: 'robot_status', status }));
            break;

        case 'get_map_points':
            const points = mapManager.getMapPoints(data.mapId);
            ws.send(JSON.stringify({ type: 'map_points', points }));
            break;

        case 'set_relay':
            // Forward relay command to the appropriate relay
            const deviceId = data.device_id;
            const relayName = data.relay;
            const relayState = data.state;
            
            // Improved: Map device_id to relay connection using MAC or device_id
            let targetRelay = null;
            let targetMac = null;
            for (const [mac, relayData] of connectedRelays.entries()) {
                // Match by device_id or MAC address (case-insensitive)
                if (
                  mac.toLowerCase() === deviceId.toLowerCase() ||
                  (relayData.device_id && relayData.device_id.toLowerCase() === deviceId.toLowerCase())
                ) {
                    targetRelay = relayData.ws;
                    targetMac = mac;
                    break;
                }
            }
            
            if (targetRelay && targetRelay.readyState === WebSocket.OPEN) {
                // Look up relay configuration from database to get proper channel mapping
                try {
                    const relayResult = await db.query(`
                        SELECT rc.*, cr.name as relay_name
                        FROM relay_configurations rc
                        LEFT JOIN connected_relays cr ON cr.relay_configuration_id = rc.id
                        WHERE cr.mac_address = $1
                    `, [targetMac]);
                    
                    let relayCommand;
                    if (relayResult.rows.length > 0) {
                        const relayConfig = relayResult.rows[0];
                        const channelConfig = relayConfig.channel_config || {};
                        
                        // Find the relay by function name in the channel configuration
                        let channelIndex = -1;
                        for (let i = 0; i < 8; i++) {
                            const channelKey = `channel${i}`;
                            const channel = channelConfig[channelKey];
                            if (channel && channel.function === relayName) {
                                channelIndex = i;
                                break;
                            }
                        }
                        
                        if (channelIndex !== -1) {
                            relayCommand = {
                                type: 'relay_control',
                                relay: channelIndex,
                                state: relayState
                            };
                            console.log(`[RELAY] Forwarded command to ${deviceId}: ${relayName} (channel ${channelIndex}) = ${relayState}`);
                        } else {
                            // Fallback to relay name if not found in mapping
                            relayCommand = {
                                type: 'relay_control',
                                relay: relayName,
                                state: relayState
                            };
                            console.log(`[RELAY] Forwarded command to ${deviceId}: ${relayName} (no mapping found) = ${relayState}`);
                        }
                    } else {
                        // Fallback to relay name if relay not found in database
                        relayCommand = {
                            type: 'relay_control',
                            relay: relayName,
                            state: relayState
                        };
                        console.log(`[RELAY] Forwarded command to ${deviceId}: ${relayName} (not in DB) = ${relayState}`);
                    }
                    
                    targetRelay.send(JSON.stringify(relayCommand));
                    ws.send(JSON.stringify({ type: 'relay_command_sent', relay: relayName, state: relayState }));
                } catch (err) {
                    console.error(`Error looking up relay configuration for ${targetMac}:`, err);
                    // Fallback to relay name if database lookup fails
                const relayCommand = {
                        type: 'relay_control',
                    relay: relayName,
                    state: relayState
                };
                targetRelay.send(JSON.stringify(relayCommand));
                    console.log(`[RELAY] Forwarded command to ${deviceId}: ${relayName} (DB error) = ${relayState}`);
                ws.send(JSON.stringify({ type: 'relay_command_sent', relay: relayName, state: relayState }));
                }
            } else {
                console.error(`[RELAY] Relay ${deviceId} not found or not connected`);
                ws.send(JSON.stringify({ type: 'error', message: `Relay ${deviceId} not found or not connected` }));
            }
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
}

// Event handling
workflowManager.on('workflowStarted', (workflow) => {
    broadcastToClients({ type: 'workflow_started', workflow });
});

workflowManager.on('workflowCompleted', (workflow) => {
    broadcastToClients({ type: 'workflow_completed', workflow });
});

workflowManager.on('workflowFailed', ({ workflow, error }) => {
    broadcastToClients({ type: 'workflow_failed', workflow, error: error.message });
});

robotManager.on('robotStatusUpdated', ({ id, status }) => {
    broadcastToClients({ type: 'robot_status_updated', robotId: id, status });
});

// Broadcast to all connected clients
function broadcastToClients(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Every 2 minutes, delete all but the latest map for each robot/map_name
cron.schedule('*/2 * * * *', async () => {
    try {
        await db.query(`
            DELETE FROM maps
            WHERE id NOT IN (
                SELECT DISTINCT ON (robot_serial_number, map_name) id
                FROM maps
                ORDER BY robot_serial_number, map_name, created_at DESC
            )
        `);
        console.log('Old map data cleaned up');
    } catch (err) {
        console.error('Error cleaning up map data:', err);
    }
});

// Add RobotConfig class at the top level
class RobotConfig {
    constructor(config) {
        this.serialNumber = config.serialNumber || config.serial_number;
        this.publicIp = config.publicIP || config.publicIp || config.ip;
        this.localIp = config.privateIP || config.privateIp;
        this.secret = config.secretKey || config.secret;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Public-IP': this.publicIp,
            'X-Private-IP': this.localIp,
            'X-Serial-Number': this.serialNumber,
            'X-Secret-Key': this.secret
        };
    }

    getBaseUrl() {
        return `http://${this.publicIp}:8090`;
    }
}

// Update helper functions to use RobotConfig
async function sendMoveTask(robot, params) {
    const robotConfig = new RobotConfig(robot);
    const moveParams = {
        ...params,
        properties: {
            max_trans_vel: 0.3,
            max_rot_vel: 0.3,
            acc_lim_x: 0.3,
            acc_lim_theta: 0.3,
            planning_mode: 'directional'
        }
    };
    console.log('=== Move Task Fetch Details ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    console.log('URL:', `${robotConfig.getBaseUrl()}/chassis/moves`);
    console.log('Headers:', robotConfig.getHeaders());
    console.log('Body:', JSON.stringify(moveParams, null, 2));

    const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/moves`, {
        method: 'POST',
        headers: robotConfig.getHeaders(),
        body: JSON.stringify(moveParams)
    });

    if (!response.ok) {
        console.error('Move Task Failed:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url
        });
        throw new Error(`Failed to send move command: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Move Task Response:', data);
    return data.id || data.action_id || data.task_id;
}

async function sendJack(robot, service) {
    const robotConfig = new RobotConfig(robot);
    console.log('=== Jack Operation Fetch Details ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    console.log('URL:', `${robotConfig.getBaseUrl()}/services/${service}`);
    console.log('Headers:', robotConfig.getHeaders());

    const response = await fetch(`${robotConfig.getBaseUrl()}/services/${service}`, {
        method: 'POST',
        headers: robotConfig.getHeaders(),
        body: JSON.stringify({})
    });

    if (!response.ok) {
        console.error('Jack Operation Failed:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url
        });
        throw new Error(`Failed to send jack command: ${response.status} ${response.statusText}`);
    }

    console.log('Jack Operation Response:', await response.json());
    await new Promise(resolve => setTimeout(resolve, 10000));
}

async function checkMoveStatus(robot, moveId) {
    const robotConfig = new RobotConfig(robot);
    console.log('=== Move Status Check Fetch Details ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    console.log('URL:', `${robotConfig.getBaseUrl()}/chassis/moves/${moveId}`);
    console.log('Headers:', robotConfig.getHeaders());

    try {
        const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/moves/${moveId}`, {
            headers: robotConfig.getHeaders()
        });
        if (!response.ok) {
            console.error('Move Status Check Failed:', {
                status: response.status,
                statusText: response.statusText,
                url: response.url
            });
            throw new Error(`Failed to check move status: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Move Status Response:', data);
        return data.state || 'unknown';
    } catch (error) {
        console.error('Error checking move status:', error);
        return 'failed';
    }
}

// Update waitForMoveComplete with better status checking
async function waitForMoveComplete(robot, moveId, timeout = 600000) {
    const startTime = Date.now();
    let isMoving = true;

    while (isMoving && (Date.now() - startTime) < timeout) {
        const status = await checkMoveStatus(robot, moveId);
        console.log('Current move status:', status);

        if (status === 'succeeded') {
            isMoving = false;
            console.log('✅ Move completed successfully');
        } else if (status === 'failed' || status === 'cancelled') {
            throw new Error(`Move failed with status: ${status}`);
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (isMoving) {
        throw new Error(`Move timed out after ${timeout}ms`);
    }
}

// Add retry mechanism for bin operations
async function executeWithRetry(operation, maxRetries = 3, operationName = 'Operation') {
    let retryCount = 0;
    let success = false;
    let lastError;
    let result;

    while (!success && retryCount < maxRetries) {
        try {
            result = await operation();
            success = true;
        } catch (error) {
            lastError = error;
            console.error(`${operationName} failed (Attempt ${retryCount + 1}/${maxRetries}):`, error);
            
            if (retryCount < maxRetries - 1) {
                console.log(`Retrying in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        retryCount++;
    }

    if (!success) {
        throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError.message}`);
    }
    
    return result;
}

// Helper to get required map features for a robot/floor
async function getRequiredFeaturesForTask(robot, floor, shelfPoint, type, carryingBin) {
    const mapName = `Floor${floor}`;
    console.log(`[FEATURES] Looking for map ${mapName} for robot ${robot.serialNumber}`);
    
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [robot.serialNumber, mapName]
    );
    
    if (mapResult.rows.length === 0) {
        throw new Error(`Map for Floor${floor} not found for this robot`);
    }
    
    let features = mapResult.rows[0].features;
    console.log(`[FEATURES] Raw features from DB:`, features);
    
    if (typeof features === 'string') {
        try { 
            features = JSON.parse(features);
            console.log(`[FEATURES] Parsed features:`, features);
        } catch (e) { 
            console.error(`[FEATURES] Failed to parse features:`, e);
            features = []; 
        }
    }
    
    function getFeatureInfo(name) {
        const feature = features.find(f => f.name === name);
        console.log(`[FEATURES] Looking for feature "${name}":`, feature);
        return feature;
    }
    
    // Accept only 'Charging Station_docking' and 'Charging Station' as valid charger points
    const charger = getFeatureInfo('Charging Station_docking') || getFeatureInfo('Charging Station');
    console.log(`[FEATURES] Found charger:`, charger);
    
    let shelfLoad = null, shelfLoadDocking = null;
    if (carryingBin && shelfPoint) {
        const loadName = `${shelfPoint}_load`;
        const dockingName = `${shelfPoint}_load_docking`;
        console.log(`[FEATURES] Looking for shelf features:`, { loadName, dockingName });
        
        shelfLoad = getFeatureInfo(loadName);
        shelfLoadDocking = getFeatureInfo(dockingName);
        
        console.log(`[FEATURES] Found shelf features:`, { shelfLoad, shelfLoadDocking });
    }
    
    const result = { mapName, charger, shelfLoad, shelfLoadDocking };
    console.log(`[FEATURES] Final feature set:`, result);
    return result;
}

// Extract workflow execution into a separate function that can be called by the queue manager
async function executeWorkflow(robot, type, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options = {}) {
    if (type === 'dropoff') {
        // 1. Move to central_load_docking
        const move1 = {
            type: 'standard',
            target_x: centralLoadDocking.coordinates[0],
            target_y: centralLoadDocking.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoadDocking.id
        };
        const move1Id = await sendMoveTask(robot, move1);
        await waitForMoveComplete(robot, move1Id);

        // 2. Align at central_load
        const align1 = {
            type: 'align_with_rack',
            target_x: centralLoad.coordinates[0],
            target_y: centralLoad.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoad.id
        };
        const align1Id = await sendMoveTask(robot, align1);
        await waitForMoveComplete(robot, align1Id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Jack up
        await sendJack(robot, 'jack_up');
        await new Promise(resolve => setTimeout(resolve, 10000));
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. Move to shelf_load_docking (with bin lifted)
        const move2 = {
            type: 'standard',
            target_x: shelfLoadDocking.coordinates[0],
            target_y: shelfLoadDocking.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoadDocking.id
        };
        const move2Id = await sendMoveTask(robot, move2);
        await waitForMoveComplete(robot, move2Id);

        // 5. Move to shelf_load (to unload point)
        const move3 = {
            type: 'to_unload_point',
            target_x: shelfLoad.coordinates[0],
            target_y: shelfLoad.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoad.id
        };
        const move3Id = await sendMoveTask(robot, move3);
        await waitForMoveComplete(robot, move3Id);

        // 6. Jack down
        await sendJack(robot, 'jack_down');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 7. Return to charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else if (type === 'pickup') {
        // 1. Move to shelf_load_docking
        const move1 = {
            type: 'standard',
            target_x: shelfLoadDocking.coordinates[0],
            target_y: shelfLoadDocking.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoadDocking.id
        };
        const move1Id = await sendMoveTask(robot, move1);
        await waitForMoveComplete(robot, move1Id);

        // 2. Align at shelf_load
        const align1 = {
            type: 'align_with_rack',
            target_x: shelfLoad.coordinates[0],
            target_y: shelfLoad.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoad.id
        };
        const align1Id = await sendMoveTask(robot, align1);
        await waitForMoveComplete(robot, align1Id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Jack up
        await sendJack(robot, 'jack_up');
        await new Promise(resolve => setTimeout(resolve, 10000));
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. Move to central_load_docking (with bin lifted)
        const move2 = {
            type: 'standard',
            target_x: centralLoadDocking.coordinates[0],
            target_y: centralLoadDocking.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoadDocking.id
        };
        const move2Id = await sendMoveTask(robot, move2);
        await waitForMoveComplete(robot, move2Id);

        // 5. Move to central_load (to unload point)
        const move3 = {
            type: 'to_unload_point',
            target_x: centralLoad.coordinates[0],
            target_y: centralLoad.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoad.id
        };
        const move3Id = await sendMoveTask(robot, move3);
        await waitForMoveComplete(robot, move3Id);

        // 6. Jack down
        await sendJack(robot, 'jack_down');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 7. Return to charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else if (type === 'go_home') {
        // Just go to the charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else if (type === 'return_to_charger') {
        // If carrying a bin, drop it at a pickup point first
        if (options.carryingBin && shelfLoad && shelfLoadDocking) {
            // Move to shelf_load_docking
            const move1 = {
                type: 'standard',
                target_x: shelfLoadDocking.coordinates[0],
                target_y: shelfLoadDocking.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: shelfLoadDocking.id
            };
            const move1Id = await sendMoveTask(robot, move1);
            await waitForMoveComplete(robot, move1Id);

            // Move to shelf_load
            const move2 = {
                type: 'to_unload_point',
                target_x: shelfLoad.coordinates[0],
                target_y: shelfLoad.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: shelfLoad.id
            };
            const move2Id = await sendMoveTask(robot, move2);
            await waitForMoveComplete(robot, move2Id);

            // Jack down to drop the bin
            await sendJack(robot, 'jack_down');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        // Then go to the charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else {
        throw new Error('Invalid task type');
    }
}



// Shared elevator controller factory function
async function createElevatorController(elevatorRelays, templateId) {
    const mainRelay = elevatorRelays[0];
    
    return {
        relays: elevatorRelays,
        mainRelay: mainRelay,
        templateId: templateId,
        
        // Method to activate hall call (first command when robot arrives at elevator)
        async activateHallCall() {
            const hallCallRelay = findRelayForFunction(elevatorRelays, 'hall_call');
            if (!hallCallRelay) {
                throw new Error('No hall_call relay found');
            }
            
            console.log(`[ELEVATOR] Activating hall call via relay ${hallCallRelay.relay.name} channel ${hallCallRelay.channel}`);
            
            // Find the channel index for hall_call function
            const channelIndex = await findRelayChannelForFunction(templateId, hallCallRelay.relay.mac_address, 'hall_call');
            
            // Send command using the correct format
            await sendRelayCommandByFunction(hallCallRelay.relay.mac_address, channelIndex, true);
            
            console.log(`[ELEVATOR] Hall call activated`);
        },
        
        // Method to deactivate hall call (last command when robot exits elevator)
        async deactivateHallCall() {
            const hallCallRelay = findRelayForFunction(elevatorRelays, 'hall_call');
            if (!hallCallRelay) {
                throw new Error('No hall_call relay found');
            }
            
            console.log(`[ELEVATOR] Deactivating hall call via relay ${hallCallRelay.relay.name} channel ${hallCallRelay.channel}`);
            
            // Find the channel index for hall_call function
            const channelIndex = await findRelayChannelForFunction(templateId, hallCallRelay.relay.mac_address, 'hall_call');
            
            // Send command using the correct format
            await sendRelayCommandByFunction(hallCallRelay.relay.mac_address, channelIndex, false);
            
            console.log(`[ELEVATOR] Hall call deactivated`);
        },
        
        // Method to select a floor (works across multiple relays)
        async selectFloor(floorNumber) {
            const floorRelay = findRelayForFloor(elevatorRelays, floorNumber);
            if (!floorRelay) {
                throw new Error(`No relay found for floor ${floorNumber}`);
            }
            
            console.log(`[ELEVATOR] Selecting floor ${floorNumber} via relay ${floorRelay.relay.name} channel ${floorRelay.channel}`);
            
            // Find the channel index for this floor function
            const channelIndex = await findRelayChannelForFunction(templateId, floorRelay.relay.mac_address, `floor${floorNumber}`);
            
            // Send command using the correct format
            await sendRelayCommandByFunction(floorRelay.relay.mac_address, channelIndex, true);
            
            // Wait for the floor selection to be confirmed via DI inputs
            console.log(`[ELEVATOR] Waiting for floor ${floorNumber} selection confirmation...`);
            await waitForUnifiedElevatorStatus(templateId, { current_floor: floorNumber }, 10000);
        },
        
        // Method to open doors (works across multiple relays)
        async openDoor() {
            const doorRelay = findRelayForFunction(elevatorRelays, 'door_open');
            if (!doorRelay) {
                throw new Error('No door_open relay found');
            }
            
            console.log(`[ELEVATOR] Opening doors via relay ${doorRelay.relay.name} channel ${doorRelay.channel}`);
            
            // Find the channel index for door_open function
            const channelIndex = await findRelayChannelForFunction(templateId, doorRelay.relay.mac_address, 'door_open');
            
            // Send command using the correct format
            await sendRelayCommandByFunction(doorRelay.relay.mac_address, channelIndex, true);
            
            // Wait for door open confirmation
            console.log(`[ELEVATOR] Waiting for door open confirmation...`);
            await waitForUnifiedElevatorStatus(templateId, { door_open: true }, 10000);
        },
        
        // Method to close doors (works across multiple relays)
        async closeDoor() {
            const doorRelay = findRelayForFunction(elevatorRelays, 'door_close');
            if (!doorRelay) {
                throw new Error('No door_close relay found');
            }
            
            console.log(`[ELEVATOR] Closing doors via relay ${doorRelay.relay.name} channel ${doorRelay.channel}`);
            
            // Find the channel index for door_close function
            const channelIndex = await findRelayChannelForFunction(templateId, doorRelay.relay.mac_address, 'door_close');
            
            // Send command using the correct format
            await sendRelayCommandByFunction(doorRelay.relay.mac_address, channelIndex, true);
            
            // Wait for door close confirmation
            console.log(`[ELEVATOR] Waiting for door close confirmation...`);
            await waitForUnifiedElevatorStatus(templateId, { door_close: true }, 10000);
        },
        
        // Method to get current unified status
        async getStatus() {
            return await getUnifiedElevatorStatus(templateId);
        },
        
        // Method to wait for specific status conditions
        async waitForStatus(expectedStatus, timeout = 30000) {
            return await waitForUnifiedElevatorStatus(templateId, expectedStatus, timeout);
        }
    };
}

// Multifloor workflow execution functions
async function executeMultifloorWorkflow(robot, type, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options = {}) {
    console.log(`[MULTIFLOOR] Starting multifloor ${type} workflow for robot ${robot.serialNumber}`);
    
    // GUARD: If elevator points are missing, abort and log error
    if (!options.elevatorWaiting || !options.elevatorInside) {
        const msg = `[MULTIFLOOR] ERROR: Elevator points missing for robot ${robot.serialNumber}. This robot is likely single-story. Aborting multifloor workflow.`;
        console.error(msg);
        throw new Error(msg);
    }
    
    try {
        // Get template ID from options or determine from robot
        const templateId = options.templateId;
        if (!templateId) {
            throw new Error('Template ID is required for multifloor workflows');
        }

        // Get elevator relays for this template from database
        const elevatorRelays = await getElevatorRelaysForTemplateFromDB(templateId);
        
        if (elevatorRelays.length === 0) {
            throw new Error('No elevator relays found for this template');
        }

        console.log(`[MULTIFLOOR] Found ${elevatorRelays.length} elevator relays for template ${templateId}`);
        
        // Create elevator controller using shared function
        const elevatorController = await createElevatorController(elevatorRelays, templateId);

        if (type === 'multifloor_pickup') {
            await executeMultifloorPickup(robot, elevatorController, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options);
        } else if (type === 'multifloor_dropoff') {
            await executeMultifloorDropoff(robot, elevatorController, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options);
        } else {
            throw new Error(`Invalid multifloor task type: ${type}`);
        }
        
        console.log(`[MULTIFLOOR] Multifloor ${type} workflow completed successfully for robot ${robot.serialNumber}`);
        
    } catch (error) {
        console.error(`[MULTIFLOOR] Error in multifloor ${type} workflow for robot ${robot.serialNumber}:`, error);
        throw error;
    }
}



// Helper function to get robot connection
async function getRobotConnection(robot) {
    const RobotConnection = require('./core/RobotConnection');
    const robotConnection = new RobotConnection(robot.publicIP, 8090, robot.secretKey);
    await robotConnection.connect();
    return robotConnection;
}

// Helper function to wait for elevator status
async function waitForElevatorStatus(elevatorController, expectedStatus, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for elevator status: ${expectedStatus}`));
        }, timeout);

        const checkStatus = () => {
            // This would need to be implemented based on your elevator controller's status reporting
            // For now, we'll use a simple timeout-based approach
            clearTimeout(timer);
            resolve();
        };

        // Listen for status updates from elevator controller
        elevatorController.once('status_update', (status) => {
            if (status === expectedStatus) {
                checkStatus();
            }
        });

        // Fallback: resolve after a reasonable delay
        setTimeout(checkStatus, 5000);
    });
}

// Helper function to switch robot to different floor map
async function switchRobotMap(robotConnection, targetFloor) {
    const mapName = `Floor${targetFloor}`;
    console.log(`[MULTIFLOOR] Switching robot to map: ${mapName}`);
    
    // Send map switch command to robot
    const mapSwitchCommand = {
        id: Date.now().toString(),
        type: 'switch_map',
        map_name: mapName
    };
    
    await robotConnection.sendCommand(mapSwitchCommand);
    
    // Wait for map switch confirmation
    await new Promise(resolve => setTimeout(resolve, 3000));
}

// Multifloor pickup workflow implementation
async function executeMultifloorPickup(robot, elevatorController, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options) {
    console.log(`[MULTIFLOOR] Executing multifloor pickup workflow`);
    
    const robotConnection = await getRobotConnection(robot);
    const currentFloor = options.currentFloor || 1;
    const targetFloor = options.targetFloor || 2;
    const chargerFloor = options.chargerFloor || 1; // Floor where charger is located
    
    // Determine if this is actually a same-floor operation
    const isSameFloorOperation = currentFloor === targetFloor;
    
    try {
        // 0. If robot is not on the starting floor, use elevator to get there
        if (currentFloor !== chargerFloor) {
            console.log(`[MULTIFLOOR] Step 0: Robot needs to move from floor ${chargerFloor} to floor ${currentFloor}`);
            
            // 0a. Move to elevator waiting on charger floor
            console.log(`[MULTIFLOOR] Step 0a: Moving to elevator waiting on charger floor`);
            const chargerElevatorWaiting = await getElevatorWaitingPoint(robot, chargerFloor);
            const move0a = {
                type: 'standard',
                target_x: chargerElevatorWaiting.coordinates[0],
                target_y: chargerElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorWaiting.id
            };
            const move0aId = await sendMoveTask(robot, move0a);
            await waitForMoveComplete(robot, move0aId);

            // 0b. Call elevator to charger floor
            console.log(`[MULTIFLOOR] Step 0b: Calling elevator to floor ${chargerFloor}`);
            await elevatorController.selectFloor(chargerFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 0c. Open elevator doors
            console.log(`[MULTIFLOOR] Step 0c: Opening elevator doors`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 0d. Move to elevator inside on charger floor
            console.log(`[MULTIFLOOR] Step 0d: Moving to elevator inside on charger floor`);
            const chargerElevatorInside = await getElevatorInsidePoint(robot, chargerFloor);
            const move0d = {
                type: 'standard',
                target_x: chargerElevatorInside.coordinates[0],
                target_y: chargerElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorInside.id
            };
            const move0dId = await sendMoveTask(robot, move0d);
            await waitForMoveComplete(robot, move0dId);

            // 0e. Close elevator doors
            console.log(`[MULTIFLOOR] Step 0e: Closing elevator doors`);
            await elevatorController.closeDoor();
            await waitForElevatorStatus(elevatorController, 'doors_closed');

            // 0f. Move elevator to starting floor
            console.log(`[MULTIFLOOR] Step 0f: Moving elevator to floor ${currentFloor}`);
            await elevatorController.selectFloor(currentFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 0g. Open doors at starting floor
            console.log(`[MULTIFLOOR] Step 0g: Opening doors at starting floor`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 0h. Switch robot to starting floor map
            console.log(`[MULTIFLOOR] Step 0h: Switching to starting floor map`);
            await switchRobotMap(robotConnection, currentFloor);

            // 0i. Localize at elevator inside on starting floor
            console.log(`[MULTIFLOOR] Step 0i: Localizing at elevator inside on starting floor`);
            const startElevatorInside = await getElevatorInsidePoint(robot, currentFloor);
            const move0i = {
                type: 'localize',
                target_x: startElevatorInside.coordinates[0],
                target_y: startElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(startElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: startElevatorInside.id
            };
            const move0iId = await sendMoveTask(robot, move0i);
            await waitForMoveComplete(robot, move0iId);

            // 0j. Move to elevator waiting on starting floor
            console.log(`[MULTIFLOOR] Step 0j: Moving to elevator waiting on starting floor`);
            const startElevatorWaiting = await getElevatorWaitingPoint(robot, currentFloor);
            const move0j = {
                type: 'standard',
                target_x: startElevatorWaiting.coordinates[0],
                target_y: startElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(startElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: startElevatorWaiting.id
            };
            const move0jId = await sendMoveTask(robot, move0j);
            await waitForMoveComplete(robot, move0jId);

            // 0k. Release elevator control
            console.log(`[MULTIFLOOR] Step 0k: Releasing elevator control`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 1. Move to shelf docking
        console.log(`[MULTIFLOOR] Step 1: Moving to shelf docking`);
        const move1 = {
            type: 'standard',
            target_x: shelfLoadDocking.coordinates[0],
            target_y: shelfLoadDocking.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoadDocking.id
        };
        const move1Id = await sendMoveTask(robot, move1);
        await waitForMoveComplete(robot, move1Id);

        // 2. Align with shelf load
        console.log(`[MULTIFLOOR] Step 2: Aligning with shelf load`);
        const align1 = {
            type: 'align_with_rack',
            target_x: shelfLoad.coordinates[0],
            target_y: shelfLoad.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoad.id
        };
        const align1Id = await sendMoveTask(robot, align1);
        await waitForMoveComplete(robot, align1Id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Jack up
        console.log(`[MULTIFLOOR] Step 3: Jacking up`);
        await sendJack(robot, 'jack_up');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 4-14. Elevator steps (only if different floors)
        if (!isSameFloorOperation) {
            // 4. Move to elevator waiting
            console.log(`[MULTIFLOOR] Step 4: Moving to elevator waiting`);
            const elevatorWaiting = await getElevatorWaitingPoint(robot, currentFloor);
            const move2 = {
                type: 'standard',
                target_x: elevatorWaiting.coordinates[0],
                target_y: elevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(elevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: elevatorWaiting.id
            };
            const move2Id = await sendMoveTask(robot, move2);
            await waitForMoveComplete(robot, move2Id);

            // 5. Call elevator to current floor
            console.log(`[MULTIFLOOR] Step 5: Calling elevator to floor ${currentFloor}`);
            await elevatorController.selectFloor(currentFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 6. Open elevator doors
            console.log(`[MULTIFLOOR] Step 6: Opening elevator doors`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 7. Move to elevator inside
            console.log(`[MULTIFLOOR] Step 7: Moving to elevator inside`);
            const elevatorInside = await getElevatorInsidePoint(robot, currentFloor);
            const move3 = {
                type: 'standard',
                target_x: elevatorInside.coordinates[0],
                target_y: elevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(elevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: elevatorInside.id
            };
            const move3Id = await sendMoveTask(robot, move3);
            await waitForMoveComplete(robot, move3Id);

            // 8. Close elevator doors
            console.log(`[MULTIFLOOR] Step 8: Closing elevator doors`);
            await elevatorController.closeDoor();
            await waitForElevatorStatus(elevatorController, 'doors_closed');

            // 9. Move elevator to target floor
            console.log(`[MULTIFLOOR] Step 9: Moving elevator to floor ${targetFloor}`);
            await elevatorController.selectFloor(targetFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 10. Open doors at target floor
            console.log(`[MULTIFLOOR] Step 10: Opening doors at target floor`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 11. Switch robot to target floor map
            console.log(`[MULTIFLOOR] Step 11: Switching to target floor map`);
            await switchRobotMap(robotConnection, targetFloor);

            // 12. Localize at elevator inside on target floor
            console.log(`[MULTIFLOOR] Step 12: Localizing at elevator inside on target floor`);
            const targetElevatorInside = await getElevatorInsidePoint(robot, targetFloor);
            const move4 = {
                type: 'localize',
                target_x: targetElevatorInside.coordinates[0],
                target_y: targetElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(targetElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: targetElevatorInside.id
            };
            const move4Id = await sendMoveTask(robot, move4);
            await waitForMoveComplete(robot, move4Id);

            // 13. Move to elevator waiting on target floor
            console.log(`[MULTIFLOOR] Step 13: Moving to elevator waiting on target floor`);
            const targetElevatorWaiting = await getElevatorWaitingPoint(robot, targetFloor);
            const move5 = {
                type: 'standard',
                target_x: targetElevatorWaiting.coordinates[0],
                target_y: targetElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(targetElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: targetElevatorWaiting.id
            };
            const move5Id = await sendMoveTask(robot, move5);
            await waitForMoveComplete(robot, move5Id);

            // 14. Release elevator control
            console.log(`[MULTIFLOOR] Step 14: Releasing elevator control`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log(`[MULTIFLOOR] Skipping elevator steps 4-14 (same floor operation)`);
        }

        // 15. Move to central load docking
        console.log(`[MULTIFLOOR] Step 15: Moving to central load docking`);
        const move6 = {
            type: 'standard',
            target_x: centralLoadDocking.coordinates[0],
            target_y: centralLoadDocking.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoadDocking.id
        };
        const move6Id = await sendMoveTask(robot, move6);
        await waitForMoveComplete(robot, move6Id);

        // 16. Align with central load
        console.log(`[MULTIFLOOR] Step 16: Aligning with central load`);
        const move7 = {
            type: 'align_with_rack',
            target_x: centralLoad.coordinates[0],
            target_y: centralLoad.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoad.id
        };
        const move7Id = await sendMoveTask(robot, move7);
        await waitForMoveComplete(robot, move7Id);

        // 17. Jack down
        console.log(`[MULTIFLOOR] Step 17: Jacking down`);
        await sendJack(robot, 'jack_down');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 18-29. Return elevator steps (only if different floors)
        if (!isSameFloorOperation) {
            // 18. Move to elevator waiting on target floor
            console.log(`[MULTIFLOOR] Step 18: Moving to elevator waiting on target floor`);
            const returnElevatorWaiting = await getElevatorWaitingPoint(robot, targetFloor);
            const move8 = {
                type: 'standard',
                target_x: returnElevatorWaiting.coordinates[0],
                target_y: returnElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(returnElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: returnElevatorWaiting.id
            };
            const move8Id = await sendMoveTask(robot, move8);
            await waitForMoveComplete(robot, move8Id);

            // 19. Call elevator to target floor
            console.log(`[MULTIFLOOR] Step 19: Calling elevator to floor ${targetFloor}`);
            await elevatorController.selectFloor(targetFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 20. Open elevator doors
            console.log(`[MULTIFLOOR] Step 20: Opening elevator doors`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 21. Move to elevator inside on target floor
            console.log(`[MULTIFLOOR] Step 21: Moving to elevator inside on target floor`);
            const returnElevatorInside = await getElevatorInsidePoint(robot, targetFloor);
            const move9 = {
                type: 'standard',
                target_x: returnElevatorInside.coordinates[0],
                target_y: returnElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(returnElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: returnElevatorInside.id
            };
            const move9Id = await sendMoveTask(robot, move9);
            await waitForMoveComplete(robot, move9Id);

            // 22. Close elevator doors
            console.log(`[MULTIFLOOR] Step 22: Closing elevator doors`);
            await elevatorController.closeDoor();
            await waitForElevatorStatus(elevatorController, 'doors_closed');

            // 23. Move elevator to charger floor
            console.log(`[MULTIFLOOR] Step 23: Moving elevator to floor ${chargerFloor}`);
            await elevatorController.selectFloor(chargerFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 24. Open doors at charger floor
            console.log(`[MULTIFLOOR] Step 24: Opening doors at charger floor`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 25. Switch robot to charger floor map
            console.log(`[MULTIFLOOR] Step 25: Switching to charger floor map`);
            await switchRobotMap(robotConnection, chargerFloor);

            // 26. Localize at elevator inside on charger floor
            console.log(`[MULTIFLOOR] Step 26: Localizing at elevator inside on charger floor`);
            const chargerElevatorInsideReturn = await getElevatorInsidePoint(robot, chargerFloor);
            const move10 = {
                type: 'localize',
                target_x: chargerElevatorInsideReturn.coordinates[0],
                target_y: chargerElevatorInsideReturn.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorInsideReturn.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorInsideReturn.id
            };
            const move10Id = await sendMoveTask(robot, move10);
            await waitForMoveComplete(robot, move10Id);

            // 27. Move to elevator waiting on charger floor
            console.log(`[MULTIFLOOR] Step 27: Moving to elevator waiting on charger floor`);
            const chargerElevatorWaitingReturn = await getElevatorWaitingPoint(robot, chargerFloor);
            const move11 = {
                type: 'standard',
                target_x: chargerElevatorWaitingReturn.coordinates[0],
                target_y: chargerElevatorWaitingReturn.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorWaitingReturn.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorWaitingReturn.id
            };
            const move11Id = await sendMoveTask(robot, move11);
            await waitForMoveComplete(robot, move11Id);

            // 28. Release elevator control
            console.log(`[MULTIFLOOR] Step 28: Releasing elevator control`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log(`[MULTIFLOOR] Skipping elevator return steps 18-28 (same floor operation)`);
        }

        // 29. Return to charger
        console.log(`[MULTIFLOOR] Step 29: Returning to charger`);
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);

        console.log(`[MULTIFLOOR] Multifloor pickup workflow completed successfully`);
        
    } finally {
        robotConnection.disconnect();
    }
}

// Multifloor dropoff workflow implementation
async function executeMultifloorDropoff(robot, elevatorController, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options) {
    console.log(`[MULTIFLOOR] Executing multifloor dropoff workflow`);
    
    const robotConnection = await getRobotConnection(robot);
    const currentFloor = options.currentFloor || 1;
    const targetFloor = options.targetFloor || 2;
    const chargerFloor = options.chargerFloor || 1; // Floor where charger is located
    
    // Determine if this is actually a same-floor operation
    const isSameFloorOperation = currentFloor === targetFloor;
    
    try {
        // 0. If robot is not on the starting floor, use elevator to get there
        if (currentFloor !== chargerFloor) {
            console.log(`[MULTIFLOOR] Step 0: Robot needs to move from floor ${chargerFloor} to floor ${currentFloor}`);
            
            // 0a. Move to elevator waiting on charger floor
            console.log(`[MULTIFLOOR] Step 0a: Moving to elevator waiting on charger floor`);
            const chargerElevatorWaiting = await getElevatorWaitingPoint(robot, chargerFloor);
            const move0a = {
                type: 'standard',
                target_x: chargerElevatorWaiting.coordinates[0],
                target_y: chargerElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorWaiting.id
            };
            const move0aId = await sendMoveTask(robot, move0a);
            await waitForMoveComplete(robot, move0aId);

            // 0b. Call elevator to charger floor
            console.log(`[MULTIFLOOR] Step 0b: Calling elevator to floor ${chargerFloor}`);
            await elevatorController.selectFloor(chargerFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 0c. Open elevator doors
            console.log(`[MULTIFLOOR] Step 0c: Opening elevator doors`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 0d. Move to elevator inside on charger floor
            console.log(`[MULTIFLOOR] Step 0d: Moving to elevator inside on charger floor`);
            const chargerElevatorInside = await getElevatorInsidePoint(robot, chargerFloor);
            const move0d = {
                type: 'standard',
                target_x: chargerElevatorInside.coordinates[0],
                target_y: chargerElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorInside.id
            };
            const move0dId = await sendMoveTask(robot, move0d);
            await waitForMoveComplete(robot, move0dId);

            // 0e. Close elevator doors
            console.log(`[MULTIFLOOR] Step 0e: Closing elevator doors`);
            await elevatorController.closeDoor();
            await waitForElevatorStatus(elevatorController, 'doors_closed');

            // 0f. Move elevator to starting floor
            console.log(`[MULTIFLOOR] Step 0f: Moving elevator to floor ${currentFloor}`);
            await elevatorController.selectFloor(currentFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 0g. Open doors at starting floor
            console.log(`[MULTIFLOOR] Step 0g: Opening doors at starting floor`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 0h. Switch robot to starting floor map
            console.log(`[MULTIFLOOR] Step 0h: Switching to starting floor map`);
            await switchRobotMap(robotConnection, currentFloor);

            // 0i. Localize at elevator inside on starting floor
            console.log(`[MULTIFLOOR] Step 0i: Localizing at elevator inside on starting floor`);
            const startElevatorInside = await getElevatorInsidePoint(robot, currentFloor);
            const move0i = {
                type: 'localize',
                target_x: startElevatorInside.coordinates[0],
                target_y: startElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(startElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: startElevatorInside.id
            };
            const move0iId = await sendMoveTask(robot, move0i);
            await waitForMoveComplete(robot, move0iId);

            // 0j. Move to elevator waiting on starting floor
            console.log(`[MULTIFLOOR] Step 0j: Moving to elevator waiting on starting floor`);
            const startElevatorWaiting = await getElevatorWaitingPoint(robot, currentFloor);
            const move0j = {
                type: 'standard',
                target_x: startElevatorWaiting.coordinates[0],
                target_y: startElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(startElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: startElevatorWaiting.id
            };
            const move0jId = await sendMoveTask(robot, move0j);
            await waitForMoveComplete(robot, move0jId);

            // 0k. Release elevator control
            console.log(`[MULTIFLOOR] Step 0k: Releasing elevator control`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 1. Move to central load docking
        console.log(`[MULTIFLOOR] Step 1: Moving to central load docking`);
        const move1 = {
            type: 'standard',
            target_x: centralLoadDocking.coordinates[0],
            target_y: centralLoadDocking.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoadDocking.id
        };
        const move1Id = await sendMoveTask(robot, move1);
        await waitForMoveComplete(robot, move1Id);

        // 2. Align with central load
        console.log(`[MULTIFLOOR] Step 2: Aligning with central load`);
        const align1 = {
            type: 'align_with_rack',
            target_x: centralLoad.coordinates[0],
            target_y: centralLoad.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoad.id
        };
        const align1Id = await sendMoveTask(robot, align1);
        await waitForMoveComplete(robot, align1Id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Jack up
        console.log(`[MULTIFLOOR] Step 3: Jacking up`);
        await sendJack(robot, 'jack_up');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 4-14. Elevator steps (only if different floors)
        if (!isSameFloorOperation) {
            // 4. Move to elevator waiting
            console.log(`[MULTIFLOOR] Step 4: Moving to elevator waiting`);
            const elevatorWaiting = await getElevatorWaitingPoint(robot, currentFloor);
            const move2 = {
                type: 'standard',
                target_x: elevatorWaiting.coordinates[0],
                target_y: elevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(elevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: elevatorWaiting.id
            };
            const move2Id = await sendMoveTask(robot, move2);
            await waitForMoveComplete(robot, move2Id);

            // 5. Call elevator to current floor
            console.log(`[MULTIFLOOR] Step 5: Calling elevator to floor ${currentFloor}`);
            await elevatorController.selectFloor(currentFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 6. Open elevator doors
            console.log(`[MULTIFLOOR] Step 6: Opening elevator doors`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 7. Move to elevator inside
            console.log(`[MULTIFLOOR] Step 7: Moving to elevator inside`);
            const elevatorInside = await getElevatorInsidePoint(robot, currentFloor);
            const move3 = {
                type: 'standard',
                target_x: elevatorInside.coordinates[0],
                target_y: elevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(elevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: elevatorInside.id
            };
            const move3Id = await sendMoveTask(robot, move3);
            await waitForMoveComplete(robot, move3Id);

            // 8. Close elevator doors
            console.log(`[MULTIFLOOR] Step 8: Closing elevator doors`);
            await elevatorController.closeDoor();
            await waitForElevatorStatus(elevatorController, 'doors_closed');

            // 9. Move elevator to target floor
            console.log(`[MULTIFLOOR] Step 9: Moving elevator to floor ${targetFloor}`);
            await elevatorController.selectFloor(targetFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 10. Open doors at target floor
            console.log(`[MULTIFLOOR] Step 10: Opening doors at target floor`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 11. Switch robot to target floor map
            console.log(`[MULTIFLOOR] Step 11: Switching to target floor map`);
            await switchRobotMap(robotConnection, targetFloor);

            // 12. Localize at elevator inside on target floor
            console.log(`[MULTIFLOOR] Step 12: Localizing at elevator inside on target floor`);
            const targetElevatorInside = await getElevatorInsidePoint(robot, targetFloor);
            const move4 = {
                type: 'localize',
                target_x: targetElevatorInside.coordinates[0],
                target_y: targetElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(targetElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: targetElevatorInside.id
            };
            const move4Id = await sendMoveTask(robot, move4);
            await waitForMoveComplete(robot, move4Id);

            // 13. Move to elevator waiting on target floor
            console.log(`[MULTIFLOOR] Step 13: Moving to elevator waiting on target floor`);
            const targetElevatorWaiting = await getElevatorWaitingPoint(robot, targetFloor);
            const move5 = {
                type: 'standard',
                target_x: targetElevatorWaiting.coordinates[0],
                target_y: targetElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(targetElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: targetElevatorWaiting.id
            };
            const move5Id = await sendMoveTask(robot, move5);
            await waitForMoveComplete(robot, move5Id);

            // 14. Release elevator control
            console.log(`[MULTIFLOOR] Step 14: Releasing elevator control`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log(`[MULTIFLOOR] Skipping elevator steps 4-14 (same floor operation)`);
        }

        // 15. Move to shelf load docking
        console.log(`[MULTIFLOOR] Step 15: Moving to shelf load docking`);
        const move6 = {
            type: 'standard',
            target_x: shelfLoadDocking.coordinates[0],
            target_y: shelfLoadDocking.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoadDocking.id
        };
        const move6Id = await sendMoveTask(robot, move6);
        await waitForMoveComplete(robot, move6Id);

        // 16. Align with shelf load
        console.log(`[MULTIFLOOR] Step 16: Aligning with shelf load`);
        const move7 = {
            type: 'align_with_rack',
            target_x: shelfLoad.coordinates[0],
            target_y: shelfLoad.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoad.id
        };
        const move7Id = await sendMoveTask(robot, move7);
        await waitForMoveComplete(robot, move7Id);

        // 17. Jack down
        console.log(`[MULTIFLOOR] Step 17: Jacking down`);
        await sendJack(robot, 'jack_down');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 18-29. Return elevator steps (only if different floors)
        if (!isSameFloorOperation) {
            // 18. Move to elevator waiting on target floor
            console.log(`[MULTIFLOOR] Step 18: Moving to elevator waiting on target floor`);
            const returnElevatorWaiting = await getElevatorWaitingPoint(robot, targetFloor);
            const move8 = {
                type: 'standard',
                target_x: returnElevatorWaiting.coordinates[0],
                target_y: returnElevatorWaiting.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(returnElevatorWaiting.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: returnElevatorWaiting.id
            };
            const move8Id = await sendMoveTask(robot, move8);
            await waitForMoveComplete(robot, move8Id);

            // 19. Call elevator to target floor
            console.log(`[MULTIFLOOR] Step 19: Calling elevator to floor ${targetFloor}`);
            await elevatorController.selectFloor(targetFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 20. Open elevator doors
            console.log(`[MULTIFLOOR] Step 20: Opening elevator doors`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 21. Move to elevator inside on target floor
            console.log(`[MULTIFLOOR] Step 21: Moving to elevator inside on target floor`);
            const returnElevatorInside = await getElevatorInsidePoint(robot, targetFloor);
            const move9 = {
                type: 'standard',
                target_x: returnElevatorInside.coordinates[0],
                target_y: returnElevatorInside.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(returnElevatorInside.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: returnElevatorInside.id
            };
            const move9Id = await sendMoveTask(robot, move9);
            await waitForMoveComplete(robot, move9Id);

            // 22. Close elevator doors
            console.log(`[MULTIFLOOR] Step 22: Closing elevator doors`);
            await elevatorController.closeDoor();
            await waitForElevatorStatus(elevatorController, 'doors_closed');

            // 23. Move elevator to charger floor
            console.log(`[MULTIFLOOR] Step 23: Moving elevator to floor ${chargerFloor}`);
            await elevatorController.selectFloor(chargerFloor);
            await waitForElevatorStatus(elevatorController, 'at_floor');

            // 24. Open doors at charger floor
            console.log(`[MULTIFLOOR] Step 24: Opening doors at charger floor`);
            await elevatorController.openDoor();
            await waitForElevatorStatus(elevatorController, 'doors_open');

            // 25. Switch robot to charger floor map
            console.log(`[MULTIFLOOR] Step 25: Switching to charger floor map`);
            await switchRobotMap(robotConnection, chargerFloor);

            // 26. Localize at elevator inside on charger floor
            console.log(`[MULTIFLOOR] Step 26: Localizing at elevator inside on charger floor`);
            const chargerElevatorInsideReturn = await getElevatorInsidePoint(robot, chargerFloor);
            const move10 = {
                type: 'localize',
                target_x: chargerElevatorInsideReturn.coordinates[0],
                target_y: chargerElevatorInsideReturn.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorInsideReturn.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorInsideReturn.id
            };
            const move10Id = await sendMoveTask(robot, move10);
            await waitForMoveComplete(robot, move10Id);

            // 27. Move to elevator waiting on charger floor
            console.log(`[MULTIFLOOR] Step 27: Moving to elevator waiting on charger floor`);
            const chargerElevatorWaitingReturn = await getElevatorWaitingPoint(robot, chargerFloor);
            const move11 = {
                type: 'standard',
                target_x: chargerElevatorWaitingReturn.coordinates[0],
                target_y: chargerElevatorWaitingReturn.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(chargerElevatorWaitingReturn.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: chargerElevatorWaitingReturn.id
            };
            const move11Id = await sendMoveTask(robot, move11);
            await waitForMoveComplete(robot, move11Id);

            // 28. Release elevator control
            console.log(`[MULTIFLOOR] Step 28: Releasing elevator control`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log(`[MULTIFLOOR] Skipping elevator return steps 18-28 (same floor operation)`);
        }

        // 29. Return to charger
        console.log(`[MULTIFLOOR] Step 29: Returning to charger`);
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);

        console.log(`[MULTIFLOOR] Multifloor dropoff workflow completed successfully`);
        
    } finally {
        robotConnection.disconnect();
    }
}

// Helper functions to get elevator points
async function getElevatorWaitingPoint(robot, floor) {
    const mapName = `Floor${floor}`;
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [robot.serialNumber, mapName]
    );
    
    if (mapResult.rows.length === 0) {
        throw new Error(`Map ${mapName} not found for robot ${robot.serialNumber}`);
    }
    
    let features = mapResult.rows[0].features;
    if (typeof features === 'string') {
        features = JSON.parse(features);
    }
    
    const elevatorWaiting = features.find(f => f.name === 'Elevator_waiting');
    if (!elevatorWaiting) {
        throw new Error(`Elevator waiting point not found in map ${mapName}`);
    }
    
    return elevatorWaiting;
}

async function getElevatorInsidePoint(robot, floor) {
    const mapName = `Floor${floor}`;
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [robot.serialNumber, mapName]
    );
    
    if (mapResult.rows.length === 0) {
        throw new Error(`Map ${mapName} not found for robot ${robot.serialNumber}`);
    }
    
    let features = mapResult.rows[0].features;
    if (typeof features === 'string') {
        features = JSON.parse(features);
    }
    
    const elevatorInside = features.find(f => f.name === 'Elevator_inside');
    if (!elevatorInside) {
        throw new Error(`Elevator inside point not found in map ${mapName}`);
    }
    
    return elevatorInside;
}

app.post('/api/templates/:id/tasks', authenticateToken, async (req, res) => {
    console.log('POST /api/templates/:id/tasks called with:', req.body);
    const { id } = req.params;
    const { type, floor, shelfPoint } = req.body;

    if (!type || !floor || !shelfPoint) {
        console.error('Missing required fields:', req.body);
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the template and assigned robot
    const templateResult = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (templateResult.rows.length === 0) {
        console.error('Template not found for id:', id);
        return res.status(404).json({ error: 'Template not found' });
    }

    // Parse and normalize robot data
    let robot = templateResult.rows[0].robot;
    if (typeof robot === 'string') {
        try { 
            robot = JSON.parse(robot); 
        } catch (e) { 
            console.error('Error parsing robot JSON:', e);
            robot = null; 
        }
    }

    // Log raw robot data
    console.log('Raw robot data from database:', robot);

    if (!robot) {
        console.error('No robot data found in template');
        return res.status(400).json({ error: 'No robot assigned to this template' });
    }

    // Normalize robot properties to match RobotConfig expectations
    const normalizedRobot = {
        serialNumber: robot.serial_number,
        publicIP: robot.public_ip,
        privateIP: robot.private_ip,
        secretKey: robot.secret_key
    };

    // Log normalized robot data
    console.log('Normalized robot data:', normalizedRobot);

    if (!normalizedRobot.serialNumber || !normalizedRobot.publicIP || !normalizedRobot.privateIP || !normalizedRobot.secretKey) {
        console.error('Missing required robot properties:', normalizedRobot);
        return res.status(400).json({ error: 'Robot configuration is incomplete' });
    }

    // Get the correct map for the floor
    const mapName = `Floor${floor}`;
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [normalizedRobot.serialNumber, mapName]
    );
    if (mapResult.rows.length === 0) {
        console.error(`Map for Floor${floor} not found for robot ${normalizedRobot.serialNumber}`);
        return res.status(404).json({ error: `Map for Floor${floor} not found for this robot` });
    }
    
    let features = mapResult.rows[0].features;
    if (typeof features === 'string') {
        try { 
            features = JSON.parse(features);
            console.log(`[FEATURES] Parsed features for ${mapName}:`, features);
        } catch (e) { 
            console.error(`[FEATURES] Failed to parse features:`, e);
            features = []; 
        }
    }

    // Helper to extract info from a feature name
    function getFeatureInfo(name) {
        const feature = features.find(f => f.name === name);
        console.log(`[FEATURES] Looking for feature "${name}":`, feature);
        return feature;
    }

    // Get all required points
    const centralBase = type === 'pickup' ? '050' : '001';
    const centralLoad = getFeatureInfo(`${centralBase}_load`);
    const centralLoadDocking = getFeatureInfo(`${centralBase}_load_docking`);
    const shelfLoad = getFeatureInfo(`${shelfPoint}_load`);
    const shelfLoadDocking = getFeatureInfo(`${shelfPoint}_load_docking`);
    const charger = getFeatureInfo('Charging Station_docking') || getFeatureInfo('Charging Station');

    // Debug: Log which required features are missing
    if (!centralLoad) console.error('Missing feature:', `${centralBase}_load`);
    if (!centralLoadDocking) console.error('Missing feature:', `${centralBase}_load_docking`);
    if (!shelfLoad) console.error('Missing feature:', `${shelfPoint}_load`);
    if (!shelfLoadDocking) console.error('Missing feature:', `${shelfPoint}_load_docking`);
    if (!charger) console.error('Missing feature: charger');

    const isReturnOrHome = type === 'go_home' || type === 'return_to_charger';
    if (
        (!isReturnOrHome && (!centralLoad || !centralLoadDocking || !shelfLoad || !shelfLoadDocking || !charger)) ||
        (isReturnOrHome && !charger)
    ) {
        return res.status(404).json({ 
            error: 'One or more required point sets not found in map features',
            missing: {
                centralLoad: !centralLoad,
                centralLoadDocking: !centralLoadDocking,
                shelfLoad: !shelfLoad,
                shelfLoadDocking: !shelfLoadDocking,
                charger: !charger
            }
        });
    }

    // Build enriched data object
    const enrichedData = {
        type,
        floor,
        shelfPoint,
        robot: normalizedRobot,
        mapName,
        centralLoad,
        centralLoadDocking,
        shelfLoad,
        shelfLoadDocking,
        charger
    };

    // Insert the enriched task into the queue
    try {
        await db.query(
            `INSERT INTO task_queue (template_id, robot_serial_number, type, floor, shelf_point, status, enriched_data)
             VALUES ($1, $2, $3, $4, $5, 'queued', $6)`,
            [
                id,
                normalizedRobot.serialNumber,
                type,
                floor,
                shelfPoint,
                JSON.stringify(enrichedData)
            ]
        );
        return res.status(201).json({ message: 'Task queued successfully' });
    } catch (err) {
        console.error('Error inserting task into queue:', err);
        return res.status(500).json({ error: 'Failed to queue task', details: err.message });
    }
});

// Add queue-task endpoint that mirrors the tasks endpoint but makes it clear it's for queuing only
app.post('/api/templates/:id/queue-task', authenticateToken, async (req, res) => {
    console.log('POST /api/templates/:id/queue-task called with:', req.body);
    const { id } = req.params;
    const { type, floor, shelfPoint } = req.body;

    if (!type || !floor || !shelfPoint) {
        console.error('Missing required fields:', req.body);
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the template and assigned robot
    const templateResult = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (templateResult.rows.length === 0) {
        console.error('Template not found for id:', id);
        return res.status(404).json({ error: 'Template not found' });
    }

    // Parse and normalize robot data
    let robot = templateResult.rows[0].robot;
    if (typeof robot === 'string') {
        try { 
            robot = JSON.parse(robot); 
        } catch (e) { 
            console.error('Error parsing robot JSON:', e);
            robot = null; 
        }
    }

    // Log raw robot data
    console.log('Raw robot data from database:', robot);

    if (!robot) {
        console.error('No robot data found in template');
        return res.status(400).json({ error: 'No robot assigned to this template' });
    }

    // Normalize robot properties to match RobotConfig expectations
    const normalizedRobot = {
        serialNumber: robot.serial_number,
        publicIP: robot.public_ip,
        privateIP: robot.private_ip,
        secretKey: robot.secret_key
    };

    // Log normalized robot data
    console.log('Normalized robot data:', normalizedRobot);

    if (!normalizedRobot.serialNumber || !normalizedRobot.publicIP || !normalizedRobot.privateIP || !normalizedRobot.secretKey) {
        console.error('Missing required robot properties:', normalizedRobot);
        return res.status(400).json({ error: 'Robot configuration is incomplete' });
    }

    // Get the correct map for the floor
    const mapName = `Floor${floor}`;
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [normalizedRobot.serialNumber, mapName]
    );
    if (mapResult.rows.length === 0) {
        console.error(`Map for Floor${floor} not found for robot ${normalizedRobot.serialNumber}`);
        return res.status(404).json({ error: `Map for Floor${floor} not found for this robot` });
    }
    
    let features = mapResult.rows[0].features;
    if (typeof features === 'string') {
        try { 
            features = JSON.parse(features);
            console.log(`[FEATURES] Parsed features for ${mapName}:`, features);
        } catch (e) { 
            console.error(`[FEATURES] Failed to parse features:`, e);
            features = []; 
        }
    }

    // Helper to extract info from a feature name
    function getFeatureInfo(name) {
        const feature = features.find(f => f.name === name);
        console.log(`[FEATURES] Looking for feature "${name}":`, feature);
        return feature;
    }

    // Get all required points
    const centralBase = type === 'pickup' ? '050' : '001';
    const centralLoad = getFeatureInfo(`${centralBase}_load`);
    const centralLoadDocking = getFeatureInfo(`${centralBase}_load_docking`);
    const shelfLoad = getFeatureInfo(`${shelfPoint}_load`);
    const shelfLoadDocking = getFeatureInfo(`${shelfPoint}_load_docking`);
    const charger = getFeatureInfo('Charging Station_docking') || getFeatureInfo('Charging Station');

    // Debug: Log which required features are missing
    if (!centralLoad) console.error('Missing feature:', `${centralBase}_load`);
    if (!centralLoadDocking) console.error('Missing feature:', `${centralBase}_load_docking`);
    if (!shelfLoad) console.error('Missing feature:', `${shelfPoint}_load`);
    if (!shelfLoadDocking) console.error('Missing feature:', `${shelfPoint}_load_docking`);
    if (!charger) console.error('Missing feature: charger');

    const isReturnOrHome = type === 'go_home' || type === 'return_to_charger';
    if (
        (!isReturnOrHome && (!centralLoad || !centralLoadDocking || !shelfLoad || !shelfLoadDocking || !charger)) ||
        (isReturnOrHome && !charger)
    ) {
        return res.status(404).json({ 
            error: 'One or more required point sets not found in map features',
            missing: {
                centralLoad: !centralLoad,
                centralLoadDocking: !centralLoadDocking,
                shelfLoad: !shelfLoad,
                shelfLoadDocking: !shelfLoadDocking,
                charger: !charger
            }
        });
    }

    // Build enriched data object
    const enrichedData = {
        type,
        floor,
        shelfPoint,
        robot: normalizedRobot,
        mapName,
        centralLoad,
        centralLoadDocking,
        shelfLoad,
        shelfLoadDocking,
        charger
    };

    // Insert the enriched task into the queue
    try {
        await db.query(
            `INSERT INTO task_queue (template_id, robot_serial_number, type, floor, shelf_point, status, enriched_data)
             VALUES ($1, $2, $3, $4, $5, 'queued', $6)`,
            [
                id,
                normalizedRobot.serialNumber,
                type,
                floor,
                shelfPoint,
                JSON.stringify(enrichedData)
            ]
        );
        return res.status(201).json({ message: 'Task queued successfully' });
    } catch (err) {
        console.error('Error inserting task into queue:', err);
        return res.status(500).json({ error: 'Failed to queue task', details: err.message });
    }
});

// Queue manager to process tasks
setInterval(async () => {
    try {
        const robotsWithQueued = await db.query(`
            SELECT DISTINCT robot_serial_number FROM task_queue WHERE status = 'queued'
        `);
        for (const row of robotsWithQueued.rows) {
            const robotSerial = row.robot_serial_number;
            const inProgress = await db.query(
                `SELECT * FROM task_queue WHERE robot_serial_number = $1 AND status = 'in_progress'`,
                [robotSerial]
            );
            if (inProgress.rows.length > 0) continue;
            const queued = await db.query(
                `SELECT * FROM task_queue WHERE robot_serial_number = $1 AND status = 'queued' ORDER BY created_at ASC LIMIT 1`,
                [robotSerial]
            );
            if (queued.rows.length === 0) continue;
            const task = queued.rows[0];
            await db.query(
                `UPDATE task_queue SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
                [task.id]
            );
            console.log(`[QUEUE-MANAGER] Picked up task ${task.id} for robot ${robotSerial}. Executing workflow...`);
            try {
                let enrichedData = task.enriched_data;
                if (typeof enrichedData === 'string') {
                    try {
                        enrichedData = JSON.parse(enrichedData);
                    } catch (e) {
                        console.error('Failed to parse enriched_data:', e);
                        enrichedData = {};
                    }
                }
                
                // Check if template has multifloor enabled
                const templateResult = await db.query('SELECT multifloor FROM templates WHERE id = $1', [task.template_id]);
                const isMultifloor = templateResult.rows.length > 0 ? templateResult.rows[0].multifloor : false;
                
                // Determine workflow type based on template settings and elevator points
                let workflowType = enrichedData.type;
                if (enrichedData.type === 'pickup' || enrichedData.type === 'dropoff') {
                    // Check if elevator points are available (for multi-story robots)
                    const hasElevatorPoints = enrichedData.elevatorWaiting && enrichedData.elevatorInside;
                    
                    if (hasElevatorPoints) {
                        // Robot has elevator points, use template settings
                        workflowType = determineWorkflowType(isMultifloor, enrichedData.type);
                        console.log(`[QUEUE-MANAGER] Template settings - Multifloor: ${isMultifloor}`);
                        console.log(`[QUEUE-MANAGER] Robot has elevator points, using workflow: ${workflowType}`);
                    } else {
                        // Robot is single-story, force single-story workflow
                        workflowType = enrichedData.type;
                        console.log(`[QUEUE-MANAGER] Robot is single-story (no elevator points), forcing workflow: ${workflowType}`);
                    }
                }
                
                // Execute appropriate workflow
                if (workflowType.startsWith('multifloor_')) {
                    await executeMultifloorWorkflow(
                        enrichedData.robot,
                        workflowType,
                        enrichedData.centralLoad,
                        enrichedData.centralLoadDocking,
                        enrichedData.shelfLoad,
                        enrichedData.shelfLoadDocking,
                        enrichedData.charger,
                        {
                            ...enrichedData.options,
                            elevatorWaiting: enrichedData.elevatorWaiting,
                            elevatorInside: enrichedData.elevatorInside,
                            templateId: task.template_id
                        }
                    );
                } else {
                await executeWorkflow(
                    enrichedData.robot,
                    enrichedData.type,
                    enrichedData.centralLoad,
                    enrichedData.centralLoadDocking,
                    enrichedData.shelfLoad,
                    enrichedData.shelfLoadDocking,
                    enrichedData.charger,
                    {
                        ...enrichedData.options,
                        elevatorWaiting: enrichedData.elevatorWaiting,
                        elevatorInside: enrichedData.elevatorInside,
                        templateId: task.template_id
                    }
                );
                }
                await db.query(
                    `UPDATE task_queue SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                    [task.id]
                );
                console.log(`[QUEUE-MANAGER] Completed task ${task.id} for robot ${robotSerial}.`);
            } catch (err) {
                await db.query(
                    `UPDATE task_queue SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
                    [task.id, err.message || String(err)]
                );
                console.error(`[QUEUE-MANAGER] Task ${task.id} failed:`, err);
            }
        }
    } catch (err) {
        console.error('[QUEUE-MANAGER] Error:', err);
    }
}, 5000);

// Get the task queue for a template (optionally filter by robot)
app.get('/api/templates/:id/queue', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { robotSerial } = req.query; // optional
    try {
        let query = `SELECT * FROM task_queue WHERE template_id = $1 ORDER BY created_at ASC`;
        let params = [id];
        if (robotSerial) {
            query = `SELECT * FROM task_queue WHERE template_id = $1 AND robot_serial_number = $2 ORDER BY created_at ASC`;
            params.push(robotSerial);
        }
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching task queue:', err);
        res.status(500).json({ error: 'Failed to fetch task queue' });
    }
});

// Cancel a task in the queue (queued: delete, in_progress: cancel and queue return_to_charger)
app.post('/api/templates/:templateId/queue/:taskId/cancel', authenticateToken, async (req, res) => {
    const { templateId, taskId } = req.params;
    try {
        // Get the task
        const taskResult = await db.query('SELECT * FROM task_queue WHERE id = $1', [taskId]);
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const task = taskResult.rows[0];
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            return res.status(400).json({ error: `Task already ${task.status}` });
        }
        if (task.status === 'queued') {
            // Delete the queued task
            await db.query('DELETE FROM task_queue WHERE id = $1', [taskId]);
            return res.json({ message: 'Queued task cancelled and deleted' });
        }
        if (task.status === 'in_progress') {
            // Mark as cancelled
            await db.query("UPDATE task_queue SET status = 'cancelled', completed_at = NOW() WHERE id = $1", [taskId]);
            // Try to send cancel/stop to robot (best effort)
            try {
                const serialNumber = task.robot_serial_number;
                if (robotManager.robots && robotManager.robots.has(serialNumber)) {
                    const robot = robotManager.robots.get(serialNumber).connection;
                    if (robot && typeof robot.send === 'function') {
                        robot.send({ type: 'cancel' });
                    }
                }
            } catch (err) {
                console.warn('Failed to send cancel to robot:', err);
            }
            // Insert a return_to_charger task for this robot, using enriched map features
            let enrichedData = task.enriched_data;
            if (typeof enrichedData === 'string') {
                try { enrichedData = JSON.parse(enrichedData); } catch (e) { enrichedData = {}; }
            }
            // Only proceed if we have robot info
            if (!enrichedData.robot) {
                return res.status(500).json({ error: 'Missing robot info for return_to_charger' });
            }
            // Determine if carryingBin (e.g., if task was after jackup)
            // For now, assume carryingBin if task type was 'pickup' or 'dropoff' and status was in_progress
            const carryingBin = enrichedData.type === 'pickup' || enrichedData.type === 'dropoff';
            // Use the same shelfPoint as the original task if carryingBin
            const shelfPoint = carryingBin ? enrichedData.shelfPoint : null;
            let features;
            try {
                features = await getRequiredFeaturesForTask(enrichedData.robot, enrichedData.floor, shelfPoint, 'return_to_charger', carryingBin);
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!features.charger) {
                return res.status(500).json({ error: 'Missing charger info for return_to_charger' });
            }
            // Fetch the full robot object from the database
            const robotResult = await db.query('SELECT * FROM robots WHERE serial_number = $1', [enrichedData.robot.serialNumber]);
            if (robotResult.rows.length === 0) {
                return res.status(500).json({ error: 'Robot not found in database for return_to_charger' });
            }
            const dbRobot = robotResult.rows[0];
            const normalizedRobot = {
                serialNumber: dbRobot.serial_number,
                publicIP: dbRobot.public_ip,
                privateIP: dbRobot.private_ip,
                secretKey: dbRobot.secret_key,
                name: dbRobot.name
            };

            const returnTask = {
                template_id: templateId,
                robot_serial_number: normalizedRobot.serialNumber,
                type: 'return_to_charger',
                floor: enrichedData.floor,
                shelf_point: shelfPoint,
                status: 'queued',
                enriched_data: JSON.stringify({
                    type: 'return_to_charger',
                    floor: enrichedData.floor,
                    robot: normalizedRobot,
                    mapName: features.mapName,
                    charger: features.charger,
                    shelfLoad: features.shelfLoad,
                    shelfLoadDocking: features.shelfLoadDocking,
                    options: { carryingBin }
                })
            };
            await db.query(
                `INSERT INTO task_queue (template_id, robot_serial_number, type, floor, shelf_point, status, enriched_data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    returnTask.template_id,
                    returnTask.robot_serial_number,
                    returnTask.type,
                    returnTask.floor,
                    returnTask.shelf_point,
                    returnTask.status,
                    returnTask.enriched_data
                ]
            );
            return res.json({ message: 'In-progress task cancelled, return_to_charger task queued' });
        }
        return res.status(400).json({ error: 'Unknown task status' });
    } catch (err) {
        console.error('Error cancelling task:', err);
        return res.status(500).json({ error: 'Failed to cancel task', details: err.message });
    }
});

// --- Connect to all robots on startup ---
async function connectAllRobots() {
    try {
        const robotsResult = await db.query('SELECT * FROM robots WHERE status != \'deleted\'');
        for (const robot of robotsResult.rows) {
            try {
                robotManager.addRobot({
                    serialNumber: robot.serial_number,
                    secretKey: robot.secret_key,
                    publicIP: robot.public_ip,
                    privateIP: robot.private_ip
                });
                await robotManager.connectRobot(robot.serial_number);
                console.log(`Connected to robot: ${robot.name || robot.serial_number}`);
            } catch (err) {
                console.error(`Failed to connect to robot ${robot.name || robot.serial_number}:`, err);
            }
        }
    } catch (err) {
        console.error('Error connecting to robots on startup:', err);
    }
}
connectAllRobots();

// --- Periodically pull map data from all robots every 30 seconds ---
const { getRobotMaps } = require('./robot-maps.js');
setInterval(async () => {
    try {
        const robotsResult = await db.query('SELECT * FROM robots');
        console.log(`[MAP-PULL] Found ${robotsResult.rows.length} robots in database.`);
        if (robotsResult.rows.length === 0) {
            console.warn('[MAP-PULL] No robots found in database.');
        }
        for (const robot of robotsResult.rows) {
            try {
                const robotObj = {
                    name: robot.name,
                    publicIP: robot.public_ip,
                    privateIP: robot.private_ip,
                    serialNumber: robot.serial_number,
                    secretKey: robot.secret_key
                };
                console.log(`[MAP-PULL] Pulling maps for robot: ${robotObj.serialNumber} (${robotObj.publicIP})`);
                const maps = await getRobotMaps(robotObj);
                console.log(`[MAP-PULL] Pulled ${maps.length} maps for robot: ${robotObj.serialNumber}`);
                // Delete existing maps for this robot
                await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [robotObj.serialNumber]);
                for (const map of maps) {
                    await db.query(
                        `INSERT INTO maps (
                            robot_serial_number, map_name, features, uid, create_time, map_version, overlays_version, thumbnail_url, image_url, url
                        ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8, $9, $10)`,
                        [
                            robotObj.serialNumber,
                            map.map_name,
                            JSON.stringify(map.features),
                            map.uid,
                            map.create_time,
                            map.map_version,
                            map.overlays_version,
                            map.thumbnail_url,
                            map.image_url,
                            map.url
                        ]
                    );
                }
                console.log(`[MAP-PULL] Updated maps for robot: ${robotObj.serialNumber}`);
            } catch (err) {
                console.error(`[MAP-PULL] Failed to update maps for robot ${robot.serial_number}:`, err);
            }
        }
    } catch (err) {
        console.error('[MAP-PULL] Error during periodic map pulling:', err);
    }
}, 30000);

// === Relay Management Endpoints ===

// Get all registered relays
app.get('/api/relays', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT r.*, t.name as template_name, t.id as template_id
            FROM relays r
            LEFT JOIN templates t ON r.template_id = t.id
            ORDER BY r.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching relays:', err);
        res.status(500).json({ error: 'Failed to fetch relays' });
    }
});

// === Enhanced Relay Management Endpoints ===

// Get all relay configurations
app.get('/api/relay-configurations', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM relay_configurations 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching relay configurations:', err);
        res.status(500).json({ error: 'Failed to fetch relay configurations' });
    }
});

// Create new relay configuration
app.post('/api/relay-configurations', authenticateToken, async (req, res) => {
    const { relay_id, relay_name, ssid, password, mac_address } = req.body;
    
    console.log('POST /api/relay-configurations called');
    console.log('Incoming data:', req.body);
    
    if (!relay_id || !relay_name || !ssid || !password) {
        console.log('Missing required fields');
        return res.status(400).json({ error: 'Relay ID, name, SSID, and password are required' });
    }
    
    try {
        // Check if configuration already exists
        const existingResult = await db.query('SELECT * FROM relay_configurations WHERE relay_id = $1', [relay_id]);
        if (existingResult.rows.length > 0) {
            console.log('Duplicate relay_id');
            return res.status(409).json({ error: 'Relay configuration with this ID already exists' });
        }
        
        // Insert new configuration with MAC address support
        const result = await db.query(`
            INSERT INTO relay_configurations (relay_id, relay_name, ssid, password, mac_address, ip_address, port)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            relay_id, 
            relay_name, 
            ssid, 
            password, 
            mac_address || null, // MAC address (optional)
            null, // ip_address - will be auto-assigned
            40000 // port - default to 40000 for skytechautomated.com
        ]);
        
        console.log('Insert result:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating relay configuration:', err);
        res.status(500).json({ error: 'Failed to create relay configuration', details: err.message });
    }
});

// Get all connected relays
app.get('/api/connected-relays', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT cr.*, rc.relay_id, rc.relay_name as config_name
            FROM connected_relays cr
            LEFT JOIN relay_configurations rc ON cr.relay_config_id = rc.id
            ORDER BY cr.last_seen DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching connected relays:', err);
        res.status(500).json({ error: 'Failed to fetch connected relays' });
    }
});

// Get relay statistics
app.get('/api/relay-statistics', authenticateToken, async (req, res) => {
    try {
        const [configsResult, connectedResult, onlineResult, offlineResult] = await Promise.all([
            db.query('SELECT COUNT(*) as count FROM relay_configurations'),
            db.query('SELECT COUNT(*) as count FROM connected_relays'),
            db.query("SELECT COUNT(*) as count FROM connected_relays WHERE status = 'online'"),
            db.query("SELECT COUNT(*) as count FROM connected_relays WHERE status = 'offline'")
        ]);
        
        res.json({
            total_configs: parseInt(configsResult.rows[0].count),
            total_connected: parseInt(connectedResult.rows[0].count),
            online_relays: parseInt(onlineResult.rows[0].count),
            offline_relays: parseInt(offlineResult.rows[0].count)
        });
    } catch (err) {
        console.error('Error fetching relay statistics:', err);
        res.status(500).json({ error: 'Failed to fetch relay statistics' });
    }
});

// === Relay Programming Endpoints ===

// Get available ports for programming
app.get('/api/relay-programming/ports', authenticateToken, async (req, res) => {
    try {
        console.log('Scanning for available COM ports...');
        
        // Use serialport library to scan for available ports
        const ports = await SerialPort.list();
        
        console.log(`Found ${ports.length} available ports:`, ports.map(p => p.path));
        
        // Format the ports for the frontend
        const formattedPorts = ports.map(port => ({
            path: port.path,
            manufacturer: port.manufacturer || 'Unknown',
            serialNumber: port.serialNumber || 'No Serial',
            pnpId: port.pnpId || null,
            locationId: port.locationId || null,
            productId: port.productId || null,
            vendorId: port.vendorId || null
        }));
        
        res.json(formattedPorts);
    } catch (err) {
        console.error('Error scanning ports:', err);
        res.status(500).json({ error: 'Failed to scan ports', details: err.message });
    }
});

// Connect to relay for programming
app.post('/api/relay-programming/connect', authenticateToken, async (req, res) => {
    const { port } = req.body;
    
    if (!port) {
        return res.status(400).json({ error: 'Port is required' });
    }
    
    try {
        console.log(`Attempting to connect to ESP32 on ${port}...`);
        
        // Test the serial connection
        const connectionResult = await testSerialConnection(port);
        
        if (connectionResult.success) {
            console.log(`Successfully connected to ESP32 on ${port}`);
        res.json({ 
            success: true, 
            port: port,
                message: 'Connected to relay for programming',
                device_info: connectionResult.deviceInfo
        });
        } else {
            throw new Error(connectionResult.error);
        }
    } catch (err) {
        console.error('Error connecting to relay:', err);
        res.status(500).json({ error: 'Failed to connect to relay', details: err.message });
    }
});

// Test serial connection to ESP32
async function testSerialConnection(port) {
    return new Promise((resolve) => {
        try {
            console.log(`Testing connection to ${port}...`);
            
            const serialPort = new SerialPort({
                path: port,
                baudRate: 115200,
                autoOpen: false
            });
            
            serialPort.open((err) => {
                if (err) {
                    console.error('Error opening serial port:', err);
                    resolve({ success: false, error: `Failed to open port ${port}: ${err.message}` });
                    return;
                }
                
                console.log(`Serial connection test established on ${port}`);
                
                // Just test if we can open the port - don't require ping response
                // The ESP32 firmware may not have ping/pong functionality
                serialPort.close();
                console.log('Port connection test successful');
                resolve({ 
                    success: true, 
                    deviceInfo: {
                        port: port,
                        status: 'connected',
                        message: 'Port opened successfully'
                    }
                });
            });
            
        } catch (error) {
            console.error('Error in testSerialConnection:', error);
            resolve({ success: false, error: error.message });
        }
    });
}

// Program relay with configuration
app.post('/api/relay-programming/program', authenticateToken, async (req, res) => {
    const { port, configId } = req.body;
    
    if (!port || !configId) {
        return res.status(400).json({ error: 'Port and configuration ID are required' });
    }
    
    try {
        console.log(`Programming relay on port ${port} with config ID ${configId}`);
        
        // Get configuration details
        const configResult = await db.query('SELECT * FROM relay_configurations WHERE id = $1', [configId]);
        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        
        const config = configResult.rows[0];
        console.log('Configuration found:', config.relay_name);
        
        // Step 1: Upload configured firmware to ESP32
        console.log('🚀 Step 1: Uploading configured firmware to ESP32...');
        const uploadResult = await uploadFirmwareToESP32(port, config);
        
        if (!uploadResult.success) {
            return res.status(500).json({ 
                success: false,
                error: 'Firmware upload failed',
                details: uploadResult.error
            });
        }
        
        console.log('✅ Configured firmware upload completed successfully');
        console.log('🎉 PROGRAMMING COMPLETED SUCCESSFULLY!');
        console.log('📋 SUMMARY:');
        console.log(`   - Device: ${config.relay_name}`);
        console.log(`   - WiFi: ${config.ssid}`);
        console.log(`   - Server: skytechautomated.com:40000`);
        console.log(`   - Device will connect automatically after reset`);
        
        res.json({
            success: true,
            details: {
                device_id: config.relay_id,
                device_name: config.relay_name,
                server_host: "skytechautomated.com",
                server_port: 40000,
                message: 'Configured firmware uploaded successfully. Device will connect automatically after reset.'
            }
        });
        
    } catch (err) {
        console.error('Error programming relay:', err);
        res.status(500).json({ error: 'Failed to program relay', details: err.message });
    }
});

// Upload firmware to ESP32 using PlatformIO
async function uploadFirmwareToESP32(port, config = null) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const path = require('path');
        const fs = require('fs');
        
        console.log(`📡 Uploading firmware to ${port}...`);
        
        // Path to the ESP32 firmware directory
        const firmwareDir = path.join(__dirname, '..', 'esp32');
        const firmwareFile = 'src/main.cpp';
        const firmwarePath = path.join(firmwareDir, firmwareFile);
        
        // Check if firmware file exists
        if (!fs.existsSync(firmwarePath)) {
            resolve({ 
                success: false, 
                error: `Firmware file not found: ${firmwareFile}`,
                details: 'Make sure the firmware file exists in the esp32 directory'
            });
            return;
        }
        
        console.log(`📁 Firmware file: ${firmwarePath}`);
        
        // If configuration is provided, modify the firmware file directly
        let originalContent = null;
        if (config) {
            console.log(`⚙️  Configuring firmware with device settings...`);
            
            // Backup original content
            originalContent = fs.readFileSync(firmwarePath, 'utf8');
            
            // Read the firmware
            let firmwareContent = originalContent;
            
            // Replace the default configuration with the provided config
            const defaultConfig = `DeviceConfig config = {
    CONFIG_MAGIC,
    CONFIG_VERSION,
    "unconfigured",
    "Unconfigured Relay",
    "",
    "",
    "skytechautomated.com",
    40000,
    false
};`;
            
            const configuredConfig = `DeviceConfig config = {
    CONFIG_MAGIC,
    CONFIG_VERSION,
    "${config.relay_id}",
    "${config.relay_name}",
    "${config.ssid}",
    "${config.password}",
    "skytechautomated.com",
    40000,
    true
};`;
            
            console.log(`🔍 Default config pattern to replace:`);
            console.log(defaultConfig);
            console.log(`🔍 Configured config to insert:`);
            console.log(configuredConfig);
            
            // Replace the configuration
            firmwareContent = firmwareContent.replace(defaultConfig, configuredConfig);
            
            // Debug: Check if replacement worked
            if (firmwareContent.includes(config.ssid)) {
                console.log(`✅ Configuration replacement successful - found SSID: ${config.ssid}`);
            } else {
                console.log(`❌ Configuration replacement failed - SSID not found in firmware`);
                console.log(`🔍 Looking for default config pattern...`);
                if (firmwareContent.includes('"unconfigured"')) {
                    console.log(`⚠️  Found "unconfigured" - replacement may have failed`);
                }
            }
            
            // Debug: Check if password replacement worked
            if (firmwareContent.includes(config.password)) {
                console.log(`✅ Configuration replacement successful - found password: ${config.password}`);
            } else {
                console.log(`❌ Configuration replacement failed - password not found in firmware`);
                console.log(`🔍 Password length: ${config.password.length}`);
                console.log(`🔍 Password value: "${config.password}"`);
            }
            
            // Write the configured firmware back to the original file
            fs.writeFileSync(firmwarePath, firmwareContent);
            
            console.log(`✅ Modified firmware with configuration:`);
            console.log(`   Device ID: ${config.relay_id}`);
            console.log(`   Device Name: ${config.relay_name}`);
            console.log(`   WiFi SSID: ${config.ssid}`);
            console.log(`   WiFi Password: ${config.password}`);
            console.log(`   Server: skytechautomated.com:40000`);
        }
        
        // Use PlatformIO to upload firmware
        const uploadCommand = `pio run --target upload --environment esp32dev --upload-port ${port}`;
        
        console.log(`🔧 Executing: ${uploadCommand}`);
        
        const pio = spawn('pio', [
            'run', 
            '--target', 'upload', 
            '--environment', 'esp32dev', 
            '--upload-port', port
        ], {
            cwd: firmwareDir,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        pio.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            console.log(`📤 ${text.trim()}`);
        });
        
        pio.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;
            console.log(`⚠️  ${text.trim()}`);
        });
        
        pio.on('close', (code) => {
            // Restore original firmware content if it was modified
            if (originalContent) {
                fs.writeFileSync(firmwarePath, originalContent);
                console.log('🔄 Restored original firmware file');
            }
            
            if (code === 0) {
                console.log('✅ Firmware upload completed successfully!');
                resolve({ 
                    success: true, 
                    details: {
                        output: output,
                        port: port,
                        firmware: firmwareFile,
                        configured: config ? true : false
                    }
                });
            } else {
                console.log(`❌ Firmware upload failed with code ${code}`);
                resolve({ 
                    success: false, 
                    error: `Firmware upload failed with code ${code}`,
                    details: {
                        error_output: errorOutput,
                        output: output,
                        port: port,
                        firmware: firmwareFile
                    }
                });
            }
        });
        
        pio.on('error', (err) => {
            // Restore original firmware content if it was modified
            if (originalContent) {
                fs.writeFileSync(firmwarePath, originalContent);
                console.log('🔄 Restored original firmware file');
            }
            
            console.error(`❌ PlatformIO error: ${err.message}`);
            resolve({ 
                success: false, 
                error: `PlatformIO error: ${err.message}`,
                details: 'Make sure PlatformIO is installed and accessible'
            });
        });
    });
}

// Disconnect from relay
app.post('/api/relay-programming/disconnect', authenticateToken, async (req, res) => {
    try {
        // This would typically close the serial connection
        res.json({ 
            success: true, 
            message: 'Disconnected from relay'
        });
    } catch (err) {
        console.error('Error disconnecting from relay:', err);
        res.status(500).json({ error: 'Failed to disconnect from relay' });
    }
});

// === Relay Assignment Endpoints ===

// Get all relay assignments
app.get('/api/relay-assignments', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT ra.*, t.name as template_name
            FROM relay_assignments ra
            LEFT JOIN templates t ON ra.template_id = t.id
            ORDER BY ra.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching relay assignments:', err);
        res.status(500).json({ error: 'Failed to fetch relay assignments' });
    }
});

// Create relay assignment
app.post('/api/relay-assignments', authenticateToken, async (req, res) => {
    const { connected_relay_id, template_id, assignment_type } = req.body;
    
    if (!connected_relay_id || !template_id || !assignment_type) {
        return res.status(400).json({ error: 'Connected relay ID, template ID, and assignment type are required' });
    }
    
    try {
        // Check if assignment already exists
        const existingResult = await db.query(
            'SELECT * FROM relay_assignments WHERE connected_relay_id = $1 AND template_id = $2',
            [connected_relay_id, template_id]
        );
        if (existingResult.rows.length > 0) {
            return res.status(409).json({ error: 'Assignment already exists' });
        }
        
        // Create assignment
        const result = await db.query(`
            INSERT INTO relay_assignments (connected_relay_id, template_id, assignment_type)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [connected_relay_id, template_id, assignment_type]);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating relay assignment:', err);
        res.status(500).json({ error: 'Failed to create relay assignment' });
    }
});

// Delete relay assignment
app.delete('/api/relay-assignments/:relayId', authenticateToken, async (req, res) => {
    const { relayId } = req.params;
    
    try {
        const result = await db.query(
            'DELETE FROM relay_assignments WHERE connected_relay_id = $1',
            [relayId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting relay assignment:', err);
        res.status(500).json({ error: 'Failed to delete relay assignment' });
    }
});

// Get a specific relay by MAC address
app.get('/api/relays/:mac', authenticateToken, async (req, res) => {
    const { mac } = req.params;
    try {
        const result = await db.query(`
            SELECT r.*, t.name as template_name, t.id as template_id
            FROM relays r
            LEFT JOIN templates t ON r.template_id = t.id
            WHERE r.mac_address = $1
        `, [mac]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Relay not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching relay:', err);
        res.status(500).json({ error: 'Failed to fetch relay' });
    }
});

// Register a new relay
app.post('/api/relays', authenticateToken, async (req, res) => {
    const { mac_address, name, location, description, template_id } = req.body;
    
    if (!mac_address || !name) {
        return res.status(400).json({ error: 'MAC address and name are required' });
    }
    
    try {
        // Check if relay already exists
        const existingResult = await db.query('SELECT * FROM relays WHERE mac_address = $1', [mac_address]);
        if (existingResult.rows.length > 0) {
            return res.status(409).json({ error: 'Relay with this MAC address already exists' });
        }
        
        // Insert new relay
        const result = await db.query(`
            INSERT INTO relays (mac_address, name, location, description, template_id, status)
            VALUES ($1, $2, $3, $4, $5, 'offline')
            RETURNING *
        `, [mac_address, name, location || null, description || null, template_id || null]);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating relay:', err);
        res.status(500).json({ error: 'Failed to create relay' });
    }
});

// Update relay information
app.put('/api/relays/:mac', authenticateToken, async (req, res) => {
    const { mac } = req.params;
    const { name, location, description, template_id } = req.body;
    
    try {
        const result = await db.query(`
            UPDATE relays 
            SET name = COALESCE($1, name),
                location = COALESCE($2, location),
                description = COALESCE($3, description),
                template_id = COALESCE($4, template_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE mac_address = $5
            RETURNING *
        `, [name, location, description, template_id, mac]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Relay not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating relay:', err);
        res.status(500).json({ error: 'Failed to update relay' });
    }
});

// Delete a relay
app.delete('/api/relays/:mac', authenticateToken, async (req, res) => {
    const { mac } = req.params;
    
    try {
        const result = await db.query('DELETE FROM relays WHERE mac_address = $1', [mac]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Relay not found' });
        }
        
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting relay:', err);
        res.status(500).json({ error: 'Failed to delete relay' });
    }
});

// Get available templates for relay assignment
app.get('/api/templates/available', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, color FROM templates ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// Assign relay to template
app.post('/api/relays/:mac/assign', authenticateToken, async (req, res) => {
    const { mac } = req.params;
    const { template_id } = req.body;
    
    if (!template_id) {
        return res.status(400).json({ error: 'Template ID is required' });
    }
    
    try {
        // Verify template exists
        const templateResult = await db.query('SELECT * FROM templates WHERE id = $1', [template_id]);
        if (templateResult.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        // Update relay assignment
        const result = await db.query(`
            UPDATE relays 
            SET template_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE mac_address = $2
            RETURNING *
        `, [template_id, mac]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Relay not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error assigning relay:', err);
        res.status(500).json({ error: 'Failed to assign relay' });
    }
});

// Remove relay from template
app.delete('/api/relays/:mac/assign', authenticateToken, async (req, res) => {
    const { mac } = req.params;
    
    try {
        const result = await db.query(`
            UPDATE relays 
            SET template_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE mac_address = $1
            RETURNING *
        `, [mac]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Relay not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error removing relay assignment:', err);
        res.status(500).json({ error: 'Failed to remove relay assignment' });
    }
});

// Get relays by template
app.get('/api/templates/:id/relays', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await db.query(`
            SELECT r.*, 
                   CASE WHEN cr.mac_address IS NOT NULL THEN 'connected' ELSE 'disconnected' END as connection_status
            FROM relays r
            LEFT JOIN (
                SELECT DISTINCT mac_address 
                FROM jsonb_array_elements_text($1::jsonb) as mac_address
            ) cr ON r.mac_address = cr.mac_address
            WHERE r.template_id = $2
            ORDER BY r.name
        `, [JSON.stringify(Array.from(connectedRelays.keys())), id]);
        
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching template relays:', err);
        res.status(500).json({ error: 'Failed to fetch template relays' });
    }
});

// === Elevator Control Endpoints ===

// Store elevator states
const elevatorStates = new Map();

// Receive elevator state from ESP32
app.post('/api/elevator/state', async (req, res) => {
    try {
        const { device_id, elevator_in_use, target_floor, door_open_requested, door_close_requested, inputs, relays } = req.body;
        
        // Store elevator state
        elevatorStates.set(device_id, {
            device_id,
            elevator_in_use,
            target_floor,
            door_open_requested,
            door_close_requested,
            inputs,
            relays,
            last_update: new Date().toISOString()
        });
        
        // Broadcast to connected WebSocket clients
        broadcastToClients({
            type: 'elevator_state_update',
            device_id,
            state: elevatorStates.get(device_id)
        });
        
        res.status(200).json({ status: 'received' });
    } catch (err) {
        console.error('Error receiving elevator state:', err);
        res.status(500).json({ error: 'Failed to process elevator state' });
    }
});

// Get elevator state
app.get('/api/elevator/state/:device_id', authenticateToken, async (req, res) => {
    const { device_id } = req.params;
    
    try {
        const state = elevatorStates.get(device_id);
        if (!state) {
            return res.status(404).json({ error: 'Elevator state not found' });
        }
        
        res.json(state);
    } catch (err) {
        console.error('Error fetching elevator state:', err);
        res.status(500).json({ error: 'Failed to fetch elevator state' });
    }
});

// Get all elevator states
app.get('/api/elevator/states', authenticateToken, async (req, res) => {
    try {
        const states = Array.from(elevatorStates.values());
        res.json(states);
    } catch (err) {
        console.error('Error fetching elevator states:', err);
        res.status(500).json({ error: 'Failed to fetch elevator states' });
    }
});

// Send elevator command to ESP32
app.post('/api/elevator/command', authenticateToken, async (req, res) => {
    const { device_id, command, floor } = req.body;
    
    if (!device_id || !command) {
        return res.status(400).json({ error: 'Device ID and command are required' });
    }
    
    try {
        // Find connected relay by device_id (MAC address)
        const relay = connectedRelays.get(device_id);
        if (!relay) {
            return res.status(404).json({ error: 'Elevator device not connected' });
        }
        
        // Send command via WebSocket
        const message = {
            type: 'elevator_command',
            command,
            floor: floor || null
        };
        
        relay.send(JSON.stringify(message));
        
        res.json({ status: 'command_sent', command, floor });
    } catch (err) {
        console.error('Error sending elevator command:', err);
        res.status(500).json({ error: 'Failed to send elevator command' });
    }
});

// Get elevator I/O configuration
app.get('/api/elevator/config/:device_id', authenticateToken, async (req, res) => {
    const { device_id } = req.params;
    
    try {
        // For now, return default configuration
        // TODO: Load from database
        const config = {
            device_id,
            io_mappings: [
                { relay_pin: 16, input_pin: 0, function: "door_open", enabled: true, safety_required: true },
                { relay_pin: 17, input_pin: 1, function: "door_close", enabled: true, safety_required: true },
                { relay_pin: 18, input_pin: 2, function: "floor_1", enabled: true, safety_required: true },
                { relay_pin: 19, input_pin: 3, function: "floor_2", enabled: true, safety_required: true },
                { relay_pin: 21, input_pin: 4, function: "floor_3", enabled: true, safety_required: true },
                { relay_pin: 22, input_pin: 5, function: "floor_4", enabled: true, safety_required: true },
                { relay_pin: 23, input_pin: 6, function: "floor_5", enabled: true, safety_required: true },
                { relay_pin: 25, input_pin: 7, function: "floor_6", enabled: true, safety_required: true }
            ],
            safety_settings: {
                require_floor_confirmation: true,
                auto_release_on_violation: true,
                max_door_open_time: 30000, // 30 seconds
                safety_check_interval: 100 // 100ms
            }
        };
        
        res.json(config);
    } catch (err) {
        console.error('Error fetching elevator config:', err);
        res.status(500).json({ error: 'Failed to fetch elevator config' });
    }
});

// Update elevator I/O configuration
app.put('/api/elevator/config/:device_id', authenticateToken, async (req, res) => {
    const { device_id } = req.params;
    const { io_mappings, safety_settings } = req.body;
    
    try {
        // TODO: Save to database
        // For now, just return success
        res.json({ 
            status: 'updated',
            device_id,
            io_mappings,
            safety_settings
        });
    } catch (err) {
        console.error('Error updating elevator config:', err);
        res.status(500).json({ error: 'Failed to update elevator config' });
    }
});

// Get elevator safety logs
app.get('/api/elevator/logs/:device_id', authenticateToken, async (req, res) => {
    const { device_id } = req.params;
    const { limit = 100 } = req.query;
    
    try {
        // TODO: Load from database
        // For now, return empty array
        res.json([]);
    } catch (err) {
        console.error('Error fetching elevator logs:', err);
        res.status(500).json({ error: 'Failed to fetch elevator logs' });
    }
});





// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start the recurring task scheduler
    try {
        await recurringTaskScheduler.start();
        console.log('Recurring task scheduler started successfully');
    } catch (error) {
        console.error('Failed to start recurring task scheduler:', error);
    }
}); 

// Start relay server on port 40000 for elevator relays
relayServer.listen(40000, '0.0.0.0', () => {
    console.log(`Relay server running on port 40000`);
});

// Generate firmware configuration from relay config
function generateFirmwareConfig(config) {
    // Simplified configuration for clean ESP32 firmware
    const firmwareConfig = {
        device_id: config.relay_id,
        device_name: config.relay_name,
        wifi_ssid: config.ssid,
        wifi_password: config.password,
        server_host: "skytechautomated.com",
        server_port: 40000
    };

    // Add MAC address if configured
    if (config.mac_address) {
        firmwareConfig.mac_address = config.mac_address;
    }

    return firmwareConfig;
}

// Program ESP32 device via serial connection
async function programESP32Device(port, firmwareConfig, config) {
    return new Promise(async (resolve) => {
        let serialPort = null;
        let responseTimeout = null;
        
        try {
            console.log(`\n=== STARTING ESP32 PROGRAMMING ===`);
            console.log(`📡 Port: ${port}`);
            console.log(`🏷️  Device: ${config.relay_name} (${config.relay_id})`);
            console.log(`📶 WiFi: ${config.ssid}`);
            console.log(`🌐 Server: ${firmwareConfig.server_host}:${firmwareConfig.server_port}`);
            console.log(`🔧 Device ID: ${firmwareConfig.device_id}`);
            console.log(`📥 Device Name: ${firmwareConfig.device_name}`);
            
            // Create serial connection
            serialPort = new SerialPort({
                path: port,
                baudRate: 115200,
                autoOpen: false
            });
            
            // Handle serial port errors
            serialPort.on('error', (err) => {
                console.error(`❌ SERIAL PORT ERROR: ${err.message}`);
                if (responseTimeout) clearTimeout(responseTimeout);
                if (serialPort && serialPort.isOpen) {
                    serialPort.close((closeErr) => {
                        if (closeErr) console.error(`Error closing port: ${closeErr.message}`);
                    });
                }
                resolve({ 
                    success: false, 
                    error: `Serial port error: ${err.message}`,
                    details: 'Device may have been disconnected or reset'
                });
            });
            
            serialPort.open((err) => {
                if (err) {
                    console.error(`❌ FAILED: Could not open port ${port}: ${err.message}`);
                    console.log(`💡 TIP: Make sure the device is connected and the port is available`);
                    resolve({ success: false, error: `Failed to open port ${port}: ${err.message}` });
                    return;
                }
                
                console.log(`✅ SUCCESS: Serial connection established on ${port}`);
                
                // Send configuration to device
                const configMessage = JSON.stringify({
                    type: 'config',
                    data: firmwareConfig
                });
                
                console.log(`📤 SENDING CONFIGURATION TO DEVICE:`);
                console.log(configMessage);
                console.log(`⏳ Waiting 35 seconds for ESP32 to boot and be ready...`);
                
                // Wait for ESP32 to boot and be ready (35 seconds)
                setTimeout(() => {
                    serialPort.write(configMessage + '\n', (err) => {
                        if (err) {
                            console.error(`❌ FAILED: Could not write to device: ${err.message}`);
                            console.log(`💡 TIP: Check if device is in programming mode`);
                            if (serialPort && serialPort.isOpen) {
                                serialPort.close((closeErr) => {
                                    if (closeErr) console.error(`Error closing port: ${closeErr.message}`);
                                });
                            }
                            resolve({ success: false, error: `Failed to write to device: ${err.message}` });
                            return;
                        }
                        
                        console.log(`✅ SUCCESS: Configuration sent to device`);
                        console.log(`🎉 PROGRAMMING COMPLETED SUCCESSFULLY!`);
                        console.log(`📋 SUMMARY:`);
                        console.log(`   - Device: ${config.relay_name}`);
                        console.log(`   - WiFi: ${config.ssid}`);
                        console.log(`   - Server: ${firmwareConfig.server_host}:${firmwareConfig.server_port}`);
                        console.log(`   - Device will connect automatically`);
                        console.log(`=== PROGRAMMING COMPLETE ===\n`);
                        
                        // Close serial port
                        if (serialPort && serialPort.isOpen) {
                            serialPort.close((closeErr) => {
                                if (closeErr) console.error(`Error closing port: ${closeErr.message}`);
                            });
                        }
                        
                        resolve({ 
                            success: true,
                            details: {
                                device_id: firmwareConfig.device_id,
                                device_name: firmwareConfig.device_name,
                                server_host: firmwareConfig.server_host,
                                server_port: firmwareConfig.server_port,
                                message: 'Configuration sent successfully. Device will connect automatically.'
                            }
                        });
                    });
                }, 35000); // 35 seconds
            });
            
        } catch (error) {
            console.error(`❌ CRITICAL ERROR: ${error.message}`);
            if (responseTimeout) clearTimeout(responseTimeout);
            if (serialPort && serialPort.isOpen) {
                serialPort.close((closeErr) => {
                    if (closeErr) console.error(`Error closing port: ${closeErr.message}`);
                });
            }
            resolve({ success: false, error: error.message });
        }
    });
}

// API endpoint to create a recurring task
app.post('/api/templates/:templateId/recurring-tasks', authenticateToken, async (req, res) => {
    try {
        const { templateId } = req.params;
        const { type, floor, shelfPoint, schedule } = req.body;

        // Validate required fields
        if (!type || !floor || !shelfPoint || !schedule || !schedule.time || !schedule.days_of_week) {
            return res.status(400).json({ error: 'Missing required fields: type, floor, shelfPoint, schedule.time, schedule.days_of_week' });
        }

        // Validate schedule format
        if (!Array.isArray(schedule.days_of_week) || schedule.days_of_week.length === 0) {
            return res.status(400).json({ error: 'days_of_week must be a non-empty array' });
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(schedule.time)) {
            return res.status(400).json({ error: 'Invalid time format. Use HH:MM format' });
        }

        // Create the recurring task
        const recurringTask = await recurringTaskScheduler.createRecurringTask(templateId, {
            type,
            floor,
            shelfPoint,
            schedule
        });

        res.status(201).json({
            message: 'Recurring task created successfully',
            recurringTask
        });

    } catch (error) {
        console.error('Error creating recurring task:', error);
        res.status(500).json({ error: 'Failed to create recurring task' });
    }
});

// API endpoint to get recurring tasks for a template
app.get('/api/templates/:templateId/recurring-tasks', authenticateToken, async (req, res) => {
    try {
        const { templateId } = req.params;
        const recurringTasks = await recurringTaskScheduler.getRecurringTasks(templateId);
        res.json(recurringTasks);
    } catch (error) {
        console.error('Error fetching recurring tasks:', error);
        res.status(500).json({ error: 'Failed to fetch recurring tasks' });
    }
});

// API endpoint to delete a recurring task
app.delete('/api/templates/:templateId/recurring-tasks/:recurringTaskId', authenticateToken, async (req, res) => {
    try {
        const { templateId, recurringTaskId } = req.params;
        console.log('DELETE recurring task request:', { templateId, recurringTaskId });
        
        // Check if the recurring task exists first
        const checkResult = await db.query('SELECT * FROM recurring_tasks WHERE id = $1 AND template_id = $2', [recurringTaskId, templateId]);
        if (checkResult.rows.length === 0) {
            console.log('Recurring task not found:', { recurringTaskId, templateId });
            return res.status(404).json({ error: 'Recurring task not found' });
        }
        
        console.log('Found recurring task:', checkResult.rows[0]);
        await recurringTaskScheduler.deleteRecurringTask(recurringTaskId);
        res.json({ message: 'Recurring task deleted successfully' });
    } catch (error) {
        console.error('Error deleting recurring task:', error);
        res.status(500).json({ error: 'Failed to delete recurring task' });
    }
});

// API endpoint to get scheduler status
app.get('/api/recurring-tasks/status', authenticateToken, async (req, res) => {
    try {
        const status = await recurringTaskScheduler.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting scheduler status:', error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

// API endpoint to get unassigned relays from connected_relays table that can be assigned to templates
app.get('/api/connected-relays/assignable', authenticateToken, async (req, res) => {
    try {
        // Get only unassigned relays from the connected_relays table
                const dbResult = await db.query(`
            SELECT 
                cr.id,
                cr.mac_address,
                cr.name,
                cr.status,
                cr.is_connected,
                cr.last_seen,
                cr.device_name,
                cr.device_id,
                cr.ip_address,
                cr.port,
                cr.location,
                cr.description,
                rc.relay_name as config_name,
                CASE 
                    WHEN cr.is_connected = TRUE THEN 'online'
                    ELSE 'offline'
                END as connection_status
                    FROM connected_relays cr
            LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
            WHERE cr.id NOT IN (
                SELECT DISTINCT connected_relay_id 
                FROM relay_assignments 
                WHERE connected_relay_id IS NOT NULL
            )
            ORDER BY cr.name, cr.mac_address
        `);
        
        const connectedRelaysList = [];
        
        for (const dbRelay of dbResult.rows) {
            // Since these are unassigned relays, they won't have any assignments
            connectedRelaysList.push({
                mac: dbRelay.mac_address,
                ip: dbRelay.ip_address,
                port: dbRelay.port || 81,
                status: dbRelay.connection_status,
                last_seen: dbRelay.last_seen,
                name: dbRelay.name || dbRelay.device_name || `Relay-${dbRelay.mac_address.substring(-6)}`,
                location: dbRelay.location,
                description: dbRelay.description,
                config_name: dbRelay.config_name,
                capabilities: [], // removed rc.capabilities, set to empty array for compatibility
                assignments: [], // Unassigned relays have no assignments
                db_id: dbRelay.id
            });
        }
        
        res.json({
            count: connectedRelaysList.length,
            relays: connectedRelaysList
        });
    } catch (err) {
        console.error('Error fetching assignable relays:', err);
        res.status(500).json({ error: 'Failed to fetch assignable relays' });
    }
});

// Create relay assignment by MAC address
app.post('/api/relay-assignments/by-mac', authenticateToken, async (req, res) => {
    const { mac_address, template_id, assignment_type } = req.body;
    
    if (!mac_address || !template_id || !assignment_type) {
        return res.status(400).json({ error: 'MAC address, template ID, and assignment type are required' });
    }
    
    try {
        // Get connected_relay record from database
        const existingRelayResult = await db.query(
            'SELECT id FROM connected_relays WHERE mac_address = $1',
            [mac_address]
        );
        
        if (existingRelayResult.rows.length === 0) {
            return res.status(404).json({ error: 'Relay not found in database. Please register the relay first.' });
        }
        
        const connectedRelayId = existingRelayResult.rows[0].id;
        
        // Check if assignment already exists
        const existingAssignmentResult = await db.query(
            'SELECT * FROM relay_assignments WHERE connected_relay_id = $1 AND template_id = $2',
            [connectedRelayId, template_id]
        );
        if (existingAssignmentResult.rows.length > 0) {
            return res.status(409).json({ error: 'Assignment already exists' });
        }
        
        // Create assignment
        const result = await db.query(`
            INSERT INTO relay_assignments (connected_relay_id, template_id, assignment_type)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [connectedRelayId, template_id, assignment_type]);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating relay assignment:', err);
        res.status(500).json({ error: 'Failed to create relay assignment' });
    }
});

// Remove relay assignment by MAC address and template ID
app.delete('/api/relay-assignments/by-mac/:mac/:templateId', authenticateToken, async (req, res) => {
    const { mac, templateId } = req.params;
    
    try {
        // Find the connected_relay record
        const relayResult = await db.query(
            'SELECT id FROM connected_relays WHERE mac_address = $1',
            [mac]
        );
        
        if (relayResult.rows.length === 0) {
            return res.status(404).json({ error: 'Connected relay not found' });
        }
        
        const connectedRelayId = relayResult.rows[0].id;
        
        // Delete the assignment
        const result = await db.query(
            'DELETE FROM relay_assignments WHERE connected_relay_id = $1 AND template_id = $2',
            [connectedRelayId, templateId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        res.status(204).send();
    } catch (err) {
        console.error('Error removing relay assignment:', err);
        res.status(500).json({ error: 'Failed to remove relay assignment' });
    }
});

// API endpoint to update relay channel configuration
app.put('/api/relays/:relayId/channel-config', authenticateToken, async (req, res) => {
    const { relayId } = req.params;
    const { channel_config, template_id } = req.body;
    
    if (!channel_config || typeof channel_config !== 'object') {
        return res.status(400).json({ error: 'Channel configuration is required' });
    }
    
    if (!template_id) {
        return res.status(400).json({ error: 'Template ID is required' });
    }
    
    try {
        // Check if relay exists and is assigned to this template
        const assignmentResult = await db.query(
            'SELECT * FROM relay_assignments WHERE connected_relay_id = $1 AND template_id = $2',
            [relayId, template_id]
        );
        
        if (assignmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Relay assignment not found' });
        }
        
        // Prepare channel data for the new table structure
        const channelData = {};
        for (let i = 1; i <= 8; i++) {
            channelData[`channel_${i}`] = channel_config[i] || null;
        }
        
        // Insert or update the relay settings
        const result = await db.query(`
            INSERT INTO relay_settings (connected_relay_id, template_id, channel_1, channel_2, channel_3, channel_4, channel_5, channel_6, channel_7, channel_8, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (connected_relay_id, template_id) 
            DO UPDATE SET 
                channel_1 = EXCLUDED.channel_1,
                channel_2 = EXCLUDED.channel_2,
                channel_3 = EXCLUDED.channel_3,
                channel_4 = EXCLUDED.channel_4,
                channel_5 = EXCLUDED.channel_5,
                channel_6 = EXCLUDED.channel_6,
                channel_7 = EXCLUDED.channel_7,
                channel_8 = EXCLUDED.channel_8,
                updated_at = CURRENT_TIMESTAMP
        `, [
            relayId, 
            template_id, 
            channelData.channel_1, 
            channelData.channel_2, 
            channelData.channel_3, 
            channelData.channel_4, 
            channelData.channel_5, 
            channelData.channel_6, 
            channelData.channel_7, 
            channelData.channel_8
        ]);
        
        res.json({ message: 'Channel configuration updated successfully' });
    } catch (err) {
        console.error('Error updating channel configuration:', err);
        res.status(500).json({ error: 'Failed to update channel configuration' });
    }
});

// API endpoint to get elevator status
app.get('/api/elevator-status/:relayMac', authenticateToken, async (req, res) => {
    const { relayMac } = req.params;
    
    try {
        const result = await db.query(`
            SELECT status_data, last_updated
            FROM elevator_status 
            WHERE relay_mac = $1
        `, [relayMac]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Elevator status not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching elevator status:', err);
        res.status(500).json({ error: 'Failed to fetch elevator status' });
    }
});

// API endpoint to get all elevator statuses
app.get('/api/elevator-status', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT relay_mac, status_data, last_updated
            FROM elevator_status 
            ORDER BY last_updated DESC
        `);
        
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching elevator statuses:', err);
        res.status(500).json({ error: 'Failed to fetch elevator statuses' });
    }
});

// Helper function to get elevator relays for a template from database
async function getElevatorRelaysForTemplateFromDB(templateId) {
    try {
        // Get all relays assigned to this template with their channel settings
        const result = await db.query(`
            SELECT 
                cr.id,
                cr.mac_address,
                cr.name,
                cr.ip_address,
                cr.port,
                rc.relay_name,
                rs.channel_1,
                rs.channel_2,
                rs.channel_3,
                rs.channel_4,
                rs.channel_5,
                rs.channel_6,
                rs.channel_7,
                rs.channel_8
            FROM connected_relays cr
            LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
            INNER JOIN relay_assignments ra ON cr.id = ra.connected_relay_id
            LEFT JOIN relay_settings rs ON cr.id = rs.connected_relay_id AND ra.template_id = rs.template_id
            WHERE ra.template_id = $1
            ORDER BY cr.name
        `, [templateId]);
        
        // Convert the flat channel columns to a channel_config object
        const relaysWithConfig = result.rows.map(relay => {
            const channelConfig = {};
            for (let i = 1; i <= 8; i++) {
                const channelValue = relay[`channel_${i}`];
                if (channelValue) {
                    channelConfig[i] = channelValue;
                }
            }
            
            return {
                ...relay,
                channel_config: channelConfig
            };
        });
        
        return relaysWithConfig;
    } catch (error) {
        console.error('Error getting elevator relays for template:', error);
        return [];
    }
}

// Helper function to find which relay handles a specific floor
function findRelayForFloor(relays, targetFloor) {
    for (const relay of relays) {
        if (relay.channel_config) {
            for (const [channel, function_] of Object.entries(relay.channel_config)) {
                if (function_ === `floor${targetFloor}`) {
                    return { relay, channel, function: function_ };
                }
            }
        }
    }
    return null;
}

// Helper function to find which relay handles a specific function
function findRelayForFunction(relays, functionName) {
    for (const relay of relays) {
        if (relay.channel_config) {
            for (const [channel, function_] of Object.entries(relay.channel_config)) {
                if (function_ === functionName) {
                    return { relay, channel, function: function_ };
                }
            }
        }
    }
    return null;
}

// Process DI inputs and map them to elevator status
async function processDIInputs(macAddress, inputs) {
    try {
        console.log(`[DEBUG] Processing DI inputs for relay ${macAddress}:`, inputs);
        
        // Get the relay's channel configuration from the database
        const relayResult = await db.query(`
            SELECT cr.id, cr.mac_address
            FROM connected_relays cr
            WHERE cr.mac_address = $1
        `, [macAddress]);
        
        if (relayResult.rows.length === 0) {
            console.log(`[DEBUG] Relay ${macAddress} not found in database`);
            return;
        }
        
        const relayId = relayResult.rows[0].id;
        
        // Get all relay settings for this relay across all templates
        const settingsResult = await db.query(`
            SELECT rs.*, t.name as template_name
            FROM relay_settings rs
            JOIN templates t ON rs.template_id = t.id
            WHERE rs.connected_relay_id = $1
        `, [relayId]);
        
        if (settingsResult.rows.length === 0) {
            console.log(`[DEBUG] No channel settings found for relay ${macAddress}`);
            return;
        }
        
        // Process each DI input and update elevator status
        const elevatorStatus = {
            door_open: false,
            door_close: false,
            basementodt: false,
            current_floor: null,
            last_updated: new Date().toISOString()
        };
        
        for (let diIndex = 0; diIndex < inputs.length; diIndex++) {
            const diValue = inputs[diIndex];
            const diNumber = diIndex + 1; // DI numbers are 1-based
            
            console.log(`[DEBUG] DI ${diNumber} = ${diValue}`);
            
            // Skip if DI is not active (assuming 1 = active, 0 = inactive)
            if (diValue !== 1) {
                continue;
            }
            
            // Find which channel function corresponds to this DI
            let channelFunction = null;
            for (const setting of settingsResult.rows) {
                // Check if this DI corresponds to a channel
                const channelValue = setting[`channel_${diNumber}`];
                if (channelValue && channelValue !== 'hall_call') { // Skip hall call as it's output only
                    channelFunction = channelValue;
                    console.log(`[DEBUG] DI ${diNumber} maps to status: ${channelFunction} (Template: ${setting.template_name})`);
                    break;
                }
            }
            
            if (channelFunction) {
                // Update elevator status based on the DI input
                await updateElevatorStatus(macAddress, channelFunction, true);
            }
        }
        
        // Also update status for inactive DIs (set to false)
        for (let diIndex = 0; diIndex < inputs.length; diIndex++) {
            const diValue = inputs[diIndex];
            const diNumber = diIndex + 1;
            
            if (diValue === 0) {
                // Find which channel function corresponds to this DI
                let channelFunction = null;
                for (const setting of settingsResult.rows) {
                    const channelValue = setting[`channel_${diNumber}`];
                    if (channelValue && channelValue !== 'hall_call') {
                        channelFunction = channelValue;
                        break;
                    }
                }
                
                if (channelFunction) {
                    // Update elevator status based on the DI input
                    await updateElevatorStatus(macAddress, channelFunction, false);
                }
            }
        }
        
    } catch (error) {
        console.error(`[ERROR] Error processing DI inputs for relay ${macAddress}:`, error);
    }
}

// Update elevator status based on DI inputs
async function updateElevatorStatus(macAddress, functionName, isActive) {
    console.log(`[INFO] Elevator status update - ${macAddress}: ${functionName} = ${isActive}`);
    
    try {
        // Get or create elevator status record
        const statusResult = await db.query(`
            SELECT * FROM elevator_status WHERE relay_mac = $1
        `, [macAddress]);
        
        let statusData = {};
        if (statusResult.rows.length > 0) {
            statusData = statusResult.rows[0].status_data || {};
        }
        
        // Update status based on function type
        switch (functionName) {
            case 'door_open':
                statusData.door_open = isActive;
                break;
            case 'door_close':
                statusData.door_close = isActive;
                break;
            case 'basementodt':
                statusData.basementodt = isActive;
                break;
            default:
                // Handle floor status (floor1, floor2, etc.)
                if (functionName.startsWith('floor')) {
                    const floorNumber = parseInt(functionName.replace('floor', ''));
                    if (isActive) {
                        statusData.current_floor = floorNumber;
                    } else if (statusData.current_floor === floorNumber) {
                        // Only clear if this was the current floor
                        statusData.current_floor = null;
                    }
                } else {
                    console.log(`[DEBUG] Unknown status function: ${functionName}`);
                    return;
                }
        }
        
        statusData.last_updated = new Date().toISOString();
        
        // Insert or update elevator status
        await db.query(`
            INSERT INTO elevator_status (relay_mac, status_data, last_updated)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (relay_mac) DO UPDATE
            SET status_data = $2, last_updated = CURRENT_TIMESTAMP
        `, [macAddress, JSON.stringify(statusData)]);
        
        console.log(`[INFO] Updated elevator status for ${macAddress}:`, statusData);
        
    } catch (error) {
        console.error(`[ERROR] Error updating elevator status:`, error);
    }
}

// Send relay command to ESP32
async function sendRelayCommand(macAddress, functionName, state) {
    try {
        // Find which channel corresponds to this function
        const relayResult = await db.query(`
            SELECT cr.id
            FROM connected_relays cr
            WHERE cr.mac_address = $1
        `, [macAddress]);
        
        if (relayResult.rows.length === 0) {
            console.log(`[ERROR] Relay ${macAddress} not found`);
            return;
        }
        
        const relayId = relayResult.rows[0].id;
        
        // Get the channel number for this function
        const settingsResult = await db.query(`
            SELECT channel_1, channel_2, channel_3, channel_4, channel_5, channel_6, channel_7, channel_8
            FROM relay_settings
            WHERE connected_relay_id = $1
        `, [relayId]);
        
        if (settingsResult.rows.length === 0) {
            console.log(`[ERROR] No settings found for relay ${macAddress}`);
            return;
        }
        
        const settings = settingsResult.rows[0];
        let channelNumber = null;
        
        // Find which channel has this function
        for (let i = 1; i <= 8; i++) {
            if (settings[`channel_${i}`] === functionName) {
                channelNumber = i;
                break;
            }
        }
        
        if (channelNumber === null) {
            console.log(`[ERROR] Function ${functionName} not found in relay ${macAddress} configuration`);
            return;
        }
        
        // Send the command to the ESP32
        const relayData = connectedRelays.get(macAddress);
        if (relayData && relayData.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'relay_control',
                relay: channelNumber - 1, // ESP32 uses 0-based indexing
                state: state ? 1 : 0
            };
            
            relayData.ws.send(JSON.stringify(message));
            console.log(`[INFO] Sent command to relay ${macAddress}:`, message);
        } else {
            console.log(`[ERROR] Relay ${macAddress} not connected`);
        }
        
    } catch (error) {
        console.error(`[ERROR] Error sending relay command:`, error);
    }
}

// Relay WebSocket connection handling (Port 40000 - Elevator Relays Only)
relayWss.on('connection', async (ws, req) => {
    console.log(`[DEBUG] Relay connection attempt from ${req.socket.remoteAddress}`);
    console.log(`[DEBUG] Request URL: ${req.url}`);
    console.log(`[DEBUG] Request headers:`, req.headers);
    
    // Extract MAC address from the connection URL to identify relays
    let macAddress = null;
    try {
    const url = new URL(req.url, `http://${req.headers.host}`);
        macAddress = url.searchParams.get('id');
        console.log(`[DEBUG] Parsed MAC address: ${macAddress}`);
    } catch (error) {
        console.error(`[DEBUG] Error parsing URL: ${error.message}`);
    }

    if (macAddress) {
        // --- This is a Relay Connection on Port 80 ---
        // Extract IP address from the connection
        const relayIP = req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
        
        console.log(`[PORT 40000] Relay connected with ID: ${macAddress} from IP: ${relayIP}`);
        
        // Store the relay connection
        connectedRelays.set(macAddress, { ws, ip: relayIP });
        
        // Insert or update connected_relays table
        try {
            console.log('[DEBUG] [PORT 40000] Attempting to insert/update connected_relays for', macAddress, relayIP);
            const result = await db.query(`
                INSERT INTO connected_relays (mac_address, status, is_connected, last_seen, ip_address, port)
                VALUES ($1, 'online', TRUE, CURRENT_TIMESTAMP, $2, 40000)
                ON CONFLICT (mac_address) DO UPDATE
                SET status = 'online', is_connected = TRUE, last_seen = CURRENT_TIMESTAMP, ip_address = $2, port = 40000
                `, [macAddress, relayIP]);
            console.log('[DEBUG] [PORT 40000] Insert/update for connected_relays completed for', macAddress, 'Result:', result.rowCount);
        } catch (err) {
            console.error('[DEBUG] [PORT 40000] Error inserting/updating connected_relays for', macAddress, err);
        }

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                console.log(`[PORT 40000] Received message from relay ${macAddress}:`, data);

                // Handle device registration (accept both old and new formats)
                if (data.type === 'device_register' || data.type === 'register') {
                    console.log(`[PORT 40000] Relay ${macAddress} registering as ${data.device_name}`);
                    
                    // Extract MAC address from registration message
                    const actualMac = data.mac || data.mac_address;
                    const deviceIP = data.ip;
                    
                    if (actualMac) {
                        const relayData = connectedRelays.get(macAddress);
                        if (relayData) {
                            relayData.actualMacAddress = actualMac;
                            console.log(`[PORT 40000] ✅ Updated actual MAC address: ${actualMac}`);
                        }
                    }
                    
                    // Update IP address if provided
                    if (deviceIP) {
                        const relayData = connectedRelays.get(macAddress);
                        if (relayData) {
                            relayData.ip = deviceIP;
                            console.log(`[PORT 40000] ✅ Updated IP address: ${deviceIP}`);
                        }
                        
                        // Update IP address in database
                        try {
                            await db.query(`
                                UPDATE relays 
                                SET ip_address = $1, last_seen = CURRENT_TIMESTAMP
                                WHERE mac_address = $2
                            `, [deviceIP, macAddress]);
                            console.log(`[PORT 40000] ✅ Updated relay IP address in database: ${macAddress} -> ${deviceIP}`);
                        } catch (err) {
                            console.error(`[PORT 40000] Error updating relay IP address in database for ${macAddress}:`, err);
                        }
                    }
                }
                
                // Handle state updates
                if (data.type === 'full_state' || data.type === 'state') {
                    console.log(`[PORT 40000] Relay ${macAddress} state:`, {
                        relays: data.relays,
                        inputs: data.inputs
                    });
                    
                    // Update IP address if provided in state message
                    if (data.ip) {
                        const relayData = connectedRelays.get(macAddress);
                        if (relayData) {
                            relayData.ip = data.ip;
                        }
                    }
                    
                    // Process DI inputs if they exist
                    if (data.inputs && Array.isArray(data.inputs)) {
                        await processDIInputs(macAddress, data.inputs);
                    }
                }
                
                // Relay is now ready to receive commands
                console.log(`[PORT 40000] Relay ${macAddress} is ready to receive commands`);
            } catch (error) {
                console.error(`[PORT 40000] Error parsing message from relay ${macAddress}:`, error);
            }
        });

        ws.on('close', async () => {
            const relayData = connectedRelays.get(macAddress);
            const relayIP = relayData ? relayData.ip : 'unknown';
            console.log(`[PORT 40000] Relay disconnected: ${macAddress} from IP: ${relayIP}`);
            connectedRelays.delete(macAddress);

            // Update relay status to offline
            try {
                await db.query(`
                    UPDATE relays 
                    SET status = 'offline'
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`[PORT 40000] Updated relay status to offline: ${macAddress}`);
            } catch (err) {
                console.error(`[PORT 40000] Error updating relay status for ${macAddress}:`, err);
            }
            // Update connected_relays table to mark as offline
            try {
                await db.query(`
                    UPDATE connected_relays
                    SET status = 'offline', is_connected = FALSE, last_seen = CURRENT_TIMESTAMP
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`Updated connected_relays status to offline: ${macAddress}`);
            } catch (err) {
                console.error(`Error updating connected_relays status for ${macAddress}:`, err);
            }
        });

        ws.on('error', async (error) => {
            const relayData = connectedRelays.get(macAddress);
            const relayIP = relayData ? relayData.ip : 'unknown';
            console.error(`[PORT 40000] Error with relay ${macAddress} from IP: ${relayIP}:`, error);
            connectedRelays.delete(macAddress);
            
            // Update relay status to error
            try {
                await db.query(`
                    UPDATE relays 
                    SET status = 'error'
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`[PORT 40000] Updated relay status to error: ${macAddress}`);
            } catch (err) {
                console.error(`[PORT 40000] Error updating relay status for ${macAddress}:`, err);
            }
            // Update connected_relays table to mark as error
            try {
                await db.query(`
                    UPDATE connected_relays
                    SET status = 'error', is_connected = FALSE, last_seen = CURRENT_TIMESTAMP
                    WHERE mac_address = $1
                `, [macAddress]);
                console.log(`Updated connected_relays status to error: ${macAddress}`);
            } catch (err) {
                console.error(`Error updating connected_relays status for ${macAddress}:`, err);
            }
        });
    } else {
        console.log('[PORT 40000] Connection attempt without MAC address - ignoring');
        console.log(`[DEBUG] No MAC address found in URL: ${req.url}`);
        ws.close();
    }
});

// New API endpoint to send commands to a specific relay
app.post('/api/relays/:mac/command', async (req, res) => {
    const { mac } = req.params;
    const { command, type, relay, state } = req.body;

    // Simple relay command - send relay number directly to ESP32
    const messageToSend = {
        type: 'relay_control',
        relay: relay,  // Use relay number directly (0-7)
        state: state
    };

    const relayData = connectedRelays.get(mac);

    if (relayData && relayData.ws.readyState === WebSocket.OPEN) {
        relayData.ws.send(JSON.stringify(messageToSend));
        res.status(200).json({ message: `Command '${messageToSend.type}' sent to relay ${mac} at IP: ${relayData.ip}` });
    } else {
        res.status(404).json({ error: `Relay with MAC address ${mac} not connected or not ready.` });
    }
});

// API endpoint to get all assigned relays grouped by template with detailed information
app.get('/api/assigned-relays', authenticateToken, async (req, res) => {
    try {
        const templatesResult = await db.query('SELECT id, name, color FROM templates ORDER BY name');
        const templates = templatesResult.rows;
        const result = [];
        
        for (const template of templates) {
            const relaysResult = await db.query(`
                SELECT 
                    cr.id,
                    cr.mac_address, 
                    cr.name, 
                    cr.device_name, 
                    cr.status, 
                    cr.is_connected,
                    cr.ip_address,
                    cr.port,
                    cr.location,
                    cr.description,
                    cr.last_seen,
                    ra.assignment_type,
                    rc.relay_name as config_name
                FROM relay_assignments ra
                INNER JOIN connected_relays cr ON ra.connected_relay_id = cr.id
                LEFT JOIN relay_configurations rc ON cr.relay_configuration_id = rc.id
                WHERE ra.template_id = $1
                ORDER BY cr.name
            `, [template.id]);
            
            // Get channel configurations for each relay
            const relaysWithConfig = [];
            for (const r of relaysResult.rows) {
                const configResult = await db.query(`
                    SELECT channel_1, channel_2, channel_3, channel_4, channel_5, channel_6, channel_7, channel_8
                    FROM relay_settings 
                    WHERE connected_relay_id = $1 AND template_id = $2
                `, [r.id, template.id]);
                
                const channelConfig = {};
                if (configResult.rows.length > 0) {
                    const config = configResult.rows[0];
                    for (let i = 1; i <= 8; i++) {
                        if (config[`channel_${i}`]) {
                            channelConfig[i] = config[`channel_${i}`];
                        }
                    }
                }
                
                relaysWithConfig.push({
                    id: r.id,
                    mac_address: r.mac_address,
                    name: r.name || r.device_name || `Relay-${r.mac_address.substring(r.mac_address.length-6)}`,
                    status: r.status,
                    is_connected: r.is_connected,
                    ip_address: r.ip_address,
                    port: r.port || 81,
                    location: r.location,
                    description: r.description,
                    last_seen: r.last_seen,
                    assignment_type: r.assignment_type,
                    config_name: r.config_name,
                    channel_config: channelConfig
                });
            }
            
            result.push({
                id: template.id,
                name: template.name,
                color: template.color,
                relays: relaysWithConfig
            });
        }
        res.json({ templates: result });
    } catch (err) {
        console.error('Error fetching assigned relays:', err);
        res.status(500).json({ error: 'Failed to fetch assigned relays' });
    }
});

// API endpoint to unassign a relay from a template
app.delete('/api/assigned-relays/:templateId/:relayId', authenticateToken, async (req, res) => {
    const { templateId, relayId } = req.params;
    
    console.log(`[DEBUG] Attempting to unassign relay ${relayId} from template ${templateId}`);
    
    try {
        // Check if assignment exists first
        const checkResult = await db.query(
            'SELECT * FROM relay_assignments WHERE template_id = $1 AND connected_relay_id = $2',
            [templateId, relayId]
        );
        
        console.log(`[DEBUG] Found ${checkResult.rows.length} existing assignments`);
        
        // Delete the assignment
        const assignmentResult = await db.query(
            'DELETE FROM relay_assignments WHERE template_id = $1 AND connected_relay_id = $2',
            [templateId, relayId]
        );
        
        console.log(`[DEBUG] Deleted ${assignmentResult.rowCount} assignments`);
        
        if (assignmentResult.rowCount === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        // Also delete the relay settings for this assignment
        const settingsResult = await db.query(
            'DELETE FROM relay_settings WHERE template_id = $1 AND connected_relay_id = $2',
            [templateId, relayId]
        );
        
        console.log(`[DEBUG] Deleted ${settingsResult.rowCount} relay settings`);
        
        res.status(204).send();
    } catch (err) {
        console.error('Error removing relay assignment:', err);
        res.status(500).json({ error: 'Failed to remove relay assignment' });
    }
});

// Utility function to send relay commands using the correct format
async function sendRelayCommandByFunction(macAddress, relayIndex, state) {
    try {
        const relayData = connectedRelays.get(macAddress);
        if (!relayData || !relayData.ws || relayData.ws.readyState !== WebSocket.OPEN) {
            throw new Error(`Relay ${macAddress} is not connected`);
        }
        
        const command = {
            type: 'set_relay',
            device_id: macAddress,
            relay: relayIndex.toString(), // Convert to string as expected by ESP32
            state: state
        };
        
        console.log(`[RELAY] Sending command to ${macAddress}:`, command);
        relayData.ws.send(JSON.stringify(command));
        
        return true;
    } catch (error) {
        console.error(`[RELAY] Error sending command to ${macAddress}:`, error);
        throw error;
    }
}

// Helper function to find relay channel for a specific function
async function findRelayChannelForFunction(templateId, macAddress, functionName) {
    try {
        const result = await db.query(`
            SELECT rs.channel_1, rs.channel_2, rs.channel_3, rs.channel_4, 
                   rs.channel_5, rs.channel_6, rs.channel_7, rs.channel_8
            FROM relay_settings rs
            JOIN connected_relays cr ON rs.connected_relay_id = cr.id
            WHERE rs.template_id = $1 AND cr.mac_address = $2
        `, [templateId, macAddress]);
        
        if (result.rows.length === 0) {
            throw new Error(`No relay settings found for template ${templateId} and relay ${macAddress}`);
        }
        
        const settings = result.rows[0];
        for (let i = 1; i <= 8; i++) {
            if (settings[`channel_${i}`] === functionName) {
                return i - 1; // Return 0-based index for ESP32
            }
        }
        
        throw new Error(`Function ${functionName} not found in relay ${macAddress} configuration`);
    } catch (error) {
        console.error(`[RELAY] Error finding channel for function:`, error);
        throw error;
    }
}

// Get unified elevator status from all relays in a template
async function getUnifiedElevatorStatus(templateId) {
    try {
        // Get all elevator relays for this template
        const elevatorRelays = await getElevatorRelaysForTemplateFromDB(templateId);
        
        if (elevatorRelays.length === 0) {
            return null;
        }
        
        // Aggregate status from all relays
        const unifiedStatus = {
            door_open: false,
            door_close: false,
            basementodt: false,
            current_floor: null,
            last_updated: null,
            relay_count: elevatorRelays.length,
            relays: []
        };
        
        // Get status from each relay
        for (const relay of elevatorRelays) {
            const statusResult = await db.query(`
                SELECT status_data, last_updated FROM elevator_status WHERE relay_mac = $1
            `, [relay.mac_address]);
            
            if (statusResult.rows.length > 0) {
                const relayStatus = statusResult.rows[0].status_data || {};
                const lastUpdated = statusResult.rows[0].last_updated;
                
                // Aggregate door status (any relay can indicate door state)
                if (relayStatus.door_open) unifiedStatus.door_open = true;
                if (relayStatus.door_close) unifiedStatus.door_close = true;
                if (relayStatus.basementodt) unifiedStatus.basementodt = true;
                
                // Floor status (only one floor should be active at a time)
                if (relayStatus.current_floor && !unifiedStatus.current_floor) {
                    unifiedStatus.current_floor = relayStatus.current_floor;
                }
                
                // Track the most recent update
                if (!unifiedStatus.last_updated || lastUpdated > unifiedStatus.last_updated) {
                    unifiedStatus.last_updated = lastUpdated;
                }
                
                unifiedStatus.relays.push({
                    mac_address: relay.mac_address,
                    name: relay.name,
                    status: relayStatus,
                    last_updated: lastUpdated
                });
            }
        }
        
        console.log(`[ELEVATOR] Unified status for template ${templateId}:`, unifiedStatus);
        return unifiedStatus;
        
    } catch (error) {
        console.error(`[ERROR] Error getting unified elevator status for template ${templateId}:`, error);
        return null;
    }
}

// Wait for unified elevator status with timeout
async function waitForUnifiedElevatorStatus(templateId, expectedStatus, timeout = 30000) {
    console.log(`[ELEVATOR] Waiting for unified elevator status: ${JSON.stringify(expectedStatus)}`);
    
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const checkStatus = () => {
            getUnifiedElevatorStatus(templateId).then(status => {
                if (!status) {
                    if (Date.now() - startTime > timeout) {
                        reject(new Error(`Timeout waiting for elevator status after ${timeout}ms`));
                    } else {
                        setTimeout(checkStatus, 1000);
                    }
                    return;
                }
                
                // Check if all expected conditions are met
                let allConditionsMet = true;
                for (const [key, expectedValue] of Object.entries(expectedStatus)) {
                    if (status[key] !== expectedValue) {
                        allConditionsMet = false;
                        break;
                    }
                }
                
                if (allConditionsMet) {
                    console.log(`[ELEVATOR] ✅ Unified elevator status conditions met:`, status);
                    resolve(status);
                } else {
                    if (Date.now() - startTime > timeout) {
                        reject(new Error(`Timeout waiting for elevator status. Expected: ${JSON.stringify(expectedStatus)}, Got: ${JSON.stringify(status)}`));
                    } else {
                        setTimeout(checkStatus, 1000);
                    }
                }
            }).catch(error => {
                if (Date.now() - startTime > timeout) {
                    reject(error);
                } else {
                    setTimeout(checkStatus, 1000);
                }
            });
        };
        
        checkStatus();
    });
}

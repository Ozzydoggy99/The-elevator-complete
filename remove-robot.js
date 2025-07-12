const db = require('./config/database');

async function removeRobot() {
    try {
        console.log('Removing robot L382502104988is from database...');
        
        // First, let's see what robots are in the database
        const robotsResult = await db.query('SELECT * FROM robots');
        console.log('Current robots in database:');
        robotsResult.rows.forEach(robot => {
            console.log(`- ${robot.serial_number} (${robot.public_ip}) - Status: ${robot.status}`);
        });
        
        // Remove the specific robot
        const result = await db.query(
            'DELETE FROM robots WHERE serial_number = $1',
            ['L382502104988is']
        );
        
        if (result.rowCount > 0) {
            console.log('✅ Robot L382502104988is removed from database');
        } else {
            console.log('⚠️ Robot L382502104988is not found in database');
        }
        
        // Also remove any maps associated with this robot
        const mapsResult = await db.query(
            'DELETE FROM maps WHERE robot_serial_number = $1',
            ['L382502104988is']
        );
        
        if (mapsResult.rowCount > 0) {
            console.log(`✅ Removed ${mapsResult.rowCount} maps associated with robot L382502104988is`);
        }
        
        console.log('Robot removal completed');
        
    } catch (error) {
        console.error('Error removing robot:', error);
    } finally {
        await db.end();
    }
}

removeRobot(); 
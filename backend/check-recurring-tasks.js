const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'robot_interface',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
});

async function checkRecurringTasks() {
    try {
        console.log('Checking recurring tasks in database...\n');
        
        // Check if recurring_tasks table exists
        const tableExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'recurring_tasks'
            );
        `);
        
        if (!tableExists.rows[0].exists) {
            console.log('❌ recurring_tasks table does not exist!');
            return;
        }
        
        console.log('✅ recurring_tasks table exists');
        
        // Get all recurring tasks
        const result = await pool.query(`
            SELECT 
                rt.*,
                t.name as template_name
            FROM recurring_tasks rt
            LEFT JOIN templates t ON rt.template_id = t.id
            WHERE rt.is_active = true
            ORDER BY rt.created_at DESC
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ No active recurring tasks found');
        } else {
            console.log(`✅ Found ${result.rows.length} active recurring task(s):\n`);
            
            result.rows.forEach((task, index) => {
                console.log(`Task ${index + 1}:`);
                console.log(`  ID: ${task.id}`);
                console.log(`  Template: ${task.template_name} (ID: ${task.template_id})`);
                console.log(`  Type: ${task.task_type}`);
                console.log(`  Floor: ${task.floor}`);
                console.log(`  Shelf Point: ${task.shelf_point}`);
                console.log(`  Time: ${task.schedule_time}`);
                console.log(`  Days: ${task.days_of_week.join(', ')}`);
                console.log(`  Created: ${task.created_at}`);
                console.log('');
            });
        }
        
        // Check current time and day
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5);
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
        
        console.log(`Current time: ${currentTime}`);
        console.log(`Current day: ${currentDay}`);
        
        // Check if any tasks should run now
        const shouldRunNow = result.rows.filter(task => 
            task.schedule_time === currentTime && 
            task.days_of_week.includes(currentDay)
        );
        
        if (shouldRunNow.length > 0) {
            console.log(`\n🎯 ${shouldRunNow.length} task(s) should run right now!`);
        } else {
            console.log('\n⏰ No tasks scheduled to run at the current time');
        }
        
    } catch (error) {
        console.error('❌ Error checking recurring tasks:', error.message);
    } finally {
        await pool.end();
    }
}

checkRecurringTasks().catch(console.error); 
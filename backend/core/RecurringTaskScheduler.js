const db = require('../config/database');

class RecurringTaskScheduler {
    constructor() {
        // Use the same database connection as the main server
        this.pool = db.pool;
        this.isRunning = false;
        this.checkInterval = null;
    }

    async start() {
        if (this.isRunning) {
            console.log('RecurringTaskScheduler is already running');
            return;
        }

        console.log('Starting RecurringTaskScheduler...');
        this.isRunning = true;

        // Check immediately on startup
        await this.checkAndQueueRecurringTasks();

        // Then check every minute
        this.checkInterval = setInterval(async () => {
            await this.checkAndQueueRecurringTasks();
        }, 60000); // 60 seconds = 1 minute

        console.log('RecurringTaskScheduler started successfully');
    }

    async stop() {
        if (!this.isRunning) {
            console.log('RecurringTaskScheduler is not running');
            return;
        }

        console.log('Stopping RecurringTaskScheduler...');
        this.isRunning = false;

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        console.log('RecurringTaskScheduler stopped successfully');
    }

    async checkAndQueueRecurringTasks() {
        try {
            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

            console.log(`Checking recurring tasks at ${currentTime} on ${currentDay}`);

            // Query for recurring tasks that should run now OR should have run today but haven't been queued yet
            const query = `
                SELECT rt.*, t.name as template_name, t.robot
                FROM recurring_tasks rt
                JOIN templates t ON rt.template_id = t.id
                WHERE rt.is_active = true
                AND $1 = ANY(rt.days_of_week)
                AND (
                    rt.schedule_time = $2::time
                    OR (
                        rt.schedule_time <= $2::time
                        AND NOT EXISTS (
                            SELECT 1 FROM task_queue tq 
                            WHERE tq.recurring_task_id = rt.id 
                            AND DATE(tq.created_at) = CURRENT_DATE
                        )
                    )
                )
            `;

            const result = await this.pool.query(query, [currentDay, currentTime]);

            if (result.rows.length === 0) {
                console.log('No recurring tasks to queue at this time');
                return;
            }

            console.log(`Found ${result.rows.length} recurring tasks to queue`);

            // Queue each recurring task
            for (const recurringTask of result.rows) {
                await this.queueRecurringTask(recurringTask);
            }

        } catch (error) {
            console.error('Error checking recurring tasks:', error);
        }
    }

    async queueRecurringTask(recurringTask) {
        try {
            console.log(`Queueing recurring task: ${recurringTask.task_type} for template ${recurringTask.template_name}`);

            // Parse robot information
            let robot = recurringTask.robot;
            if (typeof robot === 'string') {
                try {
                    robot = JSON.parse(robot);
                } catch (e) {
                    console.error('Error parsing robot JSON:', e);
                    return;
                }
            }

            const robotSerial = robot?.serial_number || robot?.serialNumber;
            if (!robotSerial) {
                console.error('No robot serial number found for template');
                return;
            }

            // Create the task object
            const taskData = {
                type: recurringTask.task_type,
                floor: recurringTask.floor,
                shelfPoint: recurringTask.shelf_point,
                robot_serial_number: robotSerial,
                template_id: recurringTask.template_id,
                is_recurring: true,
                recurring_task_id: recurringTask.id,
                schedule: {
                    time: recurringTask.schedule_time,
                    days_of_week: recurringTask.days_of_week,
                    is_recurring: true
                }
            };

            // Insert the task into the queue
            const insertQuery = `
                INSERT INTO task_queue (
                    template_id, 
                    type, 
                    floor, 
                    shelf_point, 
                    robot_serial_number, 
                    status, 
                    is_recurring, 
                    recurring_task_id,
                    schedule,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                RETURNING id
            `;

            const insertResult = await this.pool.query(insertQuery, [
                recurringTask.template_id,
                recurringTask.task_type,
                recurringTask.floor,
                recurringTask.shelf_point,
                robotSerial,
                'queued',
                true,
                recurringTask.id,
                JSON.stringify(taskData.schedule)
            ]);

            console.log(`✅ Recurring task queued successfully with ID: ${insertResult.rows[0].id}`);

        } catch (error) {
            console.error('Error queueing recurring task:', error);
        }
    }

    async createRecurringTask(templateId, taskData) {
        try {
            const { type, floor, shelfPoint, schedule } = taskData;
            const { time, days_of_week } = schedule;

            const query = `
                INSERT INTO recurring_tasks (
                    template_id, 
                    task_type, 
                    floor, 
                    shelf_point, 
                    schedule_time, 
                    days_of_week
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `;

            const result = await this.pool.query(query, [
                templateId,
                type,
                floor,
                shelfPoint,
                time,
                days_of_week
            ]);

            console.log(`✅ Recurring task created with ID: ${result.rows[0].id}`);
            return result.rows[0];

        } catch (error) {
            console.error('Error creating recurring task:', error);
            throw error;
        }
    }

    async getRecurringTasks(templateId) {
        try {
            const query = `
                SELECT * FROM recurring_tasks 
                WHERE template_id = $1 AND is_active = true
                ORDER BY created_at DESC
            `;

            const result = await this.pool.query(query, [templateId]);
            return result.rows;

        } catch (error) {
            console.error('Error fetching recurring tasks:', error);
            throw error;
        }
    }

    async deleteRecurringTask(recurringTaskId) {
        try {
            console.log(`Attempting to delete recurring task ${recurringTaskId}`);
            
            // First, cancel any queued tasks from this recurring task
            const cancelQuery = `
                UPDATE task_queue 
                SET status = 'cancelled' 
                WHERE recurring_task_id = $1 
                AND status IN ('queued', 'in_progress')
            `;
            const cancelResult = await this.pool.query(cancelQuery, [recurringTaskId]);
            console.log(`Cancelled ${cancelResult.rowCount} queued tasks for recurring task ${recurringTaskId}`);

            // Then mark the recurring task as inactive
            const deleteQuery = `
                UPDATE recurring_tasks 
                SET is_active = false 
                WHERE id = $1
            `;
            const deleteResult = await this.pool.query(deleteQuery, [recurringTaskId]);
            console.log(`Updated ${deleteResult.rowCount} recurring tasks for ID ${recurringTaskId}`);

            if (deleteResult.rowCount === 0) {
                throw new Error(`No recurring task found with ID ${recurringTaskId}`);
            }

            console.log(`✅ Recurring task ${recurringTaskId} deleted successfully`);
            return true;

        } catch (error) {
            console.error('Error deleting recurring task:', error);
            throw error;
        }
    }

    async getStatus() {
        return {
            isRunning: this.isRunning,
            lastCheck: new Date().toISOString()
        };
    }
}

module.exports = RecurringTaskScheduler; 
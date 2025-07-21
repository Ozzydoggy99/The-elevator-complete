-- Create recurring tasks table
CREATE TABLE IF NOT EXISTS recurring_tasks (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    floor VARCHAR(50) NOT NULL,
    shelf_point VARCHAR(50) NOT NULL,
    schedule_time TIME NOT NULL,
    days_of_week TEXT[] NOT NULL, -- Array of days: ['monday', 'tuesday', etc.]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying by time and active status
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_time_active ON recurring_tasks(schedule_time, is_active);

-- Create index for template_id lookups
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_template ON recurring_tasks(template_id);

-- Add comment to explain the table
COMMENT ON TABLE recurring_tasks IS 'Stores recurring tasks that should be automatically queued based on time and day of week';
COMMENT ON COLUMN recurring_tasks.days_of_week IS 'Array of lowercase day names: monday, tuesday, wednesday, thursday, friday, saturday, sunday'; 
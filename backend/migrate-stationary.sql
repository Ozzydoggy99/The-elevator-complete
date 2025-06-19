-- Migration script to add stationary column to templates table
-- Run this script to update existing database schema

-- Add stationary column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'templates' AND column_name = 'stationary'
    ) THEN
        ALTER TABLE templates ADD COLUMN stationary BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added stationary column to templates table';
    ELSE
        RAISE NOTICE 'stationary column already exists in templates table';
    END IF;
END $$;

-- Update existing templates to have stationary = false by default
UPDATE templates SET stationary = FALSE WHERE stationary IS NULL; 
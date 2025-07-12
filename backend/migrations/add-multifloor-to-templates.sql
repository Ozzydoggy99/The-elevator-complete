-- Add multifloor column to templates table
ALTER TABLE templates ADD COLUMN IF NOT EXISTS multifloor BOOLEAN DEFAULT FALSE;
 
-- Update existing templates to have multifloor set to false by default
UPDATE templates SET multifloor = FALSE WHERE multifloor IS NULL; 
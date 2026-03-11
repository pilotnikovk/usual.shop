-- Add category and reading_time to news/blog table
ALTER TABLE news ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'blog';
ALTER TABLE news ADD COLUMN IF NOT EXISTS reading_time INTEGER DEFAULT 5;

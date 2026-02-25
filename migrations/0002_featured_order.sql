-- Add featured_order column to products table for "Popular products" feature
-- featured_order = NULL means not featured
-- featured_order = 1,2,3... means featured, shown in that order on the main page

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'featured_order'
  ) THEN
    ALTER TABLE products ADD COLUMN featured_order INTEGER DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_featured_order ON products (featured_order) WHERE featured_order IS NOT NULL;

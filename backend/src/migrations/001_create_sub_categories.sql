CREATE TABLE IF NOT EXISTS sub_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_categories_category_id 
    FOREIGN KEY (category_id) 
    REFERENCES categories(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sub_categories_category_id ON sub_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_sub_categories_is_active ON sub_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_sub_categories_created_at ON sub_categories(created_at);

-- products.sub_category_id -> sub_categories. Declared here rather than in
-- 001_create_produc.sql, which sorts (and so runs) before this file.
-- Guarded, because databases created before the move already have it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_sub_category'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT fk_products_sub_category
      FOREIGN KEY (sub_category_id)
      REFERENCES sub_categories(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;

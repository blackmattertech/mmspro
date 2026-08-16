-- QUERY NAME: 58-trigram-search-indexes — Trigram indexes for ilike search

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_equipment_name_trgm
  ON equipment USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_equipment_code_trgm
  ON equipment USING gin (code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_warranties_serial_trgm
  ON warranties USING gin (serial_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_warranties_make_trgm
  ON warranties USING gin (make gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm
  ON vendors USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vendors_code_trgm
  ON vendors USING gin (vendor_code gin_trgm_ops);

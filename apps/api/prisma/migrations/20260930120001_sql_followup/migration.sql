-- RAW SQL follow-up (doc 24 §19): partial uniques, CHECKs, published-only indexes, grants.
-- Composite FK properties(locality_id, city_id) is emitted by Prisma 6 as properties_locality_id_city_id_fkey.

CREATE UNIQUE INDEX IF NOT EXISTS listings_published_property_intent_uidx
  ON listings (property_id, intent)
  WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS listings_slug_alive_uidx
  ON listings (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_search_default
  ON listings (intent, published_at DESC, id DESC)
  WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_price
  ON listings (intent, price_amount, id)
  WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS analytics_events_listing_id_partial_idx
  ON analytics_events (listing_id, created_at DESC)
  WHERE listing_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname IN ('properties_locality_city_fkey', 'properties_locality_id_city_id_fkey')
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_locality_id_city_id_fkey
      FOREIGN KEY (locality_id, city_id)
      REFERENCES localities (id, city_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_failed_login_count_nonneg;
ALTER TABLE users ADD CONSTRAINT users_failed_login_count_nonneg CHECK (failed_login_count >= 0);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_lat_lng_pair;
ALTER TABLE properties ADD CONSTRAINT properties_lat_lng_pair CHECK (
  (lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL)
);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_area_value_pos;
ALTER TABLE properties ADD CONSTRAINT properties_area_value_pos CHECK (area_value IS NULL OR area_value > 0);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_bedrooms_nonneg;
ALTER TABLE properties ADD CONSTRAINT properties_bedrooms_nonneg CHECK (bedrooms IS NULL OR bedrooms >= 0);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_bathrooms_nonneg;
ALTER TABLE properties ADD CONSTRAINT properties_bathrooms_nonneg CHECK (bathrooms IS NULL OR bathrooms >= 0);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_balconies_nonneg;
ALTER TABLE properties ADD CONSTRAINT properties_balconies_nonneg CHECK (balconies IS NULL OR balconies >= 0);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_age_years_nonneg;
ALTER TABLE properties ADD CONSTRAINT properties_age_years_nonneg CHECK (age_years IS NULL OR age_years >= 0);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_parking_count_nonneg;
ALTER TABLE properties ADD CONSTRAINT properties_parking_count_nonneg CHECK (parking_count IS NULL OR parking_count >= 0);

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_intent_price_period;
ALTER TABLE listings ADD CONSTRAINT listings_intent_price_period CHECK (
  (intent = 'RENT' AND price_period = 'MONTHLY')
  OR (intent = 'BUY' AND price_period = 'ONE_TIME')
);

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_price_amount_pos;
ALTER TABLE listings ADD CONSTRAINT listings_price_amount_pos CHECK (price_amount IS NULL OR price_amount > 0);

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_maintenance_nonneg;
ALTER TABLE listings ADD CONSTRAINT listings_maintenance_nonneg CHECK (maintenance_amount IS NULL OR maintenance_amount >= 0);

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_deposit_nonneg;
ALTER TABLE listings ADD CONSTRAINT listings_deposit_nonneg CHECK (deposit_amount IS NULL OR deposit_amount >= 0);

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_byte_size_pos;
ALTER TABLE media ADD CONSTRAINT media_byte_size_pos CHECK (byte_size > 0);

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_width_pos;
ALTER TABLE media ADD CONSTRAINT media_width_pos CHECK (width IS NULL OR width > 0);

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_height_pos;
ALTER TABLE media ADD CONSTRAINT media_height_pos CHECK (height IS NULL OR height > 0);

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_content_type_allowlist;
ALTER TABLE media ADD CONSTRAINT media_content_type_allowlist CHECK (
  content_type IN ('image/jpeg', 'image/png', 'image/webp')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    GRANT USAGE ON SCHEMA public TO app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON
      users, password_reset_tokens, refresh_tokens, roles, permissions,
      role_permissions, user_roles, cities, localities, amenities,
      properties, property_amenities, listings, media, leads, visits,
      saved_listings, service_catalog_items, service_enquiries
    TO app;

    GRANT SELECT, INSERT, UPDATE ON notification_logs TO app;
    REVOKE DELETE ON notification_logs FROM app;

    GRANT SELECT, INSERT ON audit_logs TO app;
    REVOKE UPDATE, DELETE ON audit_logs FROM app;

    GRANT SELECT, INSERT ON analytics_events TO app;
    REVOKE UPDATE, DELETE ON analytics_events FROM app;
  END IF;
END $$;

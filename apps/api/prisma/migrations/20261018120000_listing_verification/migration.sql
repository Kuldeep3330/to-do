-- Verified badge and freshness tracking for listings.
ALTER TABLE "listings"
  ADD COLUMN "verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "verified_by_user_id" UUID,
  ADD COLUMN "last_confirmed_at" TIMESTAMPTZ(6);

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing published listings count as confirmed when they were published.
UPDATE "listings" SET "last_confirmed_at" = "published_at" WHERE "status" = 'PUBLISHED' AND "published_at" IS NOT NULL;

CREATE INDEX "listings_status_last_confirmed_at_idx" ON "listings"("status", "last_confirmed_at");

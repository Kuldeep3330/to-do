-- Owner and sales-agent self-listing: who created the property/listing.
ALTER TABLE "properties" ADD COLUMN "created_by_user_id" UUID;
ALTER TABLE "listings" ADD COLUMN "created_by_user_id" UUID;

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "properties_created_by_user_id_idx" ON "properties"("created_by_user_id");
CREATE INDEX "listings_created_by_user_id_idx" ON "listings"("created_by_user_id");

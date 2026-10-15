-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "property_type" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'PLOT');

-- CreateEnum
CREATE TYPE "property_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "furnishing" AS ENUM ('UNFURNISHED', 'SEMI', 'FURNISHED');

-- CreateEnum
CREATE TYPE "area_unit" AS ENUM ('SQFT');

-- CreateEnum
CREATE TYPE "listing_intent" AS ENUM ('BUY', 'RENT');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "price_period" AS ENUM ('MONTHLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'VISIT_SCHEDULED', 'WON', 'LOST', 'SPAM');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('WEB_FORM', 'CONTACT_FORM', 'ADMIN');

-- CreateEnum
CREATE TYPE "visit_status" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "visit_slot" AS ENUM ('ANY', 'MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "media_variant" AS ENUM ('ORIGINAL', 'CARD', 'DETAIL');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "service_enquiry_status" AS ENUM ('NEW', 'CONTACTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "email_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "property_type" NOT NULL,
    "status" "property_status" NOT NULL DEFAULT 'ACTIVE',
    "city_id" UUID NOT NULL,
    "locality_id" UUID NOT NULL,
    "society_name" VARCHAR(160),
    "address_text" VARCHAR(500),
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "area_value" DECIMAL(12,2),
    "area_unit" "area_unit" NOT NULL DEFAULT 'SQFT',
    "bedrooms" SMALLINT,
    "bathrooms" SMALLINT,
    "balconies" SMALLINT,
    "floor" SMALLINT,
    "total_floors" SMALLINT,
    "furnishing" "furnishing",
    "facing" VARCHAR(30),
    "age_years" SMALLINT,
    "parking_count" SMALLINT,
    "internal_title" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_amenities" (
    "property_id" UUID NOT NULL,
    "amenity_id" UUID NOT NULL,

    CONSTRAINT "property_amenities_pkey" PRIMARY KEY ("property_id","amenity_id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "intent" "listing_intent" NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" VARCHAR(180) NOT NULL,
    "price_amount" BIGINT,
    "price_period" "price_period" NOT NULL,
    "maintenance_amount" BIGINT,
    "deposit_amount" BIGINT,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "available_from" DATE,
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "variant" "media_variant" NOT NULL DEFAULT 'ORIGINAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID,
    "user_id" UUID,
    "assigned_to_user_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "message" VARCHAR(1000),
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "source" "lead_source" NOT NULL DEFAULT 'WEB_FORM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "preferred_date" DATE,
    "preferred_slot" "visit_slot" NOT NULL DEFAULT 'ANY',
    "status" "visit_status" NOT NULL DEFAULT 'REQUESTED',
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_listings" (
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("user_id","listing_id")
);

-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_enquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "catalog_item_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "message" VARCHAR(1000),
    "city" VARCHAR(80),
    "status" "service_enquiry_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "listing_id" UUID,
    "user_id" UUID,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template" VARCHAR(80) NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "to_masked" VARCHAR(255) NOT NULL,
    "status" "notification_status" NOT NULL,
    "provider_message_id" VARCHAR(160),
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_created_at_idx" ON "password_reset_tokens"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE INDEX "localities_city_id_is_active_idx" ON "localities"("city_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "localities_city_id_slug_key" ON "localities"("city_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "localities_id_city_id_key" ON "localities"("id", "city_id");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_code_key" ON "amenities"("code");

-- CreateIndex
CREATE INDEX "properties_locality_id_idx" ON "properties"("locality_id");

-- CreateIndex
CREATE INDEX "properties_city_id_type_idx" ON "properties"("city_id", "type");

-- CreateIndex
CREATE INDEX "listings_property_id_idx" ON "listings"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_listing_id_variant_sort_order_idx" ON "media"("listing_id", "variant", "sort_order");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_assigned_to_user_id_status_created_at_idx" ON "leads"("assigned_to_user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_user_id_created_at_idx" ON "leads"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_phone_listing_id_created_at_idx" ON "leads"("phone", "listing_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "visits_lead_id_created_at_idx" ON "visits"("lead_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "visits_status_preferred_date_idx" ON "visits"("status", "preferred_date");

-- CreateIndex
CREATE INDEX "saved_listings_user_id_created_at_idx" ON "saved_listings"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_items_slug_key" ON "service_catalog_items"("slug");

-- CreateIndex
CREATE INDEX "service_enquiries_created_at_idx" ON "service_enquiries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "service_enquiries_phone_created_at_idx" ON "service_enquiries"("phone", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analytics_events_name_created_at_idx" ON "analytics_events"("name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_locality_id_city_id_fkey" FOREIGN KEY ("locality_id", "city_id") REFERENCES "localities"("id", "city_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_enquiries" ADD CONSTRAINT "service_enquiries_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "service_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Community Insights polls: anonymous votes with server-enforced lifecycle. Additive only.
-- Rollback: DROP TABLE community_poll_votes, community_poll_options, community_polls; DROP TYPE poll_status;
CREATE TYPE "poll_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "community_polls" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "question" VARCHAR(200) NOT NULL,
  "status" "poll_status" NOT NULL DEFAULT 'DRAFT',
  "opens_at" TIMESTAMPTZ(6),
  "closes_at" TIMESTAMPTZ(6),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "community_polls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_polls_window_order" CHECK ("opens_at" IS NULL OR "closes_at" IS NULL OR "closes_at" > "opens_at")
);
CREATE INDEX "community_polls_status_sort_order_idx" ON "community_polls"("status", "sort_order");

CREATE TABLE "community_poll_options" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "poll_id" UUID NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "community_poll_options_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_poll_options_id_poll_id_key" ON "community_poll_options"("id", "poll_id");
CREATE INDEX "community_poll_options_poll_id_position_idx" ON "community_poll_options"("poll_id", "position");
ALTER TABLE "community_poll_options"
  ADD CONSTRAINT "community_poll_options_poll_id_fkey"
  FOREIGN KEY ("poll_id") REFERENCES "community_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "community_poll_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "poll_id" UUID NOT NULL,
  "option_id" UUID NOT NULL,
  "voter_hash" CHAR(64) NOT NULL,
  "locality_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_poll_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_poll_votes_poll_id_voter_hash_key" ON "community_poll_votes"("poll_id", "voter_hash");
CREATE INDEX "community_poll_votes_poll_id_option_id_idx" ON "community_poll_votes"("poll_id", "option_id");
CREATE INDEX "community_poll_votes_poll_id_locality_id_idx" ON "community_poll_votes"("poll_id", "locality_id");
ALTER TABLE "community_poll_votes"
  ADD CONSTRAINT "community_poll_votes_poll_id_fkey"
  FOREIGN KEY ("poll_id") REFERENCES "community_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_poll_votes"
  ADD CONSTRAINT "community_poll_votes_option_id_poll_id_fkey"
  FOREIGN KEY ("option_id", "poll_id") REFERENCES "community_poll_options"("id", "poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "community_polls", "community_poll_options" TO app;
    -- Votes are never edited or deleted by the application.
    GRANT SELECT, INSERT ON "community_poll_votes" TO app;
  END IF;
END $$;

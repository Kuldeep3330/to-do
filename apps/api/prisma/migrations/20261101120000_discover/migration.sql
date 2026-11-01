-- NCR Homes Discover: anonymous-by-default assessments and saved preference profiles.
-- Additive only. Rollback: DROP TABLE discover_preference_profiles, discover_responses; DROP TYPE discover_kind;
CREATE TYPE "discover_kind" AS ENUM ('CUSTOMER', 'OWNER', 'AGENT');

CREATE TABLE "discover_responses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" "discover_kind" NOT NULL,
  "version" INTEGER NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "user_id" UUID,
  "answers" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discover_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discover_responses_token_hash_key" ON "discover_responses"("token_hash");
CREATE INDEX "discover_responses_kind_created_at_idx" ON "discover_responses"("kind", "created_at" DESC);
CREATE INDEX "discover_responses_user_id_idx" ON "discover_responses"("user_id");

ALTER TABLE "discover_responses"
  ADD CONSTRAINT "discover_responses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "discover_preference_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "preferences" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "discover_preference_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discover_preference_profiles_user_id_key" ON "discover_preference_profiles"("user_id");

ALTER TABLE "discover_preference_profiles"
  ADD CONSTRAINT "discover_preference_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Participants can delete their own saved data, so the runtime role may delete here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "discover_responses", "discover_preference_profiles" TO app;
  END IF;
END $$;

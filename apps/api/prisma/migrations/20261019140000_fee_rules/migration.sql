-- Money model: owner success fee. One configurable rule per listing intent, and the fee earned on each won deal.
CREATE TYPE "fee_method" AS ENUM ('FIXED', 'PERCENT');

CREATE TABLE "fee_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "intent" "listing_intent" NOT NULL,
  "method" "fee_method" NOT NULL,
  "value" DECIMAL(12, 2) NOT NULL,
  "min_fee" BIGINT,
  "max_fee" BIGINT,
  "updated_by_user_id" UUID,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_rules_value_positive" CHECK ("value" > 0),
  CONSTRAINT "fee_rules_percent_max" CHECK ("method" <> 'PERCENT' OR "value" <= 100),
  CONSTRAINT "fee_rules_min_max" CHECK ("min_fee" IS NULL OR "max_fee" IS NULL OR "min_fee" <= "max_fee"),
  CONSTRAINT "fee_rules_bounds_positive" CHECK (("min_fee" IS NULL OR "min_fee" >= 0) AND ("max_fee" IS NULL OR "max_fee" >= 0))
);

CREATE UNIQUE INDEX "fee_rules_intent_key" ON "fee_rules"("intent");

ALTER TABLE "leads" ADD COLUMN "fee_amount" BIGINT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_fee_amount_nonnegative" CHECK ("fee_amount" IS NULL OR "fee_amount" >= 0);

-- The runtime role reads and writes rules but never deletes them (the audit log records every change).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    GRANT SELECT, INSERT, UPDATE ON "fee_rules" TO app;
  END IF;
END $$;

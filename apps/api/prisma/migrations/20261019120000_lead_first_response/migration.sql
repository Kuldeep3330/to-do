-- Time to first response on a lead, measured against LEAD_RESPONSE_SLA_MINUTES.
ALTER TABLE "leads" ADD COLUMN "first_response_at" TIMESTAMPTZ(6);

-- Leads already worked count as responded when they were last updated.
UPDATE "leads" SET "first_response_at" = "updated_at" WHERE "status" <> 'NEW';

CREATE INDEX "leads_status_first_response_at_created_at_idx" ON "leads"("status", "first_response_at", "created_at");

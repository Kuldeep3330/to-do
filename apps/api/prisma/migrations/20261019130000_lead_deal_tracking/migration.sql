-- Deal tracking: what a won lead closed at (monthly rent for rentals, sale price for purchases, in INR) and when.
ALTER TABLE "leads"
  ADD COLUMN "closed_amount" BIGINT,
  ADD COLUMN "closed_on" DATE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_closed_amount_positive" CHECK ("closed_amount" IS NULL OR "closed_amount" > 0);

CREATE INDEX "leads_status_closed_on_idx" ON "leads"("status", "closed_on");

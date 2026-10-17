ALTER TABLE "predictions" ALTER COLUMN "expected_duration_months" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ALTER COLUMN "expected_expense" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ALTER COLUMN "confidence" DROP NOT NULL;
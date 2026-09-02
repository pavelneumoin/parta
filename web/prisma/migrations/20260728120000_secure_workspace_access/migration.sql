-- Workspace-scoped student access. Only a SHA-256 hash is persisted;
-- the raw credential is issued once in an HttpOnly cookie.
ALTER TABLE "Workspace" ADD COLUMN "studentAccessHash" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "studentAccessExpiresAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "claimedAt" DATETIME;

CREATE UNIQUE INDEX "Workspace_studentAccessHash_key"
ON "Workspace"("studentAccessHash");

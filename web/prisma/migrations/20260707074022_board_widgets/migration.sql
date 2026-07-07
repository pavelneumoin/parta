-- CreateTable
CREATE TABLE "BoardWidget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "pageIndex" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL,
    "xFrac" REAL NOT NULL DEFAULT 0.3,
    "yFrac" REAL NOT NULL DEFAULT 0.15,
    "state" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "BoardWidget_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BoardWidget_sessionId_deletedAt_idx" ON "BoardWidget"("sessionId", "deletedAt");

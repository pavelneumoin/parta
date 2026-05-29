-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "templateKind" TEXT NOT NULL DEFAULT 'blank_grid',
    "templateId" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" DATETIME,
    "classId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lesson_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TemplateFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lesson" ("classId", "createdAt", "id", "pageCount", "scheduledFor", "teacherId", "templateId", "templateKind", "title", "updatedAt") SELECT "classId", "createdAt", "id", "pageCount", "scheduledFor", "teacherId", "templateId", "templateKind", "title", "updatedAt" FROM "Lesson";
DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE INDEX "Lesson_teacherId_idx" ON "Lesson"("teacherId");
CREATE INDEX "Lesson_scheduledFor_idx" ON "Lesson"("scheduledFor");
CREATE INDEX "Lesson_classId_idx" ON "Lesson"("classId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "classId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "scheduledFor" DATETIME;

-- CreateIndex
CREATE INDEX "Lesson_scheduledFor_idx" ON "Lesson"("scheduledFor");

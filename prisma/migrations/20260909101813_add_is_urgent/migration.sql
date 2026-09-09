-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "system" TEXT NOT NULL DEFAULT 'WMS',
    "developmentDays" INTEGER,
    "currentNode" TEXT NOT NULL DEFAULT '方案中',
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "releaseDate" DATETIME,
    "remark" TEXT,
    "workOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Requirement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Requirement" ("content", "createdAt", "currentNode", "date", "developmentDays", "id", "isReleased", "releaseDate", "remark", "requirementId", "system", "title", "updatedAt", "workOrderId") SELECT "content", "createdAt", "currentNode", "date", "developmentDays", "id", "isReleased", "releaseDate", "remark", "requirementId", "system", "title", "updatedAt", "workOrderId" FROM "Requirement";
DROP TABLE "Requirement";
ALTER TABLE "new_Requirement" RENAME TO "Requirement";
CREATE UNIQUE INDEX "Requirement_requirementId_key" ON "Requirement"("requirementId");
CREATE UNIQUE INDEX "Requirement_workOrderId_key" ON "Requirement"("workOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

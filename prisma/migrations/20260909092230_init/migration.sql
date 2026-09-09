-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT 'WMS',
    "isConvertToRequirement" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT '新建',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "system" TEXT NOT NULL DEFAULT 'WMS',
    "developmentDays" INTEGER,
    "currentNode" TEXT NOT NULL DEFAULT '方案中',
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "releaseDate" DATETIME,
    "remark" TEXT,
    "workOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Requirement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_requirementId_key" ON "Requirement"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_workOrderId_key" ON "Requirement"("workOrderId");

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Season_ownerId_idx" ON "Season"("ownerId");

-- AlterTable
ALTER TABLE "Meet" ADD COLUMN "seasonId" TEXT;

-- CreateIndex
CREATE INDEX "Meet_seasonId_idx" ON "Meet"("seasonId");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meet" ADD CONSTRAINT "Meet_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

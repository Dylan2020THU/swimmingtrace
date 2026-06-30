-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "Stroke" AS ENUM ('FREE', 'BACK', 'BREAST', 'FLY', 'IM');
CREATE TYPE "ResultStatus" AS ENUM ('ENTERED', 'OK', 'DNS', 'DNF', 'DQ');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "gender" "Gender",
ADD COLUMN "birthDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Meet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meetDate" TIMESTAMP(3) NOT NULL,
    "hostPoolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceEvent" (
    "id" TEXT NOT NULL,
    "meetId" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "stroke" "Stroke" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetEntry" (
    "id" TEXT NOT NULL,
    "raceEventId" TEXT NOT NULL,
    "swimmerId" TEXT NOT NULL,
    "seedTimeMs" INTEGER,
    "resultTimeMs" INTEGER,
    "resultStatus" "ResultStatus" NOT NULL DEFAULT 'ENTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meet_ownerId_idx" ON "Meet"("ownerId");

-- CreateIndex
CREATE INDEX "RaceEvent_meetId_idx" ON "RaceEvent"("meetId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetEntry_raceEventId_swimmerId_key" ON "MeetEntry"("raceEventId", "swimmerId");

-- CreateIndex
CREATE INDEX "MeetEntry_raceEventId_idx" ON "MeetEntry"("raceEventId");

-- AddForeignKey
ALTER TABLE "Meet" ADD CONSTRAINT "Meet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meet" ADD CONSTRAINT "Meet_hostPoolId_fkey" FOREIGN KEY ("hostPoolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceEvent" ADD CONSTRAINT "RaceEvent_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetEntry" ADD CONSTRAINT "MeetEntry_raceEventId_fkey" FOREIGN KEY ("raceEventId") REFERENCES "RaceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetEntry" ADD CONSTRAINT "MeetEntry_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

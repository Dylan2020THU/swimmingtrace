-- AlterTable
ALTER TABLE "User" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "claimTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_claimToken_key" ON "User"("claimToken");


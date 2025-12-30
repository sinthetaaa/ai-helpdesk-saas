/*
  Warnings:

  - A unique constraint covering the columns `[sourceId,idx]` on the table `KnowledgeChunk` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "KnowledgeChunk" ALTER COLUMN "embedding" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_sourceId_idx_key" ON "KnowledgeChunk"("sourceId", "idx");

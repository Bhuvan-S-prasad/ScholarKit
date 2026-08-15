-- CreateEnum
CREATE TYPE "PaperSource" AS ENUM ('arxiv', 'doi', 'pdf_upload', 'url');

-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('ingested', 'extracting', 'extracted', 'analyzed', 'archived');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('paper_note', 'literature_review', 'newsletter', 'digest');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "DeliveryTarget" AS ENUM ('telegram_dm', 'telegram_channel', 'telegram_group');

-- CreateEnum
CREATE TYPE "LitClassification" AS ENUM ('highly_relevant', 'relevant', 'background', 'irrelevant');

-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT[],
    "abstract" TEXT NOT NULL,
    "publishedDate" TEXT NOT NULL,
    "source" "PaperSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PaperStatus" NOT NULL DEFAULT 'ingested',
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperExtraction" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "methodology" JSONB NOT NULL,
    "keyFindings" TEXT[],
    "contributions" TEXT[],
    "limitations" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "extractionNotes" TEXT,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LitReviewProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "query" TEXT NOT NULL,
    "inclusionCriteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusionCriteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LitReviewProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LitReviewEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "classification" "LitClassification" NOT NULL,
    "reasonForScore" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LitReviewEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Newsletter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issueNumber" INTEGER,
    "contentType" "ContentType" NOT NULL DEFAULT 'newsletter',
    "status" "ReviewStatus" NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "target" "DeliveryTarget" NOT NULL DEFAULT 'telegram_channel',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Newsletter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSection" (
    "id" TEXT NOT NULL,
    "newsletterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "paperReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectionType" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL,
    "newsletterId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "telegramChatId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Paper_sourceId_key" ON "Paper"("sourceId");

-- CreateIndex
CREATE INDEX "Paper_source_sourceId_idx" ON "Paper"("source", "sourceId");

-- CreateIndex
CREATE INDEX "Paper_status_idx" ON "Paper"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaperExtraction_paperId_key" ON "PaperExtraction"("paperId");

-- CreateIndex
CREATE INDEX "LitReviewEntry_projectId_idx" ON "LitReviewEntry"("projectId");

-- CreateIndex
CREATE INDEX "LitReviewEntry_paperId_idx" ON "LitReviewEntry"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "LitReviewEntry_projectId_paperId_key" ON "LitReviewEntry"("projectId", "paperId");

-- CreateIndex
CREATE INDEX "Newsletter_status_idx" ON "Newsletter"("status");

-- CreateIndex
CREATE INDEX "NewsletterSection_newsletterId_order_idx" ON "NewsletterSection"("newsletterId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_telegramChatId_key" ON "Subscriber"("telegramChatId");

-- CreateIndex
CREATE INDEX "DeliveryLog_newsletterId_idx" ON "DeliveryLog"("newsletterId");

-- CreateIndex
CREATE INDEX "DeliveryLog_subscriberId_idx" ON "DeliveryLog"("subscriberId");

-- CreateIndex
CREATE INDEX "DeliveryLog_status_idx" ON "DeliveryLog"("status");

-- AddForeignKey
ALTER TABLE "PaperExtraction" ADD CONSTRAINT "PaperExtraction_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LitReviewEntry" ADD CONSTRAINT "LitReviewEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LitReviewProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LitReviewEntry" ADD CONSTRAINT "LitReviewEntry_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterSection" ADD CONSTRAINT "NewsletterSection_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "Newsletter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "Newsletter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

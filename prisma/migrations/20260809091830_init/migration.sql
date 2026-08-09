-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('NEOPHYTE', 'PREDTECHA', 'PROGRESSOR');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CanonKind" AS ENUM ('INDEX', 'DOGMA', 'FOUNDATION', 'COVENANT', 'ORDER', 'JOURNAL');

-- CreateEnum
CREATE TYPE "ThesisKind" AS ENUM ('BELIEF', 'QUOTE');

-- CreateEnum
CREATE TYPE "Shell" AS ENUM ('BODY', 'MIND', 'SPIRIT');

-- CreateEnum
CREATE TYPE "BlessingKind" AS ENUM ('SLEEP', 'WATER', 'FOOD', 'WARMTH', 'BODY');

-- CreateEnum
CREATE TYPE "GiftResource" AS ENUM ('TIME', 'INFO', 'MONEY', 'EFFORT', 'RESPECT', 'THING');

-- CreateEnum
CREATE TYPE "SilenceStage" AS ENUM ('PLOT', 'INSIGHT', 'BOREDOM');

-- CreateEnum
CREATE TYPE "FastKind" AS ENUM ('CLEANSING_DAY', 'REDEMPTION_MONTH');

-- CreateEnum
CREATE TYPE "FastStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LapseCause" AS ENUM ('THOUGHTS', 'EMOTIONS', 'SITUATION');

-- CreateEnum
CREATE TYPE "RitualKind" AS ENUM ('MORNING_BLESSING', 'WORD_OF_DAY', 'MIND_REMINDER', 'EVENING_DECLARATION', 'NIGHT_CLOSING', 'GIFT_WEEKLY', 'FAST_OFFER', 'FAST_JOURNAL', 'SCROLL_WEEKLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "langCode" TEXT,
    "rank" "Rank" NOT NULL DEFAULT 'NEOPHYTE',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "tz" TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    "oathAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "userId" TEXT NOT NULL,
    "morningAt" INTEGER NOT NULL DEFAULT 420,
    "mindAt" INTEGER NOT NULL DEFAULT 780,
    "eveningAt" INTEGER NOT NULL DEFAULT 1260,
    "nightAt" INTEGER NOT NULL DEFAULT 1350,
    "quietFrom" INTEGER NOT NULL DEFAULT 1380,
    "quietTo" INTEGER NOT NULL DEFAULT 390,
    "fastWeekdays" INTEGER[] DEFAULT ARRAY[1, 5]::INTEGER[],
    "intensity" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OathAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foundationNo" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OathAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonDoc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CanonKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonSection" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "bodyMd" TEXT NOT NULL,

    CONSTRAINT "CanonSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "kind" "ThesisKind" NOT NULL,
    "text" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3),

    CONSTRAINT "ThesisReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShellState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shell" "Shell" NOT NULL,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastActAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShellState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Act" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shell" "Shell" NOT NULL,
    "minutes" INTEGER,
    "note" TEXT,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blessing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blessing" "BlessingKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" "GiftResource" NOT NULL,
    "recipient" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Declaration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "reflection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Silence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "stage" "SilenceStage",
    "insights" TEXT,

    CONSTRAINT "Silence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FastKind" NOT NULL,
    "status" "FastStatus" NOT NULL DEFAULT 'PLANNED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "eatFrom" INTEGER NOT NULL DEFAULT 660,
    "eatTo" INTEGER NOT NULL DEFAULT 1140,
    "summary" TEXT,

    CONSTRAINT "FastPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastLog" (
    "id" TEXT NOT NULL,
    "fastId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "foodOk" BOOLEAN NOT NULL DEFAULT true,
    "infoOk" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "FastLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lapse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cause" "LapseCause" NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lapse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRollup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sila" DOUBLE PRECISION NOT NULL,
    "bol" DOUBLE PRECISION NOT NULL,
    "bodyLevel" DOUBLE PRECISION NOT NULL,
    "mindLevel" DOUBLE PRECISION NOT NULL,
    "spiritLevel" DOUBLE PRECISION NOT NULL,
    "acts" INTEGER NOT NULL DEFAULT 0,
    "blessings" INTEGER NOT NULL DEFAULT 0,
    "declarationDone" INTEGER NOT NULL DEFAULT 0,
    "declarationTotal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RitualKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_rank_idx" ON "User"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OathAcceptance_userId_foundationNo_key" ON "OathAcceptance"("userId", "foundationNo");

-- CreateIndex
CREATE UNIQUE INDEX "CanonDoc_slug_key" ON "CanonDoc"("slug");

-- CreateIndex
CREATE INDEX "CanonDoc_kind_order_idx" ON "CanonDoc"("kind", "order");

-- CreateIndex
CREATE INDEX "CanonSection_docId_order_idx" ON "CanonSection"("docId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CanonSection_docId_anchor_key" ON "CanonSection"("docId", "anchor");

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_fingerprint_key" ON "Thesis"("fingerprint");

-- CreateIndex
CREATE INDEX "Thesis_docId_idx" ON "Thesis"("docId");

-- CreateIndex
CREATE INDEX "ThesisReview_userId_dueAt_idx" ON "ThesisReview"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThesisReview_userId_thesisId_key" ON "ThesisReview"("userId", "thesisId");

-- CreateIndex
CREATE UNIQUE INDEX "ShellState_userId_shell_key" ON "ShellState"("userId", "shell");

-- CreateIndex
CREATE INDEX "Act_userId_doneAt_idx" ON "Act"("userId", "doneAt");

-- CreateIndex
CREATE INDEX "Blessing_userId_at_idx" ON "Blessing"("userId", "at");

-- CreateIndex
CREATE INDEX "Gift_userId_at_idx" ON "Gift"("userId", "at");

-- CreateIndex
CREATE INDEX "Declaration_userId_forDate_idx" ON "Declaration"("userId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "Declaration_userId_forDate_key" ON "Declaration"("userId", "forDate");

-- CreateIndex
CREATE INDEX "Silence_userId_startedAt_idx" ON "Silence"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "FastPeriod_userId_startAt_idx" ON "FastPeriod"("userId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "FastLog_fastId_date_key" ON "FastLog"("fastId", "date");

-- CreateIndex
CREATE INDEX "Lapse_userId_at_idx" ON "Lapse"("userId", "at");

-- CreateIndex
CREATE INDEX "DailyRollup_userId_date_idx" ON "DailyRollup"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRollup_userId_date_key" ON "DailyRollup"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_dedupeKey_key" ON "OutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxMessage_sentAt_scheduledFor_idx" ON "OutboxMessage"("sentAt", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OathAcceptance" ADD CONSTRAINT "OathAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonSection" ADD CONSTRAINT "CanonSection_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CanonDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CanonDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisReview" ADD CONSTRAINT "ThesisReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisReview" ADD CONSTRAINT "ThesisReview_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShellState" ADD CONSTRAINT "ShellState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Act" ADD CONSTRAINT "Act_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blessing" ADD CONSTRAINT "Blessing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Silence" ADD CONSTRAINT "Silence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastPeriod" ADD CONSTRAINT "FastPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastLog" ADD CONSTRAINT "FastLog_fastId_fkey" FOREIGN KEY ("fastId") REFERENCES "FastPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lapse" ADD CONSTRAINT "Lapse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRollup" ADD CONSTRAINT "DailyRollup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

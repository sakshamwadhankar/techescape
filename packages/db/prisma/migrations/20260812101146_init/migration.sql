-- CreateEnum
CREATE TYPE "Game" AS ENUM ('WORDLE', 'SHADOW', 'CARDS');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TIMEOUT', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('IDLE', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "accessCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberNames" TEXT[],
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "score" INTEGER NOT NULL DEFAULT 0,
    "timeMs" INTEGER,
    "result" JSONB,
    "finishKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 1,
    "status" "RoundStatus" NOT NULL DEFAULT 'IDLE',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "wordleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shadowEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cardsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wordleAnswer" TEXT,
    "cardsSeed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowQuestion" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_code_key" ON "Team"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Team_accessCode_key" ON "Team"("accessCode");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_finishKey_key" ON "GameSession"("finishKey");

-- CreateIndex
CREATE INDEX "GameSession_game_status_idx" ON "GameSession"("game", "status");

-- CreateIndex
CREATE INDEX "GameSession_status_idx" ON "GameSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_teamId_game_key" ON "GameSession"("teamId", "game");

-- CreateIndex
CREATE UNIQUE INDEX "GameAction_clientActionId_key" ON "GameAction"("clientActionId");

-- CreateIndex
CREATE INDEX "GameAction_sessionId_idx" ON "GameAction"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_number_key" ON "Round"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowQuestion_slug_key" ON "ShadowQuestion"("slug");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAction" ADD CONSTRAINT "GameAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('ONGOING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ThesisStatus" AS ENUM ('IN_PROGRESS', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PunishmentSeverity" AS ENUM ('UPOMNIENIE', 'NAGANA', 'ZAWIESZENIE', 'WYDALENIE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLAIMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('STUDENT', 'WYKLADOWCA', 'ADMINISTRACJA');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('TWITCH', 'YOUTUBE', 'INSTAGRAM', 'TWITTER', 'TIKTOK');

-- CreateEnum
CREATE TYPE "ButtonStyleOption" AS ENUM ('PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER');

-- CreateTable
CREATE TABLE "DiscordUser" (
    "id" TEXT NOT NULL,
    "robloxId" TEXT,
    "robloxUsername" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "aiCredits" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "aiCreditsResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleBinding" (
    "id" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "facultyId" TEXT,

    CONSTRAINT "RoleBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelBinding" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "ChannelBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "provider" TEXT NOT NULL DEFAULT 'huggingface',
    "apiKeyEncrypted" TEXT NOT NULL,
    "chatModel" TEXT NOT NULL DEFAULT 'meta-llama/Llama-3.1-8B-Instruct',
    "premiumChatModel" TEXT,
    "automodModel" TEXT NOT NULL DEFAULT 'unitary/toxic-bert',
    "automodThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "allowedChannelIds" TEXT[],
    "automodEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPricingTier" (
    "id" TEXT NOT NULL,
    "minChars" INTEGER NOT NULL,
    "maxChars" INTEGER,
    "creditCost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AiPricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "creditCost" DOUBLE PRECISION NOT NULL,
    "unlimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstNameIC" TEXT NOT NULL,
    "lastNameIC" TEXT NOT NULL,
    "birthDateIC" TIMESTAMP(3) NOT NULL,
    "genderIC" "Gender" NOT NULL,
    "pesel" TEXT NOT NULL,
    "yearOfStudy" INTEGER DEFAULT 1,
    "salaryIC" INTEGER NOT NULL DEFAULT 0,
    "facultyId" TEXT,
    "scientificTitle" TEXT,
    "albumNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "ectsPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Syllabus" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Syllabus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestion" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "resultsChannelId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'ONGOING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "activityPoints" INTEGER NOT NULL DEFAULT 0,
    "sessionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scholarship" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountIC" INTEGER NOT NULL,
    "gpaAtIssue" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scholarship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryResource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LibraryResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryLoan" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScientificCircle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "budgetIC" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScientificCircle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScientificCircleMember" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ScientificCircleMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisRegistration" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ThesisStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionalRetake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "feeIC" INTEGER NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionalRetake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Punishment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" "PunishmentSeverity" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Punishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "transcriptHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "answers" JSONB NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "twitchClientId" TEXT,
    "twitchClientSecretEncrypted" TEXT,
    "youtubeApiKeyEncrypted" TEXT,
    "instagramAccessTokenEncrypted" TEXT,
    "twitterBearerTokenEncrypted" TEXT,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMediaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaSubscription" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalHandle" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "lastSeenId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMediaSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRoleGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRoleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRoleOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "style" "ButtonStyleOption" NOT NULL DEFAULT 'SECONDARY',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReactionRoleOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordUser_robloxId_key" ON "DiscordUser"("robloxId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleBinding_discordRoleId_permissionKey_key" ON "RoleBinding"("discordRoleId", "permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelBinding_key_key" ON "ChannelBinding"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Character_userId_key" ON "Character"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_pesel_key" ON "Character"("pesel");

-- CreateIndex
CREATE UNIQUE INDEX "Character_albumNumber_key" ON "Character"("albumNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_name_key" ON "Faculty"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_facultyId_key" ON "Subject"("name", "facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "Syllabus_subjectId_key" ON "Syllabus"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAnswer_sessionId_userId_questionId_key" ON "ExamAnswer"("sessionId", "userId", "questionId");

-- CreateIndex
CREATE INDEX "AttendanceEntry_subjectId_studentId_idx" ON "AttendanceEntry"("subjectId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ScientificCircle_name_key" ON "ScientificCircle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScientificCircleMember_circleId_userId_key" ON "ScientificCircleMember"("circleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMediaSubscription_platform_externalHandle_discordChan_key" ON "SocialMediaSubscription"("platform", "externalHandle", "discordChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRoleGroup_key_key" ON "ReactionRoleGroup"("key");

-- AddForeignKey
ALTER TABLE "RoleBinding" ADD CONSTRAINT "RoleBinding_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DiscordUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DiscordUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Syllabus" ADD CONSTRAINT "Syllabus_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAnswer" ADD CONSTRAINT "ExamAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAnswer" ADD CONSTRAINT "ExamAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DiscordUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DiscordUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "LibraryResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScientificCircleMember" ADD CONSTRAINT "ScientificCircleMember_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "ScientificCircle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punishment" ADD CONSTRAINT "Punishment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DiscordUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "DiscordUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRoleOption" ADD CONSTRAINT "ReactionRoleOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ReactionRoleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

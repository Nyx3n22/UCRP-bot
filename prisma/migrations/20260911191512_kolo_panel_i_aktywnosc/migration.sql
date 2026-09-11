-- AlterTable: panel zarządzania kołem trzymany w bazie (jedna żywa wiadomość DM
-- na koło, edytowana w miejscu - patrz Kolo.panelMessageId w schema.prisma)
ALTER TABLE "Kolo" ADD COLUMN "panelMessageId" TEXT;

-- AlterTable: wymóg aktywności koła - znacznik ostatniej aktywności
ALTER TABLE "Kolo" ADD COLUMN "lastActivityAt" TIMESTAMP(3);

-- AlterTable: wymóg aktywności koła - kiedy wysłano ostrzeżenie (72h do auto-rozwiązania)
ALTER TABLE "Kolo" ADD COLUMN "inactivityWarnedAt" TIMESTAMP(3);

-- AlterTable: ile dni bez aktywności wytrzymuje aktywne koło (0 = wymóg wyłączony)
ALTER TABLE "GeneralConfig" ADD COLUMN "koloInactivityDays" INTEGER NOT NULL DEFAULT 30;

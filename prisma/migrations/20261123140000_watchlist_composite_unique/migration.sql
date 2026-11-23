-- DropIndex
DROP INDEX IF EXISTS "WatchlistItem_tmdbId_key";

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_tmdbId_mediaType_key" ON "WatchlistItem"("tmdbId", "mediaType");

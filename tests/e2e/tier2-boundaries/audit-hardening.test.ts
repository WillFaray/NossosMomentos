import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import {
    setupTestDb,
    resetTestDb,
    teardownTestDb,
    getTestPrisma,
    USER_1,
    USER_2,
    addSeriesProgress,
    addSeriesCheckin,
    deleteSeriesCheckin,
    addToWatchlist,
    removeFromWatchlist,
    addMovieReview,
    exportData,
    mergeData,
    updateUser
} from "../harness";
import { buildHistoryEntries, getTodayDateString } from "@/lib/utils";
import type { Movie, Review, User } from "@/types";

describe("Tier 2 - Audit Hardening & Edge Case Fixes", () => {
    beforeAll(async () => {
        await setupTestDb({ fromDevCopy: false });
    });

    beforeEach(async () => {
        await resetTestDb({ keepBaseUsers: true });
    });

    afterAll(async () => {
        await teardownTestDb();
    });

    test("T2-AUDIT-01: Deleting a series check-in recalculates currentEpisode accurately", async () => {
        const prisma = getTestPrisma();
        const sp = await addSeriesProgress({
            tmdbId: "95396",
            title: "Severance",
            posterPath: "/sev.jpg",
            genres: ["Drama"],
            seasonNumber: 1,
            seasonName: "1ª Temporada",
            totalEpisodes: 9,
            currentEpisode: 0
        });

        const c1 = await addSeriesCheckin({
            seriesProgressId: sp.id,
            dateWatched: "2026-11-10",
            episodeStart: 1,
            episodeEnd: 2
        });
        const c2 = await addSeriesCheckin({
            seriesProgressId: sp.id,
            dateWatched: "2026-11-11",
            episodeStart: 3,
            episodeEnd: 5
        });

        let current = await prisma.seriesProgress.findUnique({ where: { id: sp.id } });
        expect(current?.currentEpisode).toBe(5);

        // Undo the latest check-in -> should fall back to episode 2
        const res1 = await deleteSeriesCheckin(c2.id);
        expect(res1.success).toBe(true);
        expect(res1.currentEpisode).toBe(2);

        current = await prisma.seriesProgress.findUnique({ where: { id: sp.id } });
        expect(current?.currentEpisode).toBe(2);

        // Undo the first check-in -> should fall back to 0
        const res2 = await deleteSeriesCheckin(c1.id);
        expect(res2.currentEpisode).toBe(0);
    });

    test("T2-AUDIT-02: Movie and TV show sharing the same TMDB ID coexist in Watchlist without collision", async () => {
        const prisma = getTestPrisma();

        await addToWatchlist({
            tmdbId: "1396",
            title: "Filme com ID 1396",
            mediaType: "movie",
            genres: ["Drama"],
            addedById: USER_1.id
        });

        await addToWatchlist({
            tmdbId: "1396",
            title: "Breaking Bad",
            mediaType: "tv",
            genres: ["Drama", "Crime"],
            numberOfSeasons: 5,
            numberOfEpisodes: 62,
            addedById: USER_2.id
        });

        expect(await prisma.watchlistItem.count()).toBe(2);

        // Removing only the TV show leaves the movie untouched
        await removeFromWatchlist("1396", "tv");
        const remaining = await prisma.watchlistItem.findMany();
        expect(remaining.length).toBe(1);
        expect(remaining[0].mediaType).toBe("movie");
        expect(remaining[0].title).toBe("Filme com ID 1396");
    });

    test("T2-AUDIT-03: buildHistoryEntries distinguishes TV seasons (no false rewatch) and same-ID movie vs TV", () => {
        const users: User[] = [
            { id: USER_1.id, name: USER_1.name, avatar: USER_1.avatarUrl },
            { id: USER_2.id, name: USER_2.name, avatar: USER_2.avatarUrl }
        ];
        const movies: Movie[] = [
            { id: "1396", title: "Filme 1396", poster_path: "/m.jpg", release_date: "2020-01-01", genres: ["Drama"], mediaType: "movie" },
            { id: "1396", title: "Breaking Bad", poster_path: "/tv.jpg", release_date: "2008-01-20", genres: ["Crime"], mediaType: "tv" }
        ];
        const reviews: Review[] = [
            {
                id: "r1",
                movieId: "1396",
                mediaType: "tv",
                seasonNumber: 1,
                dateWatched: "2026-01-10",
                ratingUser1: 5,
                ratingUser2: 5,
                textReview: "T1 incrível",
                recommendedBy: USER_1.id
            },
            {
                id: "r2",
                movieId: "1396",
                mediaType: "tv",
                seasonNumber: 2,
                dateWatched: "2026-02-10",
                ratingUser1: 5,
                ratingUser2: 4.5,
                textReview: "T2 ótima",
                recommendedBy: USER_1.id
            },
            {
                id: "r3",
                movieId: "1396",
                mediaType: "movie",
                dateWatched: "2026-03-01",
                ratingUser1: 4,
                ratingUser2: 4,
                textReview: "Primeira sessão",
                recommendedBy: USER_2.id
            },
            {
                id: "r4",
                movieId: "1396",
                mediaType: "movie",
                dateWatched: "2026-04-01",
                ratingUser1: 4.5,
                ratingUser2: 4,
                textReview: "Rewatch do filme",
                recommendedBy: USER_2.id
            }
        ];

        const entries = buildHistoryEntries(reviews, movies, users);
        const byId = new Map(entries.map((e) => [e.review.id, e]));

        expect(byId.get("r1")?.movie.title).toBe("Breaking Bad");
        expect(byId.get("r1")?.isRewatch).toBe(false);
        expect(byId.get("r2")?.movie.title).toBe("Breaking Bad");
        expect(byId.get("r2")?.isRewatch).toBe(false); // Season 2 is NOT a rewatch of Season 1
        expect(byId.get("r3")?.movie.title).toBe("Filme 1396");
        expect(byId.get("r3")?.isRewatch).toBe(false);
        expect(byId.get("r4")?.movie.title).toBe("Filme 1396");
        expect(byId.get("r4")?.isRewatch).toBe(true); // Second viewing of same movie IS a rewatch
        expect(byId.get("r4")?.sessionNumber).toBe(2);
    });

    test("T2-AUDIT-04: mergeData handles Primary Key (id) collision gracefully without failing", async () => {
        const prisma = getTestPrisma();
        const created = await addMovieReview({
            tmdbId: "27205",
            title: "A Origem",
            posterPath: "/inception.jpg",
            dateWatched: "2026-10-01",
            ratingUser1: 5,
            ratingUser2: 4.5,
            textReview: "Sensacional",
            genres: ["Ficção Científica"],
            recommendedById: USER_1.id,
            mediaType: "movie"
        });

        // Export snapshot, then mutate dateWatched in backup while keeping the SAME primary key id
        const snapshot = await exportData();
        const editedSnapshot = {
            ...snapshot,
            reviews: snapshot.reviews.map((r) =>
                r.id === created.id ? { ...r, dateWatched: "2026-10-15" } : r
            )
        };

        const merged = await mergeData(editedSnapshot);
        expect(merged.addedReviews).toBe(1);

        const allReviews = await prisma.movieReview.findMany({ where: { tmdbId: "27205" } });
        expect(allReviews.length).toBe(2);
    });

    test("T2-AUDIT-05: updateUser validates name and rejects unsafe avatar URLs", async () => {
        await expect(
            updateUser({ id: USER_1.id, name: "   ", avatarUrl: "" })
        ).rejects.toThrow();

        await expect(
            updateUser({
                id: USER_1.id,
                name: "William",
                avatarUrl: "javascript:alert(1)"
            })
        ).rejects.toThrow();

        const ok = await updateUser({
            id: USER_1.id,
            name: "William",
            avatarUrl: "https://ui-avatars.com/api/?name=William"
        });
        expect(ok.name).toBe("William");
    });

    test("T2-AUDIT-06: getTodayDateString uses local calendar components", () => {
        const lateEveningLocal = new Date(2026, 10, 23, 23, 30, 0); // 2026-11-23 23:30 local
        expect(getTodayDateString(lateEveningLocal)).toBe("2026-11-23");
    });
});

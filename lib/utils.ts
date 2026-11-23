import type { HistoryEntry, Movie, Review, User } from "@/types";

/**
 * Retorna a data local no formato YYYY-MM-DD (evita deslocamento para o dia seguinte
 * causado por toISOString() em fusos horários negativos como o do Brasil à noite).
 */
export function getTodayDateString(baseDate: Date = new Date()): string {
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, "0");
    const day = String(baseDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Chave composta canônica para distinguir filmes e séries que compartilhem
 * o mesmo ID numérico no TMDB (já que Movie e TV possuem namespaces separados).
 */
export function getMediaKey(tmdbId: string, mediaType?: string | null): string {
    return `${mediaType === "tv" ? "tv" : "movie"}:${tmdbId}`;
}

/**
 * Constrói a lista unificada de HistoryEntry a partir de reviews, movies e users.
 * Calcula corretamente re-watches sem confundir temporadas diferentes (S01 vs S02)
 * nem colidir filmes e séries com o mesmo tmdbId.
 */
export function buildHistoryEntries(
    reviews: Review[],
    movies: Movie[],
    users: User[]
): HistoryEntry[] {
    if (users.length === 0) return [];

    const fallbackUser = users[0];
    const movieMap = new Map<string, Movie>();
    const movieFallbackMap = new Map<string, Movie>();
    for (const m of movies) {
        movieMap.set(getMediaKey(m.id, m.mediaType), m);
        if (!movieFallbackMap.has(m.id)) {
            movieFallbackMap.set(m.id, m);
        }
    }
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Agrupa sessões por chave de re-watch:
    // - Filmes: por movie:<tmdbId>
    // - Séries: por tv:<tmdbId>:s<seasonNumber|all> (S01 e S02 não são re-watch entre si)
    const sessionGroupKey = (r: Review): string => {
        if (r.mediaType === "tv") {
            return `tv:${r.movieId}:s${r.seasonNumber ?? "all"}`;
        }
        return `movie:${r.movieId}`;
    };

    const reviewsByGroup = new Map<string, Review[]>();
    for (const r of reviews) {
        const key = sessionGroupKey(r);
        const list = reviewsByGroup.get(key) ?? [];
        list.push(r);
        reviewsByGroup.set(key, list);
    }
    for (const list of reviewsByGroup.values()) {
        list.sort(
            (a, b) => a.dateWatched.localeCompare(b.dateWatched) || a.id.localeCompare(b.id)
        );
    }

    return [...reviews]
        .sort((a, b) => b.dateWatched.localeCompare(a.dateWatched))
        .map((review) => {
            const movie =
                movieMap.get(getMediaKey(review.movieId, review.mediaType)) ??
                movieFallbackMap.get(review.movieId);
            if (!movie) return null;

            const recommender = userMap.get(review.recommendedBy) ?? fallbackUser;
            const groupHistory = reviewsByGroup.get(sessionGroupKey(review)) ?? [review];
            const sessionIndex = groupHistory.findIndex((r) => r.id === review.id);
            const sessionNumber = sessionIndex >= 0 ? sessionIndex + 1 : 1;
            const totalSessions = groupHistory.length;
            const isRewatch = sessionNumber > 1;

            return {
                review,
                movie,
                recommender,
                sessionNumber,
                totalSessions,
                isRewatch
            };
        })
        .filter((entry): entry is HistoryEntry => Boolean(entry));
}

/**
 * Formata uma data ISO para o formato brasileiro (dd/mm/aaaa).
 * Retorna string vazia caso a data seja nula, vazia ou inválida.
 */
export function formatDate(dateStr?: string | null): string {
    if (!dateStr) return "";
    // Quando a data é apenas "YYYY-MM-DD", o new Date() interpreta como UTC
    // e a conversão para o fuso local pode deslocar o dia (ex: UTC-4 → véspera).
    // Para evitar isso, montamos a data localmente a partir dos componentes.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    const date = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(dateStr);

    if (isNaN(date.getTime())) return "";

    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

/**
 * Retorna a URL completa do poster a partir do poster_path
 */
export function getPosterUrl(
    posterPath: string,
    size: "w342" | "w500" | "original" = "w500"
): string {
    if (/^https?:\/\//i.test(posterPath)) {
        return posterPath;
    }
    const normalized = posterPath.startsWith("/") ? posterPath : `/${posterPath}`;
    return `https://image.tmdb.org/t/p/${size}${normalized}`;
}

/**
 * Retorna as iniciais de um nome para fallback do avatar
 */
export function getInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

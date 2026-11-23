"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "light",
    toggleTheme: () => { }
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("light");
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("theme");
        const systemPrefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const initial: Theme =
            stored === "dark" || stored === "light"
                ? stored
                : systemPrefers
                ? "dark"
                : "light";
        setTheme(initial);
        document.documentElement.classList.toggle("dark", initial === "dark");
        setInitialized(true);
    }, []);

    useEffect(() => {
        if (!initialized) return;
        document.documentElement.classList.toggle("dark", theme === "dark");
        localStorage.setItem("theme", theme);
    }, [theme, initialized]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === "light" ? "dark" : "light"));
    }, []);

    const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

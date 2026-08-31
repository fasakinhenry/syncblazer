import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ThemePreference = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemePreference;
  effectiveTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
}

const THEME_KEY = "syncblaze.theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(
    () => (localStorage.getItem(THEME_KEY) as ThemePreference | null) ?? "system"
  );
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(getSystemTheme());
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const effectiveTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", effectiveTheme === "dark");
  }, [effectiveTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      effectiveTheme,
      setTheme: (next) => {
        localStorage.setItem(THEME_KEY, next);
        setTheme(next);
      },
    }),
    [theme, effectiveTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "bettracker-theme";

const ThemeContext = createContext({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function getInitialTheme() {
  if (typeof document === "undefined") return "dark";
  const fromDom = document.documentElement.getAttribute("data-theme");
  if (fromDom === "dark" || fromDom === "light") return fromDom;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const setTheme = (next) => {
    const value = next === "dark" || next === "light" ? next : "dark";
    setThemeState(value);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", value);
      localStorage.setItem(STORAGE_KEY, value);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

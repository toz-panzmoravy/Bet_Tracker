"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastProvider } from "./components/Toast";
import { ClipboardPromptButton } from "./components/ClipboardPromptButton";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import "./globals.css";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/live", label: "LIVE", icon: "🔴" },
  { href: "/tikety", label: "Tikety", icon: "🎫" },
  { href: "/import", label: "Import", icon: "📸" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/ai-analyza", label: "AI analýza", icon: "🤖" },
  { href: "/market-types", label: "Typy sázek", icon: "🏷️" },
  { href: "/nastaveni", label: "Nastavení", icon: "⚙️" },
];

function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-switcher"
      title={theme === "dark" ? "Světlý motiv" : "Tmavý motiv"}
      aria-label={theme === "dark" ? "Přepnout na světlý motiv" : "Přepnout na tmavý motiv"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="app-sidebar" role="navigation" aria-label="Hlavní menu">
      <div className="sidebar-logo">
        <div role="banner" className="sidebar-logo-text">
          🎯 BetTracker
        </div>
        <p className="sidebar-label">Osobní sázkový tracker</p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Stránky">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "active" : ""}`}
              title={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span aria-hidden>{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ThemeSwitcher />
          <span className="sidebar-label">v1.0.0 • Lokální</span>
        </div>
      </div>
    </aside>
  );
}

function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var t=localStorage.getItem("bettracker-theme");if(!t&&typeof window.matchMedia!="undefined"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t)document.documentElement.setAttribute("data-theme",t)})();`,
      }}
    />
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="cs" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <title>BetTracker – Osobní sázkový tracker</title>
        <meta name="description" content="Osobní systém pro sledování sportovních sázek s AI analýzou" />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <Sidebar />
            <main className="app-main">
              {children}
            </main>
            <ClipboardPromptButton />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

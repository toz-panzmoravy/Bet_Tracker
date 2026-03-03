"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastProvider } from "./components/Toast";
import "./globals.css";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/live", label: "LIVE", icon: "🔴" },
  { href: "/tikety", label: "Tikety", icon: "🎫" },
  { href: "/import", label: "Import", icon: "📸" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/market-types", label: "Typy sázek", icon: "🏷️" },
  { href: "/nastaveni", label: "Nastavení", icon: "⚙️" },
];

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="app-sidebar"
      style={{
        width: 240,
        minHeight: "100vh",
        background: "var(--color-bg-secondary)",
        borderRight: "1px solid var(--color-border)",
        padding: "1.5rem 1rem",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 30,
      }}
    >
      {/* Logo */}
      <div className="sidebar-logo" style={{ padding: "0 0.5rem", marginBottom: "2rem" }}>
        <div
          role="banner"
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            background: "linear-gradient(135deg, #6366f1, #a78bfa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          🎯 BetTracker
        </div>
        <p className="sidebar-label" style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginTop: 4 }}>
          Osobní sázkový tracker
        </p>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "active" : ""}`}
              title={item.label}
            >
              <span>{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer" style={{ marginTop: "auto", padding: "0.5rem", fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
        <span className="sidebar-label">v1.0.0 • Lokální režim</span>
      </div>
    </aside>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <head>
        <title>BetTracker – Osobní sázkový tracker</title>
        <meta name="description" content="Osobní systém pro sledování sportovních sázek s AI analýzou" />
      </head>
      <body>
        <ToastProvider>
          <Sidebar />
          <main className="app-main" style={{ marginLeft: 240, minHeight: "100vh", padding: "2rem" }}>
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}


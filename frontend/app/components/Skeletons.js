"use client";

export function DashboardSkeleton() {
    return (
        <div>
            {/* KPI Skeleton */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "1rem" }}>
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="glass-card skeleton-card" style={{ padding: "1.25rem", height: 100 }}>
                        <div className="skeleton-line" style={{ width: "60%", height: 12, marginBottom: 12 }} />
                        <div className="skeleton-line" style={{ width: "40%", height: 28 }} />
                    </div>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "1.5rem" }}>
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="glass-card skeleton-card" style={{ padding: "1.25rem", height: 100 }}>
                        <div className="skeleton-line" style={{ width: "50%", height: 12, marginBottom: 12 }} />
                        <div className="skeleton-line" style={{ width: "35%", height: 28 }} />
                    </div>
                ))}
            </div>

            {/* Tab bar skeleton */}
            <div style={{ display: "flex", gap: 4, background: "var(--color-bg-secondary)", borderRadius: 12, padding: 4, marginBottom: "1.25rem" }}>
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton-line" style={{ flex: 1, height: 40, borderRadius: 10 }} />
                ))}
            </div>

            {/* Charts skeleton */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="glass-card" style={{ padding: "1.25rem" }}>
                        <div className="skeleton-line" style={{ width: "40%", height: 14, marginBottom: 20 }} />
                        <div className="skeleton-line" style={{ width: "100%", height: 250, borderRadius: 8 }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function TicketsSkeleton() {
    return (
        <div>
            {/* Header skeleton */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                <div>
                    <div className="skeleton-line" style={{ width: 140, height: 24, marginBottom: 8 }} />
                    <div className="skeleton-line" style={{ width: 200, height: 12 }} />
                </div>
            </div>

            {/* Table skeleton */}
            <div className="glass-card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="skeleton-line" style={{ flex: 1, height: 14 }} />
                    ))}
                </div>
                {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, opacity: 1 - i * 0.15 }}>
                        {[...Array(6)].map((_, j) => (
                            <div key={j} className="skeleton-line" style={{ flex: 1, height: 36, borderRadius: 6 }} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

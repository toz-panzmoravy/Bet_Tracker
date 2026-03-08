"use client";

export default function MarketTypeKPIs({ marketTypes }) {
    const totalCount = marketTypes.length;

    const mostPopular = [...marketTypes].sort((a, b) => b.bets_count - a.bets_count)[0];
    const mostProfitable = [...marketTypes].sort((a, b) => b.profit - a.profit)[0];

    // Filter for top win rate (at least 3 bets to be meaningful)
    const topWinRate = [...marketTypes]
        .filter(mt => mt.bets_count >= 3)
        .sort((a, b) => b.win_rate - a.win_rate)[0];

    const stats = [
        {
            label: "Celkem typů",
            value: totalCount,
            icon: "📊",
            color: "blue"
        },
        {
            label: "Nejčastější",
            value: mostPopular?.bets_count > 0 ? mostPopular.name : "—",
            subValue: mostPopular?.bets_count > 0 ? `${mostPopular.bets_count} sázek` : null,
            icon: "🔥",
            color: "yellow"
        },
        {
            label: "Nejziskovější",
            value: mostProfitable?.profit > 0 ? mostProfitable.name : "—",
            subValue: mostProfitable?.profit > 0 ? `+${mostProfitable.profit.toLocaleString()} CZK` : null,
            icon: "💰",
            color: "green"
        },
        {
            label: "Top Úspěšnost",
            value: topWinRate ? topWinRate.name : "—",
            subValue: topWinRate ? `${topWinRate.win_rate}%` : "min. 3 sázky",
            icon: "🎯",
            color: "accent"
        }
    ];

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem", marginBottom: "2rem" }}>
            {stats.map((stat, i) => (
                <div key={i} className={`kpi-card ${stat.color}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                {stat.label}
                            </p>
                            <h3 className="section-title" style={{ margin: "8px 0 4px 0", fontSize: "1.25rem" }}>{stat.value}</h3>
                            {stat.subValue && (
                                <p style={{ margin: 0, fontSize: "0.85rem", color: stat.color === 'green' ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500 }}>
                                    {stat.subValue}
                                </p>
                            )}
                        </div>
                        <span style={{ fontSize: "1.5rem" }}>{stat.icon}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

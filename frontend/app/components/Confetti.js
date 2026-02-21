"use client";
import { useEffect, useState } from "react";

const COLORS = ["#6366f1", "#22c55e", "#eab308", "#ef4444", "#3b82f6", "#a78bfa", "#f97316", "#ec4899"];
const PARTICLE_COUNT = 60;

function randomBetween(a, b) {
    return a + Math.random() * (b - a);
}

export default function Confetti({ active, onDone }) {
    const [particles, setParticles] = useState([]);

    useEffect(() => {
        if (!active) return;

        const p = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
            id: i,
            x: randomBetween(20, 80),
            y: -10,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            size: randomBetween(6, 12),
            rotation: randomBetween(0, 360),
            velocityX: randomBetween(-3, 3),
            velocityY: randomBetween(2, 6),
            rotationSpeed: randomBetween(-10, 10),
            delay: randomBetween(0, 0.5),
            shape: Math.random() > 0.5 ? "circle" : "rect",
        }));
        setParticles(p);

        const timer = setTimeout(() => {
            setParticles([]);
            onDone?.();
        }, 3000);

        return () => clearTimeout(timer);
    }, [active]);

    if (!particles.length) return null;

    return (
        <div style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            pointerEvents: "none", zIndex: 99999, overflow: "hidden",
        }}>
            {particles.map((p) => (
                <div
                    key={p.id}
                    style={{
                        position: "absolute",
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.shape === "rect" ? p.size * 0.6 : p.size,
                        borderRadius: p.shape === "circle" ? "50%" : 2,
                        background: p.color,
                        animation: `confetti-fall ${randomBetween(2, 3)}s ease-in ${p.delay}s forwards`,
                        transform: `rotate(${p.rotation}deg)`,
                    }}
                />
            ))}
        </div>
    );
}

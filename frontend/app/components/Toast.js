"use client";
import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = "success", duration = 3000) => {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, message, type, leaving: false }]);
        setTimeout(() => {
            setToasts((prev) =>
                prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
            );
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 300);
        }, duration);
    }, []);

    const success = useCallback((msg) => addToast(msg, "success"), [addToast]);
    const error = useCallback((msg) => addToast(msg, "error", 5000), [addToast]);
    const info = useCallback((msg) => addToast(msg, "info"), [addToast]);

    return (
        <ToastContext.Provider value={{ success, error, info }}>
            {children}
            <div style={{
                position: "fixed", bottom: 24, right: 24, zIndex: 9999,
                display: "flex", flexDirection: "column-reverse", gap: 8,
                pointerEvents: "none",
            }}>
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        style={{
                            padding: "12px 20px",
                            borderRadius: 12,
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: "#fff",
                            pointerEvents: "auto",
                            animation: t.leaving ? "toast-out 0.3s ease forwards" : "toast-in 0.3s ease",
                            background:
                                t.type === "success" ? "linear-gradient(135deg, #22c55e, #16a34a)" :
                                    t.type === "error" ? "linear-gradient(135deg, #ef4444, #dc2626)" :
                                        "linear-gradient(135deg, #6366f1, #4f46e5)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            maxWidth: 360,
                        }}
                    >
                        <span style={{ fontSize: "1.1rem" }}>
                            {t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"}
                        </span>
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be inside ToastProvider");
    return ctx;
}

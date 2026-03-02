"use client";

import { useEffect } from "react";

export default function ConfirmModal({
  open,
  title = "Potvrdit",
  message = "Opravdu chcete pokračovat?",
  confirmLabel = "Potvrdit",
  cancelLabel = "Zrušit",
  variant = "danger",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400 }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>
          {title}
        </h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", marginBottom: 20 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={isDanger ? "btn" : "btn btn-primary"}
            style={
              isDanger
                ? {
                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                    color: "#fff",
                    border: "none",
                  }
                : {}
            }
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

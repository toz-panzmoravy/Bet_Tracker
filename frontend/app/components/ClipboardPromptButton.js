"use client";

import { useCallback } from "react";
import { useToast } from "./Toast";
import { CLIPBOARD_PROMPT } from "../config/clipboard-prompt";

export function ClipboardPromptButton() {
  const { success, error } = useToast();

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CLIPBOARD_PROMPT);
      success("Prompt zkopírován do schránky");
    } catch (e) {
      error("Kopírování do schránky selhalo");
    }
  }, [success, error]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="clipboard-prompt-fab"
      title="Zkopírovat CIO prompt do schránky"
      aria-label="Zkopírovat CIO prompt do schránky"
    >
      <span className="clipboard-prompt-fab-icon" aria-hidden>📋</span>
    </button>
  );
}

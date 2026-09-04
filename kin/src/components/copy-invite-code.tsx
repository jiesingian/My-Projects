"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function CopyInviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ font: "400 24px/1 var(--font-numeric)", letterSpacing: ".02em" }}>{code}</span>
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        style={{ marginLeft: "auto" }}
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy invite code"
      >
        <Icon name={copied ? "check" : "copy"} size={16} />
      </button>
    </div>
  );
}

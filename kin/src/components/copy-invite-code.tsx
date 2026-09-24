"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** The household's invite code, with the two ways to pass it on: copy the
 * code, or share a link that opens straight into joining (app/join). The
 * link is what most relatives should get -- nobody has to type anything. */
export function CopyInviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const flash = (what: "code" | "link") => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const link = () => `${window.location.origin}/join/${code.replace(/[^A-Za-z0-9]/g, "")}`;

  const share = async () => {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join our family on Kin", text: "Tap to join our household on Kin:", url });
        return;
      } catch {
        // Cancelled, or the share sheet refused: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("link");
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <span style={{ font: "400 1.5rem/1 var(--font-numeric)", letterSpacing: ".02em" }}>{code}</span>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          style={{ marginLeft: "auto" }}
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            flash("code");
          }}
          aria-label="Copy invite code"
        >
          <Icon name={copied === "code" ? "check" : "copy"} size={16} />
        </button>
      </div>
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: "2.5rem", gap: "0.375rem" }} onClick={share}>
        <Icon name={copied === "link" ? "check" : "users"} size={16} />
        {copied === "link" ? "Link copied" : "Share an invite link"}
      </button>
    </div>
  );
}

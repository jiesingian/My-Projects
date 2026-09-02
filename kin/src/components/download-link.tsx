"use client";

import { useState } from "react";
import { getDocFileUrl } from "@/lib/actions/documents";
import { Icon } from "@/components/icons";

export function DownloadLink({ path, fileName }: { path: string; fileName: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ fontSize: 12, justifyContent: "flex-start", gap: 8 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const url = await getDocFileUrl(path);
        setLoading(false);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      <Icon name="download" size={14} />
      {loading ? "Preparing…" : fileName}
    </button>
  );
}

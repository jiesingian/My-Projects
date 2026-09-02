"use client";

import { useState } from "react";
import { getDocFileUrl } from "@/lib/actions/documents";
import { Icon } from "@/components/icons";

export function DownloadLink({
  path,
  fileName,
  driveViewLink,
}: {
  path: string | null;
  fileName: string;
  driveViewLink?: string | null;
}) {
  const [loading, setLoading] = useState(false);

  if (driveViewLink) {
    return (
      <a
        href={driveViewLink}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary"
        style={{ fontSize: 12, justifyContent: "flex-start", gap: 8 }}
      >
        <Icon name="hardDrive" size={14} />
        {fileName}
      </a>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ fontSize: 12, justifyContent: "flex-start", gap: 8 }}
      disabled={loading || !path}
      onClick={async () => {
        if (!path) return;
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

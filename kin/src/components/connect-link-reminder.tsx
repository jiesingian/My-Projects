"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissConnectLinkAction } from "@/lib/actions/connections";

/** After someone joins Kin through a connection link (app/connect), the one
 * thing left to do is ask -- this keeps that in view until they do, or say
 * not now. */
export function ConnectLinkReminder({ code }: { code: string }) {
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  if (hidden) return null;
  return (
    <div className="kin-connect-reminder" role="status">
      <span>You opened a link to connect with someone on Kin.</span>
      <Link href={`/family/connections?code=${code}`} className="btn btn-primary">
        Finish connecting
      </Link>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setHidden(true);
          startTransition(() => dismissConnectLinkAction());
        }}
      >
        Not now
      </button>
    </div>
  );
}

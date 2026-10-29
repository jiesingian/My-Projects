"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { confirm } from "@/components/confirm-sheet";
import { noClassesTodayAction } from "@/lib/actions/routines";

export function NoClassesButton({ names }: { names: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.84375rem", margin: "0 0 0.625rem" }}>
      <Icon name="fileText" size={16} style={{ color: "var(--cal-schedule-ink)" }} />
      <span style={{ flex: 1, minWidth: 0 }}>School today: {names}</span>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}
        disabled={pending}
        onClick={async () => {
          if (!(await confirm({ title: "No classes today?", description: "Today's class days and pickups are skipped for everyone.", confirmLabel: "No classes" }))) return;
          start(async () => {
            const r = await noClassesTodayAction();
            if (r.error) toast.error(r.error);
            else {
              toast.success(r.skipped ? "Today's classes and pickups are off." : "Nothing left to skip today.");
              router.refresh();
            }
          });
        }}
      >
        No classes today
      </button>
    </p>
  );
}

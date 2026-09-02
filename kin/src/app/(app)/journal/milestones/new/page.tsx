"use client";

import { useActionState } from "react";
import { createMilestoneAction } from "@/lib/actions/journal";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import { useRouter } from "next/navigation";

const initialState: ActionState = { error: null };

export default function NewMilestonePage() {
  const router = useRouter();
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const res = await createMilestoneAction(prev, formData);
    if (!res.error) router.push("/journal?seg=milestones");
    return res;
  }, initialState);

  return (
    <div>
      <DetailHeader backHref="/journal?seg=milestones" eyebrow="HUB 02 · MILESTONE" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Add a milestone</h3>
        <form action={formAction}>
          <ErrorText message={state.error} />
          <div className="field" style={{ marginBottom: 14 }}>
            <label>TITLE</label>
            <input className="input" name="title" required style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>DATE</label>
            <input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required style={{ minHeight: 44 }} />
          </div>
          <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE MILESTONE</SubmitButton>
        </form>
      </div>
    </div>
  );
}

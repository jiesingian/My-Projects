"use client";

import { useActionState, useRef } from "react";
import { uploadGalleryPhotosAction } from "@/lib/actions/journal";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function GalleryUpload() {
  const [state, formAction] = useActionState(uploadGalleryPhotosAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}
    >
      <input type="file" name="files" multiple accept="image/*,video/*" style={{ flex: 1, fontSize: 12 }} />
      <SubmitButton className="btn btn-primary" style={{ minHeight: 40, fontSize: 12 }}>
        UPLOAD
      </SubmitButton>
      <ErrorText message={state.error} />
    </form>
  );
}

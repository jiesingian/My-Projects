"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { PhotoStrip } from "@/components/photo-strip";
import { addVisitPhotoAction, deleteVisitPhotoAction, saveVisitNotesAction } from "@/lib/actions/health-care";

/** A doctor's visit: what was said, and photos of the prescription, the
 * results, the doctor's note (26 September). The photos go from the phone
 * straight to Storage under this household's own folder, which the bucket's
 * policies confine to the household. */

export function VisitNotes({ appointmentId, memberId, initial }: { appointmentId: string; memberId: string; initial: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = notes !== initial;
  return (
    <form
      className="kin-care-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const { error } = await saveVisitNotesAction(appointmentId, memberId, notes);
          if (error) toast.error(error);
          else {
            toast.success("Notes saved");
            router.refresh();
          }
        });
      }}
    >
      <textarea
        className="input"
        rows={6}
        maxLength={4000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What the doctor said: the diagnosis, what to give and for how long, when to come back."
        aria-label="Visit notes"
        style={{ minHeight: "8rem", resize: "vertical" }}
      />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending || !dirty}>
        {pending ? "Saving…" : dirty ? "Save notes" : "Saved"}
      </button>
    </form>
  );
}

/** A visit's photos: the shared strip, pointed at the visit's folder. */
export function VisitPhotos({ familyId, appointmentId, memberId, photos }: { familyId: string; appointmentId: string; memberId: string; photos: { id: string; url: string }[] }) {
  return (
    <PhotoStrip
      folder={`${familyId}/health/${appointmentId}`}
      photos={photos}
      label="Visit photo"
      onAdd={(path) => addVisitPhotoAction(appointmentId, memberId, path)}
      onDelete={(id) => deleteVisitPhotoAction(id, appointmentId, memberId)}
    />
  );
}

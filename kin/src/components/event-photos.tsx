"use client";

import { PhotoStrip } from "@/components/photo-strip";
import { addEventPhotoAction, deleteEventPhotoAction } from "@/lib/actions/planner-photos";

/** An event's photos on its own screen: the shared strip, pointed at the
 * event's folder. */
export function EventPhotos({ familyId, eventId, photos }: { familyId: string; eventId: string; photos: { id: string; url: string }[] }) {
  return (
    <PhotoStrip
      folder={`${familyId}/events/${eventId}`}
      photos={photos}
      label="Event photo"
      onAdd={(path) => addEventPhotoAction(eventId, path)}
      onDelete={(id) => deleteEventPhotoAction(id)}
    />
  );
}

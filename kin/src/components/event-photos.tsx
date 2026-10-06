"use client";

import { PhotoStrip } from "@/components/photo-strip";
import { addEventPhotoAction, deleteEventPhotoAction } from "@/lib/actions/planner-photos";

/** An event's photos on its own screen: the shared strip, pointed at the
 * event. */
export function EventPhotos({ eventId, photos }: { eventId: string; photos: { id: string; url: string }[] }) {
  return (
    <PhotoStrip
      kind="event_photo"
      ownerId={eventId}
      photos={photos}
      label="Event photo"
      onAdd={(path) => addEventPhotoAction(eventId, path)}
      onDelete={(id) => deleteEventPhotoAction(id)}
    />
  );
}

"use client";

import { PhotoAlbumViewer } from "@/components/photo-album-viewer";
import { setActiveAvatarAction, deleteAvatarFromAlbumAction, type AlbumPhoto } from "@/lib/actions/profile";

export function AvatarAlbumViewer({ photos, activeUrl, onClose }: { photos: AlbumPhoto[]; activeUrl: string | null; onClose: () => void }) {
  return (
    <PhotoAlbumViewer
      photos={photos}
      activeUrl={activeUrl}
      onClose={onClose}
      onSetActive={setActiveAvatarAction}
      onDelete={deleteAvatarFromAlbumAction}
      shape="circle"
      emptyMessage="No photos yet — click EDIT PROFILE to add your first one."
    />
  );
}

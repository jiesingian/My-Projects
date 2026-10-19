"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { uploadFileDirect } from "@/lib/upload-client";
import { recordingIsSilent, rememberTranscriptConflict, startTranscript } from "@/lib/voice-note";
import { deleteTreeStoryAction, saveTreeStoryAction, type NewStoryFile } from "@/lib/actions/tree-stories";
import type { LinkedStory, TreeStory } from "@/lib/queries/tree-stories";
import {
  formatStoryWhen,
  linkedStoryFoot,
  parseStoryWhen,
  storyShareHint,
  storyWhenInput,
  tellerLabel,
  STORY_BODY_MAX,
  STORY_FILE_TYPES,
  STORY_FILES_MAX,
  STORY_RECORDING_MAX_SECONDS,
  STORY_TELLER_MAX,
  STORY_TITLE_MAX,
  STORY_TRANSCRIPT_MAX,
} from "@/lib/tree-stories";

type Member = { id: string; fullName: string };

/** Stories about one person on the tree: what the household has kept, and
 * a way to add one -- recorded, written, or both, with old photos and
 * scanned papers beside it. See 20261014204000_tree_person_stories. */
export function TreeStories({
  personId,
  firstName,
  stories,
  linkedStories,
  sharedWith,
  members,
  meId,
  canAdd,
  grownUp,
  prompt,
  today,
}: {
  personId: string;
  firstName: string;
  stories: TreeStory[];
  /** Shared by linked households about the same person: read only. */
  linkedStories: LinkedStory[];
  /** The linked households that have this person on their tree. */
  sharedWith: string[];
  members: Member[];
  meId: string;
  /** A grown-up, or a teen with a login who is not in kid view. */
  canAdd: boolean;
  grownUp: boolean;
  /** This week's journal question, offered as a title. */
  prompt: string;
  /** The household's own day, for checking a story's date. */
  today: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="kin-stories">
      {canAdd &&
        (adding ? (
          <StoryForm
            personId={personId}
            firstName={firstName}
            members={members}
            sharedWith={sharedWith}
            prompt={prompt}
            today={today}
            onDone={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
            <Icon name="plus" size="1rem" /> Add a story about {firstName}
          </button>
        ))}

      {stories.length === 0 && linkedStories.length === 0 ? (
        <p className="kin-stories-empty">
          No stories about {firstName} yet. Ask someone who knew them, and record them telling it: how they met, where they lived, what they
          used to cook.
        </p>
      ) : (
        stories.map((s) =>
          editing === s.id ? (
            <StoryForm
              key={s.id}
              personId={personId}
              firstName={firstName}
              members={members}
              sharedWith={sharedWith}
              prompt={prompt}
              today={today}
              story={s}
              onDone={() => setEditing(null)}
            />
          ) : (
            <StoryCard
              key={s.id}
              story={s}
              canEdit={canAdd && s.createdBy === meId}
              canDelete={s.createdBy === meId || grownUp}
              onEdit={() => setEditing(s.id)}
            />
          ),
        )
      )}

      {linkedStories.map((s) => (
        <LinkedStoryCard key={s.id} story={s} />
      ))}
    </div>
  );
}

/** A story's recordings, words, photos and papers, the same on ours and on
 * one a linked household shared. */
function StoryContent({ story }: { story: { body: string | null; files: TreeStory["files"] } }) {
  const audio = story.files.filter((f) => f.kind === "audio");
  const photos = story.files.filter((f) => f.kind === "photo");
  const papers = story.files.filter((f) => f.kind === "document");
  return (
    <>
      {audio.map((f) =>
        f.url ? (
          <div key={f.id} className="kin-story-audio">
            <audio src={f.url} controls preload="metadata" aria-label={f.fileName || "Recording"} />
            {f.transcript && (
              // As a chat voice note's words: folded away under the player.
              <details className="kin-voice-transcript">
                <summary>Transcript</summary>
                <p>{f.transcript}</p>
              </details>
            )}
          </div>
        ) : (
          <p key={f.id} className="kin-story-missing">
            A recording that couldn&rsquo;t be loaded just now.
          </p>
        ),
      )}
      {story.body && <p className="kin-story-body">{story.body}</p>}
      {photos.length > 0 && (
        <div className="kin-story-photos">
          {photos.map((f) =>
            f.url ? (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" aria-label={`Open ${f.fileName || "the photo"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={f.url} alt={f.fileName || ""} loading="lazy" />
              </a>
            ) : null,
          )}
        </div>
      )}
      {papers.map((f) =>
        f.url ? (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="kin-story-paper">
            <Icon name="fileText" size="1rem" /> {f.fileName || "Document"}
          </a>
        ) : null,
      )}
    </>
  );
}

/** A story a linked household shared: to read and listen to, not to change. */
function LinkedStoryCard({ story }: { story: LinkedStory }) {
  const when = formatStoryWhen(story.happenedOn, story.happenedPrecision);
  const teller = tellerLabel(null, story.teller);
  return (
    <article className="kin-story" data-linked="">
      <h3 className="kin-story-title">{story.title}</h3>
      {(teller || when) && <div className="kin-story-meta">{[teller, when].filter(Boolean).join(" · ")}</div>}
      <StoryContent story={story} />
      <div className="kin-story-foot">
        <span>{linkedStoryFoot(story.familyName, story.createdByName)}</span>
      </div>
    </article>
  );
}

function StoryCard({ story, canEdit, canDelete, onEdit }: { story: TreeStory; canEdit: boolean; canDelete: boolean; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const when = formatStoryWhen(story.happenedOn, story.happenedPrecision);
  const teller = tellerLabel(story.tellerMemberName, story.tellerName);
  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${story.title}"?`,
      description: story.files.length > 0 ? "Its recordings, photos and papers go too. This can't be undone." : "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTreeStoryAction(story.id);
      if (result.error) toast.error(result.error);
      else router.refresh();
    });
  };

  return (
    <article className="kin-story" aria-busy={pending || undefined}>
      <h3 className="kin-story-title">{story.title}</h3>
      {(teller || when) && <div className="kin-story-meta">{[teller, when].filter(Boolean).join(" · ")}</div>}
      <StoryContent story={story} />
      <div className="kin-story-foot">
        <span>
          {[story.createdByName ? `Added by ${story.createdByName.split(" ")[0]}` : "", story.shared ? "Shared with linked households" : ""].filter(Boolean).join(" · ")}
        </span>
        {canEdit && (
          <button type="button" className="btn btn-ghost" onClick={onEdit} disabled={pending}>
            Edit
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={pending} aria-label={`Delete ${story.title}`}>
            <Icon name="trash" size="1rem" />
          </button>
        )}
      </div>
    </article>
  );
}

type Picked = { key: string; file: File; preview: string; transcript?: string; durationSeconds?: number };

const OTHER = "__other";

/** Adds a story, or changes one already kept. */
function StoryForm({
  personId,
  firstName,
  members,
  sharedWith,
  prompt,
  today,
  story,
  onDone,
}: {
  personId: string;
  firstName: string;
  members: Member[];
  sharedWith: string[];
  prompt: string;
  today: string;
  story?: TreeStory;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(story?.title ?? "");
  const [teller, setTeller] = useState(story?.tellerMemberId ?? (story?.tellerName ? OTHER : ""));
  const [tellerName, setTellerName] = useState(story?.tellerName ?? "");
  const [when, setWhen] = useState(story ? storyWhenInput(story.happenedOn, story.happenedPrecision) : "");
  const [body, setBody] = useState(story?.body ?? "");
  const [shared, setShared] = useState(story?.shared ?? false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [removing, setRemoving] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once the story is kept, even when its files were not: trying again
  // then adds the files to that story rather than keeping a second one.
  const [savedId, setSavedId] = useState<string | null>(story?.id ?? null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = when.trim() ? parseStoryWhen(when, today) : null;
  const kept = (story?.files ?? []).filter((f) => !removing.includes(f.id));
  const room = STORY_FILES_MAX - kept.length - picked.length;

  // Previews are object URLs; hand each back when it leaves the form.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = picked.map((p) => p.preview);
  }, [picked]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // A recording, the household chat's recorder with a longer limit: Lola
  // does not stop at two minutes.
  const recorder = useRef<MediaRecorder | null>(null);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [recordedFor, setRecordedFor] = useState(0);
  const startRecording = async () => {
    setError(null);
    if (typeof window === "undefined" || !("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. A recording made on the phone can be added as a file instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Kin needs the microphone to record a story. It can be allowed in the browser's site settings.");
      return;
    }
    // iOS Safari records mp4, most others webm.
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecordingSince(null);
      const words = transcript.finish();
      const seconds = (Date.now() - started) / 1000;
      if (seconds < 0.8 || chunks.length === 0) return;
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File(chunks, `${firstName} story ${Math.round(seconds)}s.${ext}`, { type });
      // Some phones can't write words down and record at once, and the
      // recording is what loses. Then the words are kept as the story's
      // text, rather than a silent recording.
      if (words && (await recordingIsSilent(file))) {
        setBody((b) => (b ? `${b}\n\n${words}` : words));
        rememberTranscriptConflict();
        setError(
          "This phone can't write down words and record at the same time, so what it heard is in the story's words instead. From now on, recordings on this phone keep the sound, without the words.",
        );
        return;
      }
      setPicked((prev) => [...prev, { key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), transcript: words || undefined, durationSeconds: seconds }]);
    };
    // Written down while it records (src/lib/voice-note.ts).
    const transcript = startTranscript(STORY_TRANSCRIPT_MAX);
    recorder.current = rec;
    rec.start();
    setRecordedFor(0);
    setRecordingSince(started);
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();
  useEffect(() => {
    if (recordingSince === null) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - recordingSince) / 1000;
      setRecordedFor(seconds);
      if (seconds >= STORY_RECORDING_MAX_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recordingSince]);
  // Leaving the form mid-recording lets go of the microphone.
  useEffect(() => () => void (recorder.current?.state === "recording" && recorder.current.stop()), []);

  const pick = (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const ok = all.filter((f) => STORY_FILE_TYPES.test(f.type));
    if (ok.length < all.length) setError("Photos, recordings and PDFs can be added here.");
    if (ok.length > room) setError(`A story can hold ${STORY_FILES_MAX} files.`);
    setPicked((prev) => [...prev, ...ok.slice(0, Math.max(0, room)).map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))]);
    if (fileInput.current) fileInput.current.value = "";
  };
  const unpick = (key: string) =>
    setPicked((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.key !== key);
    });

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError("Give the story a title.");
    if (parsed && "error" in parsed) return setError(parsed.error);
    setSaving(true);
    try {
      const files: NewStoryFile[] = [];
      for (const p of picked) {
        const uploaded = await uploadFileDirect(p.file, "tree_story");
        if (uploaded.provider !== "supabase") throw new Error("Couldn't keep that file. Try again.");
        files.push({ storagePath: uploaded.storagePath, mimeType: p.file.type, fileName: p.file.name, transcript: p.transcript ?? null, durationSeconds: p.durationSeconds ?? null });
      }
      const result = await saveTreeStoryAction({
        storyId: savedId,
        personId,
        title,
        body,
        tellerMemberId: teller && teller !== OTHER ? teller : null,
        tellerName: teller === OTHER ? tellerName : "",
        when,
        files,
        removeFileIds: removing,
        shared,
      });
      if (result.error) {
        setError(result.error);
        // Saved with its words but not its files: the story is there to
        // look at, so the page catches up, and the files stay picked to try
        // again.
        if (result.id) {
          setSavedId(result.id);
          router.refresh();
        }
        return;
      }
      toast.success(story ? "Story saved." : `Story kept with ${firstName}.`);
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the story. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const recording = recordingSince !== null;
  const clock = `${Math.floor(recordedFor / 60)}:${String(Math.floor(recordedFor % 60)).padStart(2, "0")}`;

  return (
    <div className="kin-story kin-story-form">
      <div className="kin-treepanel-label">{story ? "Edit the story" : `A story about ${firstName}`}</div>

      <label className="kin-story-field">
        <span>Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={STORY_TITLE_MAX} placeholder="How Lola came to Manila" />
      </label>
      {!story && title.trim() !== prompt && (
        <button type="button" className="chip kin-story-prompt" onClick={() => setTitle(prompt)}>
          <Icon name="sparkle" size="0.8125rem" /> This week&rsquo;s question: {prompt}
        </button>
      )}

      <label className="kin-story-field">
        <span>Who told it</span>
        <select className="input" value={teller} onChange={(e) => setTeller(e.target.value)}>
          <option value="">Not said</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
          <option value={OTHER}>Someone else</option>
        </select>
      </label>
      {teller === OTHER && (
        <input
          className="input"
          value={tellerName}
          onChange={(e) => setTellerName(e.target.value)}
          maxLength={STORY_TELLER_MAX}
          placeholder="Lolo Ben, told to Mia"
          aria-label="Who told it"
        />
      )}

      <label className="kin-story-field">
        <span>When it happened</span>
        <input className="input" value={when} onChange={(e) => setWhen(e.target.value)} maxLength={40} placeholder="1975, May 1975 or 3 May 1975" />
      </label>
      {parsed && (
        <p className="kin-story-hint" data-error={"error" in parsed || undefined}>
          {"error" in parsed ? parsed.error : parsed.on ? `Kept as ${formatStoryWhen(parsed.on, parsed.precision)}.` : ""}
        </p>
      )}

      <label className="kin-story-field">
        <span>The story, written down</span>
        <textarea
          className="input"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={STORY_BODY_MAX}
          placeholder="Optional when there's a recording."
        />
      </label>

      {kept.length + picked.length > 0 && (
        <ul className="kin-story-files">
          {kept.map((f) => (
            <li key={f.id}>
              <Icon name={f.kind === "audio" ? "mic" : f.kind === "photo" ? "images" : "fileText"} size="1rem" />
              <span>{f.fileName || (f.kind === "audio" ? "Recording" : f.kind === "photo" ? "Photo" : "Document")}</span>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving((r) => [...r, f.id])} aria-label={`Take off ${f.fileName || "this file"}`} disabled={saving}>
                <Icon name="x" size="1rem" />
              </button>
            </li>
          ))}
          {picked.map((p) => (
            <li key={p.key}>
              {p.file.type.startsWith("audio/") ? (
                <audio src={p.preview} controls preload="metadata" aria-label={p.file.name} />
              ) : p.file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview
                <img src={p.preview} alt="" />
              ) : (
                <Icon name="fileText" size="1rem" />
              )}
              <span>{p.file.type.startsWith("audio/") ? (p.transcript ? "Recording, with its words" : "Recording") : p.file.name}</span>
              <button type="button" className="btn btn-ghost" onClick={() => unpick(p.key)} aria-label={`Take off ${p.file.name}`} disabled={saving}>
                <Icon name="x" size="1rem" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="kin-story-add">
        {recording ? (
          <button type="button" className="btn btn-primary" onClick={stopRecording} aria-label="Stop recording">
            <Icon name="stop" size="1rem" /> Stop · {clock}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => void startRecording()} disabled={saving || room <= 0}>
            <Icon name="mic" size="1rem" /> Record
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={saving || recording || room <= 0}>
          <Icon name="paperclip" size="1rem" /> Photos or papers
        </button>
        <input ref={fileInput} type="file" accept="image/*,application/pdf,audio/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      </div>
      {recording && <p className="kin-story-hint">Recording. Up to {STORY_RECORDING_MAX_SECONDS / 60} minutes; the words are written down as it goes where this phone can.</p>}

      <label className="kin-story-share">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={saving} />
        <span>Share with linked households</span>
      </label>
      <p className="kin-story-hint">{shared ? storyShareHint(firstName, sharedWith) : "Only your household sees it."}</p>

      {error && (
        <p role="alert" className="kin-story-hint" data-error="">
          {error}
        </p>
      )}
      <div className="kin-story-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone} disabled={saving || recording}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || recording || !title.trim()}>
          {saving ? "Saving…" : story ? "Save" : "Keep this story"}
        </button>
      </div>
    </div>
  );
}

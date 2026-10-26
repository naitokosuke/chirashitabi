import { onActivated, onBeforeUnmount, onDeactivated, ref } from "vue";

import { useI18n } from "../../i18n/useI18n";

import type { ImageId, NoteId } from "../notes/id";
import { shrinkImage, STICKER_SIDE } from "../notes/image";
import { blankInput } from "../notes/input";
import { siteOf } from "../notes/links";
import type { NoteInput } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import {
  isMapsLink,
  isShortMapsLink,
  parseHttpUrl,
  placeFromUrl,
  type HttpUrl,
} from "../place/google-maps";
import type { Here } from "../sync/here";
import { useOffline } from "../sync/useOffline";
import { useSync } from "../sync/useSync";
import { useTags } from "../tags/useTags";
import { useToast } from "../toast/useToast";

import type { Pt } from "./transform";

/**
 * What comes onto the desk from outside it: a memo's words (a pasted link), or a picture the
 * room keeps, stuck with its middle at a point on the screen (null: the desk's middle)
 */
export type Intake =
  | { kind: "memo"; input: NoteInput }
  | { kind: "sticker"; image: ImageId; at: Pt | null };

/**
 * The desk taking what is brought to it: a picture picked from the photos, pasted or dropped
 * becomes a sticker, and a pasted link a card. `place` puts each on the desk and says which
 * card it became, the one to pop; what a link's page or a short Maps link says is filled in on
 * that card afterwards. `here` is the room the desk is in (useInRoom), read where it is used.
 * Call in the desk's setup: a paste is the desk's only while it is shown.
 */
export function useIntake(here: Here, place: (what: Intake) => NoteId) {
  const store = useNotes();
  const toast = useToast();
  /** Where changes go now: a picture is stuck only while the room it was kept in is open */
  const sync = useSync();
  const tags = useTags();
  const i18n = useI18n();
  /** Cut off: what needs the Worker is not asked */
  const cut = useOffline();

  /** A sticker on its way to the room: one at a time */
  const sticking = ref(false);
  function onStickerPicked(e: Event) {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = ""; // the same picture can be picked again after a failure
    if (file !== undefined) void stick(file, null);
  }
  /** The first picture among what was pasted or dropped */
  const pictureIn = (files: FileList | undefined) =>
    [...(files ?? [])].find((f) => f.type.startsWith("image/"));
  /**
   * A picture pasted on a computer becomes a sticker in the middle of the desk, and a link a card
   * there; pasted into words being written (a form, a text box), they are theirs
   */
  function onPaste(e: ClipboardEvent) {
    const target = e.target;
    if (target instanceof Element && target.closest("input, textarea, [contenteditable]") !== null)
      return;
    const file = pictureIn(e.clipboardData?.files);
    if (file !== undefined) {
      e.preventDefault();
      void stick(file, null);
      return;
    }
    const url = parseHttpUrl(e.clipboardData?.getData("text/plain").trim());
    if (url === null) return;
    e.preventDefault();
    void linkCard(url);
  }
  /**
   * A link on the desk: a Google Maps one is a note at that place, as in the form (a short one's
   * point read by the Worker); any other is a card named after its site at once, which the page's
   * title, line and picture then fill in, when the page says and the Worker can be asked, as long
   * as nobody has written on the card meanwhile
   */
  async function linkCard(url: HttpUrl) {
    if (isMapsLink(url)) {
      const where = placeFromUrl(url, null);
      const id = place({
        kind: "memo",
        input: {
          ...blankInput(tags.selected, where.pin),
          title: i18n.t("canvas.pastedPlace"),
          ...where,
        },
      });
      if (cut.offline || !isShortMapsLink(url)) return;
      try {
        const answer = await here.api.expandLink(url, i18n.locale);
        // past the budget the short link stays, as when it could not be read
        if (!answer.ok) return;
        const now = store.notes.value?.find((x) => x.id === id);
        // given another link, or gone (another room open) meanwhile: where it leads is not wanted
        if (now?.kind !== "memo" || now.mapsUrl !== url) return;
        store.update(id, placeFromUrl(answer.value.url, answer.value.at ?? now.pin));
      } catch {
        // the short link stays; the note has no point yet
      }
      return;
    }
    const site = siteOf(url);
    // a print, on white stock
    const id = place({
      kind: "memo",
      input: { ...blankInput(tags.selected, null), title: site, link: url, color: "#ffffff" },
    });
    if (cut.offline) return;
    try {
      const answer = await here.api.preview(url);
      if (!answer.ok || answer.value === null) return;
      const found = answer.value;
      const now = store.notes.value?.find((x) => x.id === id);
      // written on, or gone (another room open), meanwhile: the page's words are not wanted
      if (now?.kind !== "memo" || now.title !== site || now.body !== "") return;
      store.update(id, {
        link: found.url,
        title: found.title ?? site,
        body: found.description ?? "",
        ...(now.image === null && found.image !== null ? { image: found.image } : {}),
      });
    } catch {
      // the card is on the desk with its link; the page's words were a nicety
    }
  }
  /** Only a dragged file is taken; a picture dropped on the desk is stuck where it lands */
  function onDragOver(e: DragEvent) {
    if (!(e.dataTransfer?.types.includes("Files") ?? false)) return;
    e.preventDefault();
    if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "copy";
  }
  function onDrop(e: DragEvent) {
    const file = pictureIn(e.dataTransfer?.files);
    if (file === undefined) return;
    e.preventDefault();
    void stick(file, { x: e.clientX, y: e.clientY });
  }
  /**
   * Keep the picture in the room, then stick it with its middle at `at` (a point on the screen;
   * null for the desk's middle). The picture is the room's it was picked in: left meanwhile,
   * nothing is stuck anywhere.
   */
  async function stick(file: Blob, at: Pt | null) {
    if (sticking.value) return;
    sticking.value = true;
    const { room, api } = here;
    try {
      const kept = await api.uploadImage(await shrinkImage(file, STICKER_SIDE));
      if (sync.room !== room) return;
      if (!kept.ok) {
        toast.show(i18n.t("form.photoFull"));
        return;
      }
      place({ kind: "sticker", image: kept.value, at });
    } catch {
      // said in the room it was picked in only
      toast.show(i18n.t("canvas.stickerFailed"), { room });
    } finally {
      sticking.value = false;
    }
  }
  // A paste is the desk's only while it is shown: kept behind another tab, it hears none
  onActivated(() => document.addEventListener("paste", onPaste));
  onDeactivated(() => document.removeEventListener("paste", onPaste));
  onBeforeUnmount(() => document.removeEventListener("paste", onPaste));

  return { sticking, onStickerPicked, onDragOver, onDrop };
}

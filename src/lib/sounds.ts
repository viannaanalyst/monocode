import {
  play,
  setEnabled,
  setVolume,
  sounds,
  type SoundName,
} from "cuelume";

export type { SoundName } from "cuelume";

const KEY = "monocode.sounds";
const NOTIFICATION_SOUND_KEY = "monocode.notificationSound";

export const SOUNDS_DEFAULT = true;

/** Soft enough to sit in the background while a turn runs in another app. */
export const SOUNDS_VOLUME = 0.55;

export const SOUNDS_CHANGE_EVENT = "monocode:sounds-change";

/** Every palette sound cuelume exposes, for the Settings picker. */
export const SOUND_PALETTE = sounds;

/** Used for "turn finished" and "approval needed" until the user picks one. */
export const NOTIFICATION_SOUND_DEFAULT: SoundName = "success";

export type SoundCue =
  | "turnFinished"
  | "approvalNeeded"
  | "inboxUnseen"
  | "updateAvailable"
  | "switch"
  | "copy";

const CUES: Record<SoundCue, SoundName> = {
  turnFinished: NOTIFICATION_SOUND_DEFAULT,
  approvalNeeded: NOTIFICATION_SOUND_DEFAULT,
  inboxUnseen: "bloom",
  updateAvailable: "arrival",
  switch: "toggle",
  copy: "scan",
};

export function isSoundName(value: unknown): value is SoundName {
  return (
    typeof value === "string" && (sounds as readonly string[]).includes(value)
  );
}

export function loadNotificationSound(): SoundName {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SOUND_KEY);
    return isSoundName(raw) ? raw : NOTIFICATION_SOUND_DEFAULT;
  } catch {
    return NOTIFICATION_SOUND_DEFAULT;
  }
}

export function saveNotificationSound(value: SoundName) {
  try {
    localStorage.setItem(NOTIFICATION_SOUND_KEY, value);
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SoundName>(SOUNDS_CHANGE_EVENT, { detail: value }),
  );
}

export function loadSoundsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return SOUNDS_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return SOUNDS_DEFAULT;
  }
}

export function saveSoundsEnabled(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  applySoundEngine();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(SOUNDS_CHANGE_EVENT, { detail: value }),
  );
}

function applySoundEngine() {
  setEnabled(loadSoundsEnabled());
  setVolume(SOUNDS_VOLUME);
}

/** Apply the stored mute/volume before the first cue. */
export function initSounds() {
  applySoundEngine();
}

export function playCue(cue: SoundCue) {
  if (!loadSoundsEnabled()) return;
  applySoundEngine();
  const name =
    cue === "turnFinished" || cue === "approvalNeeded"
      ? loadNotificationSound()
      : CUES[cue];
  play(name);
}

/** Preview a palette sound from Settings; plays even when cues are muted. */
export function previewSound(name: SoundName) {
  setEnabled(true);
  setVolume(SOUNDS_VOLUME);
  play(name);
}

let inboxDotOn = false;
let inboxPrimed = false;
let announcedUpdate: string | undefined;

/**
 * Rising edge of the project-rail inbox dot, after the first snapshot.
 * Launching with items already unseen must not chime.
 */
export function noteInboxUnseen(isUnseen: boolean) {
  if (isUnseen && !inboxDotOn && inboxPrimed) playCue("inboxUnseen");
  inboxDotOn = isUnseen;
  inboxPrimed = true;
}

/** One cue per available version, including a later probe of the same build. */
export function announceUpdateAvailable(version: string | null) {
  if (!version) {
    announcedUpdate = undefined;
    return;
  }
  if (announcedUpdate === version) return;
  announcedUpdate = version;
  playCue("updateAvailable");
}

/** Test helper: forget which inbox/update cues already fired. */
export function resetSoundCues() {
  inboxDotOn = false;
  inboxPrimed = false;
  announcedUpdate = undefined;
}

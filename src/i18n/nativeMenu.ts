import { invoke } from "@tauri-apps/api/core";
import type { Locale } from "./locale";

export async function applyNativeMenuLocale(locale: Locale): Promise<void> {
  try {
    await invoke("set_menu_locale", { locale });
  } catch {
    // web preview / tests
  }
}

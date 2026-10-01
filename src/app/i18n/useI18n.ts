import { ref, watchEffect } from "vue";

import { defineStore } from "pinia";

import { format, segments } from "./format";
import { matchLocale, parseLocale, type Locale } from "./locale";
import type { MessageId, MessageParams } from "./types";

const STORAGE_KEY = "chirashitabi:locale";

function storedLocale() {
  try {
    return parseLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export const useI18n = defineStore("i18n", () => {
  /** What this device reads in: the one picked here before, else the browser's language */
  const locale = ref<Locale>(storedLocale() ?? matchLocale(navigator.languages));
  watchEffect(() => (document.documentElement.lang = locale.value));

  function setLocale(next: Locale) {
    locale.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode and the like: it just won't be remembered
    }
  }

  /** The message in the current locale, as a string */
  const t = (id: MessageId, params?: MessageParams) => format(locale.value, id, params);
  /** The message cut at its markup, for `<Message>` */
  const parts = (id: MessageId, params?: MessageParams) => segments(locale.value, id, params);

  return { locale, setLocale, t, parts };
});

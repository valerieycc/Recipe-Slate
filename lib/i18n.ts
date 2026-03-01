export const LOCALE_STORAGE_KEY = "recipe-slate-locale";

export type Locale = "en" | "de" | "zh" | "ko";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "zh", label: "繁體中文" },
  { value: "ko", label: "한국어" },
];

export const DEFAULT_LOCALE: Locale = "en";

export type Messages = Record<string, string>;

import en from "@/messages/en.json";
import de from "@/messages/de.json";
import zh from "@/messages/zh.json";
import ko from "@/messages/ko.json";

const MESSAGES: Record<Locale, Messages> = { en, de, zh, ko };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale] ?? MESSAGES.en;
}

export function translate(
  messages: Messages,
  key: string,
  params?: Record<string, string | number>
): string {
  let text = messages[key] ?? (MESSAGES.en as Messages)[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

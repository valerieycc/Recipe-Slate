"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  type Locale,
  type Messages,
  LOCALE_STORAGE_KEY,
  DEFAULT_LOCALE,
  getMessages,
  translate,
} from "@/lib/i18n";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
  messages: Messages;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "de" || stored === "zh" || stored === "ko")
    return stored;
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getStoredLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.documentElement.lang =
        next === "zh" ? "zh-Hans" : next === "de" ? "de" : next === "ko" ? "ko" : "en";
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang =
      locale === "zh" ? "zh-Hans" : locale === "de" ? "de" : locale === "ko" ? "ko" : "en";
  }, [mounted, locale]);

  const messages = getMessages(locale);
  const t: TFunction = useCallback(
    (key, params) => translate(messages, key, params),
    [messages]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, messages }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

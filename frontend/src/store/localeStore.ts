import { create } from 'zustand';

export type Locale = 'en' | 'fr';

const STORAGE_KEY = 'hr-intel-locale';

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'fr' ? 'fr' : 'en';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** App-wide UI language, persisted per browser — same toggle pattern as a typical site's EN/FR switcher. */
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readStoredLocale(),
  setLocale: (locale) => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    set({ locale });
  },
}));

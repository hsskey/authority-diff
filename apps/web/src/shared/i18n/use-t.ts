import { useSyncExternalStore } from 'react';
import { en, type Messages } from './en.ts';
import { ko } from './ko.ts';

export type Language = 'en' | 'ko';

const CATALOG: Record<Language, Messages> = { en, ko };
const STORAGE_KEY = 'authority.language';
const listeners = new Set<() => void>();

function storedLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'ko' ? value : null;
  } catch {
    return null;
  }
}

function browserLanguage(): Language {
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let current: Language = storedLanguage() ?? browserLanguage();
document.documentElement.lang = current;

/** Switches every screen to `language` and remembers the choice for later visits. */
export function setLanguage(language: Language): void {
  current = language;
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage can be blocked; the choice still holds for this page.
  }
  for (const listener of listeners) {
    listener();
  }
}

/** The catalog for the current language, for text produced outside a render. */
export function currentMessages(): Messages {
  return CATALOG[current];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => current);
}

export function useT(): Messages {
  return CATALOG[useLanguage()];
}

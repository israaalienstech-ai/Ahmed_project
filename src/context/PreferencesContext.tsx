/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark';
export type LanguageCode = 'ar' | 'en';
export type TextDirection = 'rtl' | 'ltr';

interface PreferencesContextType {
  theme: ThemeMode;
  lang: LanguageCode;
  dir: TextDirection;
  isRtl: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleLang: () => void;
  setLang: (lang: LanguageCode) => void;
}

const PreferencesContext = createContext<PreferencesContextType>({
  theme: 'light',
  lang: 'ar',
  dir: 'rtl',
  isRtl: true,
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
  toggleLang: () => {},
  setLang: () => {},
});

const THEME_STORAGE_KEY = 'notifyme_theme';
const LANG_STORAGE_KEY = 'notifyme_lang';

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // ignore storage errors
    }
    return 'light';
  });

  const [lang, setLangState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch {
      // ignore storage errors
    }
    return 'ar';
  });

  const dir: TextDirection = lang === 'ar' ? 'rtl' : 'ltr';
  const isRtl = dir === 'rtl';
  const isDark = theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dir = dir;
    root.lang = lang;
    document.body.dir = dir;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, [lang, dir]);

  const setTheme = (next: ThemeMode) => setThemeState(next);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const setLang = (next: LanguageCode) => setLangState(next);
  const toggleLang = () => setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));

  return (
    <PreferencesContext.Provider
      value={{
        theme,
        lang,
        dir,
        isRtl,
        isDark,
        toggleTheme,
        setTheme,
        toggleLang,
        setLang,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => useContext(PreferencesContext);

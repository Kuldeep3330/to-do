'use client';

import * as React from 'react';

export type AdminTheme = 'light' | 'dark';
const STORAGE_KEY = 'ncr-admin-theme';

function apply(theme: AdminTheme) {
  if (theme === 'dark') document.documentElement.dataset.adminTheme = 'dark';
  else delete document.documentElement.dataset.adminTheme;
}

/** Light/dark preference for the admin area only. Remembered per browser; the public site is unaffected. */
export function useAdminTheme() {
  const [theme, setTheme] = React.useState<AdminTheme>('light');

  React.useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked: stay on light */
    }
    const initial: AdminTheme = saved === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    apply(initial);
    return () => {
      delete document.documentElement.dataset.adminTheme;
    };
  }, []);

  const toggle = React.useCallback(() => {
    const next: AdminTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return { theme, toggle };
}

import { useLayoutEffect, type ReactNode } from 'react';

import { app, hub } from '../app.config';
import styles from './HubShell.module.css';
import { themeForMonth } from './palette';

/** True when this app is running inside the hub's app viewer. */
const embedded = window.self !== window.top;

/**
 * Gives the app the hub's look: the monthly theme and a slim bar linking back to the hub. The
 * bar is hidden when the hub embeds the app, since the hub's viewer has its own.
 */
export function HubShell({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const theme = themeForMonth(new Date().getMonth());
    root.style.setProperty('--theme-l', String(theme.l));
    root.style.setProperty('--theme-c', String(theme.c));
    root.style.setProperty('--theme-h', String(theme.h));
    if (embedded) root.dataset.embedded = '';
  }, []);

  return (
    <>
      {!embedded && (
        <header className={styles.bar}>
          <a className={styles.back} href={hub.url}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            {hub.name}
          </a>
          <span className={styles.title}>{app.title}</span>
        </header>
      )}
      {children}
    </>
  );
}

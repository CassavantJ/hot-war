import { useState } from 'react';

import styles from './App.module.css';
import { app } from './app.config';

/** Your app starts here. The hub bar, theme and fonts come from src/hub/. */
export function App() {
  const [count, setCount] = useState(0);

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1 className={styles.title}>{app.title}</h1>
        <p className={styles.text}>{app.description}</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            setCount((value) => value + 1);
          }}
        >
          Clicked {count} {count === 1 ? 'time' : 'times'}
        </button>
        <p className={styles.hint}>
          Edit <code>src/App.tsx</code> to start building.
        </p>
      </section>
    </main>
  );
}

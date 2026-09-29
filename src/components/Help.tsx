import { useEffect } from 'react';

import styles from './Help.module.css';

const CONTROLS: [string, string][] = [
  ['Left click', 'Select a unit or building; with units selected, move, attack or enter'],
  ['Left drag', 'Select every unit in the box'],
  ['Right click', 'Deselect, or cancel placing a building'],
  ['Right drag', 'Scroll the map (so do the screen edges and arrow keys)'],
  ['Mouse wheel', 'Zoom in and out'],
  ['Double click', 'Select all units of that kind on screen'],
  ['Ctrl + click', 'Force fire: attack anything, even the ground'],
  ['Alt + click', 'Force move: ignore enemies and just go'],
  ['A, then click', 'Attack-move: fight anything met on the way'],
  ['Ctrl (or Alt) + 1–9', 'Make a group; press the number to select it, twice to jump to it'],
  ['S / G / X', 'Stop / guard the area / scatter'],
  ['D', 'Deploy: set up the Base Truck, dig in Riflemen, empty a building'],
  ['T', 'Select units like the ones selected (twice: everywhere)'],
  ['H / Space', 'Jump to your base / to the last alert'],
  ['Q W E R, Tab', 'Switch build tabs'],
  ['K / Z', 'Sell / repair mode'],
  ['Esc', 'Cancel, or open the menu'],
];

const TIPS = [
  'Deploy your Base Truck (click it, or press D) to set up your Headquarters.',
  'Build power first, then an Ore Refinery: it comes with a free harvester.',
  'Barracks train infantry; the vehicle factory needs a refinery. Radar and a Research Lab unlock the best units.',
  'Low power slows building and switches off radar and powered defences. Keep the green bar above the line.',
  'Click a building in the sidebar to build it, then click the ground next to your base to place it. Right-click a button to pause or cancel.',
  'Engineers capture enemy buildings and oil derricks, and repair your own. Riflemen and Draftees can hide in town buildings.',
  'Destroy every enemy building to win.',
];

/** Controls and tips, over the top of whatever's on screen. */
export function Help({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className={styles.header}>
          <h2 id="help-title">How to play</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <ol className={styles.tips}>
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ol>
          <dl className={styles.controls}>
            {CONTROLS.map(([keys, action]) => (
              <div key={keys}>
                <dt>{keys}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

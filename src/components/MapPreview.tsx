import { useEffect, useRef } from 'react';

import { buildMap, mapSpec } from '../sim/maps';
import { drawPreview } from '../view/minimap';
import styles from './Lobby.module.css';

/** A small overhead picture of a map. */
export function MapPreview({ mapId }: { mapId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const built = buildMap(mapSpec(mapId));
    drawPreview(element, built.map, built.neutrals);
  }, [mapId]);
  return (
    <canvas ref={canvas} className={styles.preview} width={320} height={200} aria-hidden="true" />
  );
}

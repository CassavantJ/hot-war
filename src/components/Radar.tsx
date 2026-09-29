import { useEffect, useRef } from 'react';

import type { Match } from '../game/match';
import { drawRadar, fromRadar, layout, terrainPixels } from '../view/minimap';
import styles from './Match.module.css';

const SIZE = 200;

/** The radar screen: needs a working radar building with power. */
export function Radar({ match, online }: { match: Match; online: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const world = match.world;
    const box = layout(world.map, SIZE, SIZE);
    const scratch = document.createElement('canvas');
    let base = terrainPixels(world.map, false);
    let version = world.map.blockVersion;
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < (online ? 200 : 90)) return;
      last = now;
      if (!online) {
        const image = ctx.createImageData(SIZE, SIZE);
        for (let i = 0; i < image.data.length; i += 4) {
          const v = Math.random() * 60;
          image.data[i] = v;
          image.data[i + 1] = v * 1.1;
          image.data[i + 2] = v;
          image.data[i + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        return;
      }
      if (world.map.blockVersion !== version) {
        version = world.map.blockVersion;
        base = terrainPixels(world.map, false);
      }
      drawRadar(ctx, world, world.local, box, base, scratch, match.view?.viewCorners() ?? null);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [match, online]);

  const jump = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const view = match.view;
    const element = canvas.current;
    if (!view || !element || !online) return;
    const rect = element.getBoundingClientRect();
    const box = layout(match.world.map, SIZE, SIZE);
    const x = ((event.clientX - rect.left) / rect.width) * SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * SIZE;
    const point = fromRadar(match.world.map, box, x, y);
    view.focus.set(point.x, point.z);
  };

  return (
    <div className={styles.radar}>
      <canvas
        ref={canvas}
        width={SIZE}
        height={SIZE}
        className={styles.radarCanvas}
        aria-label="Radar"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          jump(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) jump(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      />
      {!online && <span className={styles.radarOff}>Radar offline</span>}
    </div>
  );
}

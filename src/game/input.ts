import type { Action } from './controller';
import type { Match } from './match';

function svgCursor(body: string, hotX = 16, hotY = 16, fallback = 'crosshair'): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}

const OUTLINE = "stroke='#000' stroke-width='4' stroke-linecap='round' fill='none'";

function arrows(color: string, inward: boolean): string {
  const tips = inward
    ? 'M16 11 L16 3 M16 21 L16 29 M11 16 L3 16 M21 16 L29 16 M13 8 L16 11 L19 8 M13 24 L16 21 L19 24 M8 13 L11 16 L8 19 M24 13 L21 16 L24 19'
    : 'M16 3 L16 12 M16 20 L16 29 M3 16 L12 16 M20 16 L29 16 M12 7 L16 3 L20 7 M12 25 L16 29 L20 25 M7 12 L3 16 L7 20 M25 12 L29 16 L25 20';
  return `<path d='${tips}' ${OUTLINE}/><path d='${tips}' stroke='${color}' stroke-width='2' stroke-linecap='round' fill='none'/>`;
}

const CURSORS: Record<Action, string> = {
  none: 'default',
  select: 'pointer',
  move: svgCursor(arrows('#6dff7a', false)),
  harvest: svgCursor(arrows('#ffd84a', false)),
  attack: svgCursor(
    `<circle cx='16' cy='16' r='9' ${OUTLINE}/><path d='M16 2 L16 10 M16 22 L16 30 M2 16 L10 16 M22 16 L30 16' ${OUTLINE}/>` +
      `<circle cx='16' cy='16' r='9' stroke='#ff4a3d' stroke-width='2' fill='none'/><path d='M16 2 L16 10 M16 22 L16 30 M2 16 L10 16 M22 16 L30 16' stroke='#ff4a3d' stroke-width='2'/>`,
  ),
  enter: svgCursor(arrows('#ffd84a', true)),
  capture: svgCursor(arrows('#5fe0ff', true)),
  deploy: svgCursor(
    `<rect x='8' y='8' width='16' height='16' ${OUTLINE}/><rect x='8' y='8' width='16' height='16' stroke='#6dff7a' stroke-width='2' fill='none'/><path d='M4 4 L9 9 M28 4 L23 9 M4 28 L9 23 M28 28 L23 23' stroke='#6dff7a' stroke-width='2'/>`,
  ),
  rally: svgCursor(
    `<path d='M9 29 L9 4 L25 9 L9 15' ${OUTLINE}/><path d='M9 29 L9 4' stroke='#fff' stroke-width='2'/><path d='M9 4 L25 9 L9 15 Z' fill='#6dff7a'/>`,
    9,
    29,
  ),
  nogo: 'not-allowed',
  sell: svgCursor(
    `<circle cx='16' cy='16' r='11' fill='#1b5e20' stroke='#000' stroke-width='2'/><text x='16' y='22' font-size='17' font-family='sans-serif' font-weight='bold' fill='#b9ffb0' text-anchor='middle'>$</text>`,
  ),
  repair: svgCursor(
    `<path d='M20 5 a6 6 0 1 0 7 7 l-3 -1 l-2 -3 z M21 11 L7 25' ${OUTLINE}/><path d='M20 5 a6 6 0 1 0 7 7 l-3 -1 l-2 -3 z' fill='#ffd84a' stroke='#6a5200' stroke-width='1.5'/><path d='M21 11 L7 25' stroke='#ffd84a' stroke-width='3' stroke-linecap='round'/>`,
  ),
  place: 'crosshair',
  noplace: 'not-allowed',
};

export function cursorFor(action: Action): string {
  return CURSORS[action];
}

/** Wires mouse, touch, wheel, keyboard and resizing to a match. Returns an undo function. */
export function bindInput(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  match: Match,
): () => void {
  const point = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const touches = new Map<
    number,
    { x: number; y: number; startX: number; startY: number; time: number }
  >();
  let panned = false;
  let pinch = 0;
  let cursor = '';

  const down = (event: PointerEvent) => {
    match.audio.unlock();
    const controller = match.controller;
    if (!controller) return;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x, y, startX: x, startY: y, time: performance.now() });
      if (touches.size === 1) panned = false;
      return;
    }
    controller.pointerDown(event.button, x, y);
  };

  const move = (event: PointerEvent) => {
    const controller = match.controller;
    const view = match.view;
    if (!controller || !view) return;
    const { x, y } = point(event);
    if (event.pointerType === 'touch') {
      const touch = touches.get(event.pointerId);
      if (!touch) return;
      const dx = x - touch.x;
      const dy = y - touch.y;
      touch.x = x;
      touch.y = y;
      if (touches.size >= 2) {
        const [a, b] = [...touches.values()];
        if (a && b) {
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch > 0) view.zoomBy(pinch / Math.max(1, distance));
          pinch = distance;
        }
        view.pan(-dx / 2, -dy / 2);
        panned = true;
        return;
      }
      if (panned || Math.hypot(x - touch.startX, y - touch.startY) > 10) {
        panned = true;
        view.pan(-dx, -dy);
      }
      controller.pointerMove(x, y, true);
      return;
    }
    controller.pointerMove(x, y, true);
  };

  const up = (event: PointerEvent) => {
    const controller = match.controller;
    if (!controller) return;
    const { x, y } = point(event);
    const mods = { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, alt: event.altKey };
    if (event.pointerType === 'touch') {
      const touch = touches.get(event.pointerId);
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = 0;
      if (!touch || panned) return;
      if (performance.now() - touch.time > 550) {
        controller.cancel();
        return;
      }
      controller.pointerMove(x, y, true);
      controller.pointerDown(0, x, y);
      controller.pointerUp(0, x, y, mods);
      return;
    }
    controller.pointerUp(event.button, x, y, mods);
  };

  const leave = () => {
    match.controller?.pointerLeave();
  };

  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    match.controller?.wheel(event.deltaY);
  };

  const menu = (event: Event) => {
    event.preventDefault();
  };

  const keyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    if (match.paused && event.key !== 'Escape') return;
    match.audio.unlock();
    if (event.altKey && event.key !== 'Alt' && !/^[0-9]$/.test(event.key)) return;
    if (match.controller?.keyDown(event)) event.preventDefault();
  };

  const keyUp = (event: KeyboardEvent) => {
    match.controller?.keyUp(event);
  };

  const blur = () => {
    match.controller?.clearKeys();
  };

  const resize = () => {
    const rect = container.getBoundingClientRect();
    match.resize(
      Math.max(1, rect.width),
      Math.max(1, rect.height),
      Math.min(2, window.devicePixelRatio || 1),
    );
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let frame = requestAnimationFrame(function tick() {
    frame = requestAnimationFrame(tick);
    const action = match.controller?.action ?? 'none';
    const next = cursorFor(action);
    if (next !== cursor) {
      cursor = next;
      canvas.style.cursor = next;
    }
  });

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('pointerleave', leave);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    window.removeEventListener('blur', blur);
  };
}

// Device-independent sizing. Games never hard-code pixel sizes: they ask for
// the logical viewport and let these helpers handle devicePixelRatio, resizes
// and orientation changes. Target devices range from a 390x844 phone to a
// 1280x800 tablet, so lay out in fractions of the viewport.

export interface ViewportSize {
  width: number;
  height: number;
  dpr: number;
  portrait: boolean;
}

export function viewport(): ViewportSize {
  const width = Math.max(1, Math.round(window.innerWidth));
  const height = Math.max(1, Math.round(window.innerHeight));
  return { width, height, dpr: Math.min(window.devicePixelRatio || 1, 3), portrait: height >= width };
}

/** Run `cb` now and on every resize or orientation change (debounced to a frame). */
export function onViewportChange(cb: (size: ViewportSize) => void): () => void {
  let raf = 0;
  const fire = (): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => cb(viewport()));
  };
  window.addEventListener("resize", fire);
  window.addEventListener("orientationchange", fire);
  window.visualViewport?.addEventListener("resize", fire);
  cb(viewport());
  return () => {
    window.removeEventListener("resize", fire);
    window.removeEventListener("orientationchange", fire);
    window.visualViewport?.removeEventListener("resize", fire);
    cancelAnimationFrame(raf);
  };
}

export interface FittedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Logical size in CSS pixels; drawing code uses these, not canvas.width. */
  width: number;
  height: number;
  dpr: number;
  stop(): void;
}

/**
 * Size a canvas to its CSS box at device resolution and keep it that way.
 * `onResize` is called after every change so the game can relayout.
 */
export function fitCanvas(canvas: HTMLCanvasElement, onResize?: (c: FittedCanvas) => void): FittedCanvas {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  const fitted: FittedCanvas = { canvas, ctx, width: 1, height: 1, dpr: 1, stop: () => {} };
  const apply = (): void => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitted.width = w;
    fitted.height = h;
    fitted.dpr = dpr;
    onResize?.(fitted);
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
  ro?.observe(canvas);
  const off = onViewportChange(apply);
  fitted.stop = () => {
    ro?.disconnect();
    off();
  };
  return fitted;
}


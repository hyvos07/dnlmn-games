export type Wanted = 'landscape' | 'portrait';

/** The orientation a game requires, or `null` if any orientation works. */
export function wantedOrientation(value: string | undefined): Wanted | null {
  return value === 'landscape' || value === 'portrait' ? value : null;
}

/** True when a touch device is held the wrong way for a game that needs a specific orientation. */
export function isMismatched(wanted: Wanted | null, win: Window = window): boolean {
  if (!wanted) return false;
  if (!win.matchMedia('(pointer: coarse)').matches) return false;
  const portrait = win.matchMedia('(orientation: portrait)').matches;
  return wanted === 'landscape' ? portrait : !portrait;
}

/** Call `onChange(mismatched)` now and whenever the orientation changes. Returns a cleanup function. */
export function watchOrientation(
  wanted: Wanted | null,
  onChange: (mismatched: boolean) => void,
  win: Window = window,
): () => void {
  if (!wanted) return () => {};
  const query = win.matchMedia('(orientation: portrait)');
  const update = () => onChange(isMismatched(wanted, win));
  query.addEventListener('change', update);
  update();
  return () => query.removeEventListener('change', update);
}

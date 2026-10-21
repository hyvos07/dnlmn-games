import type { Lifecycle } from './lifecycle.ts';
import type { SdkManifest } from './types.ts';

export interface HudOptions {
  manifest: SdkManifest;
  platformPause: boolean;
  lifecycle: Lifecycle;
  exitToMenu: () => void;
  /** `KeyboardEvent.key` values (case-insensitive) the game handles itself. */
  reservedKeys: string[];
  doc?: Document;
}

export interface Hud {
  /** Show or hide the rotate-device overlay. */
  setRotatePrompt(visible: boolean, wanted: 'landscape' | 'portrait'): void;
  openHelp(): void;
  destroy(): void;
}

const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  menu: icon('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/>'),
  pause: icon('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  play: icon('<path d="M7.5 5.5v13l11-6.5z" fill="currentColor"/>'),
  sound: icon(
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  muted: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  expand: icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: icon('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  help: icon(
    '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><path d="M12 17h.01"/>',
  ),
  rotate: icon(
    '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M2.5 13a9.5 9.5 0 0 0 7 7.5M21.5 11a9.5 9.5 0 0 0-7-7.5"/>',
  ),
};

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.bar {
  position: fixed; top: max(10px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right));
  z-index: 2147483000; display: flex; gap: 2px; padding: 3px; border-radius: 14px;
  background: rgba(12, 12, 16, 0.62); border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
button {
  appearance: none; border: 0; margin: 0; padding: 0; cursor: pointer; font: inherit;
  display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px;
  background: transparent; color: #f4f1ea; transition: background 120ms, color 120ms, transform 120ms;
}
button svg { width: 20px; height: 20px; }
button:hover { background: rgba(255, 255, 255, 0.1); }
button:active { transform: scale(0.92); }
button:focus-visible { outline: 2px solid var(--games-accent, #c6ff3d); outline-offset: 1px; }
button[aria-pressed="true"] { color: var(--games-accent, #c6ff3d); }
@media (pointer: coarse) { button { width: 44px; height: 44px; } }
.layer {
  position: fixed; inset: 0; z-index: 2147482999; display: none; place-content: center; gap: 18px;
  justify-items: center; text-align: center; padding: 24px; color: #f4f1ea;
  background: rgba(8, 8, 11, 0.72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
.layer.on { display: grid; }
.big {
  margin: 0; font-family: var(--games-display-font, system-ui, sans-serif); font-weight: 800;
  font-size: clamp(40px, 11vw, 96px); line-height: 0.9; letter-spacing: -0.03em; text-transform: uppercase;
}
.hint { margin: 0; color: #a29e95; font-size: 14px; }
.cta {
  width: auto; height: auto; padding: 12px 22px; border-radius: 999px; font-weight: 700; font-size: 16px;
  background: var(--games-accent, #c6ff3d); color: var(--games-on-accent, #0c0c10);
}
.cta:hover { background: var(--games-accent, #c6ff3d); filter: brightness(1.08); }
.row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.ghost { width: auto; height: auto; padding: 12px 22px; border-radius: 999px; font-weight: 600;
  font-size: 16px; border: 1px solid rgba(255, 255, 255, 0.25); }
.rotate svg { width: 64px; height: 64px; color: var(--games-accent, #c6ff3d); animation: tilt 1.8s ease-in-out infinite; }
@keyframes tilt { 0%, 30% { transform: rotate(0); } 60%, 100% { transform: rotate(90deg); } }
@media (prefers-reduced-motion: reduce) { .rotate svg { animation: none; } button { transition: none; } }
dialog {
  width: min(460px, calc(100vw - 32px)); padding: 22px 22px 18px; border-radius: 18px; color: #f4f1ea;
  background: #16161c; border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.5;
}
dialog::backdrop { background: rgba(8, 8, 11, 0.6); }
dialog h2 { margin: 0 0 4px; font-family: var(--games-display-font, system-ui, sans-serif); font-size: 26px; letter-spacing: -0.02em; }
dialog p { margin: 0 0 14px; color: #c9c5bc; }
dialog dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 16px; }
dialog dt { color: var(--games-accent, #c6ff3d); font-weight: 700; text-transform: capitalize; }
dialog dd { margin: 0; }
kbd { font-family: ui-monospace, monospace; font-size: 12px; padding: 1px 6px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.25); }
.close { width: auto; height: auto; padding: 10px 18px; border-radius: 999px; margin-left: auto;
  background: rgba(255, 255, 255, 0.1); font-weight: 600; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<Record<string, string>> = {},
  html = '',
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props))
    if (value !== undefined) node.setAttribute(key, value);
  if (html) node.innerHTML = html;
  return node;
}

/** Mount the HUD: a corner bar plus pause, help and rotate overlays, inside a shadow root. */
export function mountHud(options: HudOptions): Hud {
  const { manifest, lifecycle, exitToMenu, platformPause } = options;
  const doc = options.doc ?? document;
  const reserved = new Set(options.reservedKeys.map((key) => key.toLowerCase()));
  const host = el(doc, 'div', { 'data-games-hud': '' });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = el(doc, 'style');
  style.textContent = STYLES;

  const bar = el(doc, 'div', { class: 'bar', role: 'toolbar', 'aria-label': 'Game controls' });
  const button = (label: string, svg: string, shortcut?: string) =>
    el(
      doc,
      'button',
      { type: 'button', 'aria-label': label, title: shortcut ? `${label} (${shortcut})` : label },
      svg,
    );
  const menuBtn = button('Back to menu', ICONS.menu);
  const pauseBtn = button('Pause', ICONS.pause, 'Esc');
  const muteBtn = button('Mute', ICONS.sound, 'M');
  const fullBtn = button('Fullscreen', ICONS.expand, 'F');
  const helpBtn = button('How to play', ICONS.help);
  bar.append(menuBtn);
  if (platformPause) bar.append(pauseBtn);
  bar.append(muteBtn);
  const canFullscreen = Boolean(doc.fullscreenEnabled && doc.documentElement.requestFullscreen);
  if (canFullscreen) bar.append(fullBtn);
  bar.append(helpBtn);

  // Pause overlay.
  const pauseLayer = el(doc, 'div', {
    class: 'layer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Paused',
  });
  const resumeBtn = el(doc, 'button', { type: 'button', class: 'cta' });
  resumeBtn.textContent = 'Resume';
  const pauseMenuBtn = el(doc, 'button', { type: 'button', class: 'ghost' });
  pauseMenuBtn.textContent = 'Menu';
  const pauseRow = el(doc, 'div', { class: 'row' });
  pauseRow.append(resumeBtn, pauseMenuBtn);
  pauseLayer.append(
    el(doc, 'p', { class: 'big', 'aria-hidden': 'true' }, 'Paused'),
    pauseRow,
    el(doc, 'p', { class: 'hint' }, 'Press <kbd>Esc</kbd> to resume'),
  );

  // Rotate prompt.
  const rotateLayer = el(doc, 'div', { class: 'layer rotate', role: 'alert' });
  const rotateText = el(doc, 'p', { class: 'hint' });
  rotateLayer.append(el(doc, 'div', {}, ICONS.rotate), rotateText);

  // Help dialog.
  const dialog = el(doc, 'dialog', { 'aria-labelledby': 'games-help-title' });
  const title = el(doc, 'h2', { id: 'games-help-title' });
  title.textContent = manifest.title;
  const description = el(doc, 'p');
  description.textContent = manifest.description ?? manifest.tagline ?? '';
  const controls = el(doc, 'dl');
  for (const [input, text] of Object.entries(manifest.controls ?? {})) {
    if (!text) continue;
    const dt = el(doc, 'dt');
    dt.textContent = input;
    const dd = el(doc, 'dd');
    dd.textContent = text;
    controls.append(dt, dd);
  }
  const shortcuts = el(
    doc,
    'p',
    {},
    (platformPause ? '<kbd>Esc</kbd> pause &middot; ' : '') +
      '<kbd>M</kbd> mute' +
      (canFullscreen ? ' &middot; <kbd>F</kbd> fullscreen' : ''),
  );
  const closeBtn = el(doc, 'button', { type: 'button', class: 'close' });
  closeBtn.textContent = 'Got it';
  dialog.append(title, description, controls, shortcuts, closeBtn);

  shadow.append(style, bar);
  if (platformPause) shadow.append(pauseLayer);
  shadow.append(rotateLayer, dialog);
  doc.body.append(host);

  let rotating = false;
  const render = () => {
    const showPause = platformPause && lifecycle.paused && !rotating && !dialog.open;
    pauseLayer.classList.toggle('on', showPause);
    rotateLayer.classList.toggle('on', rotating);
    pauseBtn.innerHTML = lifecycle.paused ? ICONS.play : ICONS.pause;
    pauseBtn.setAttribute('aria-label', lifecycle.paused ? 'Resume' : 'Pause');
    pauseBtn.setAttribute('aria-pressed', String(lifecycle.paused));
    pauseBtn.disabled = !lifecycle.playing;
    muteBtn.innerHTML = lifecycle.muted ? ICONS.muted : ICONS.sound;
    muteBtn.setAttribute('aria-label', lifecycle.muted ? 'Unmute' : 'Mute');
    muteBtn.setAttribute('aria-pressed', String(lifecycle.muted));
    const full = Boolean(doc.fullscreenElement);
    fullBtn.innerHTML = full ? ICONS.shrink : ICONS.expand;
    fullBtn.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Fullscreen');
    if (showPause) resumeBtn.focus({ preventScroll: true });
  };

  const togglePause = () => (lifecycle.paused ? lifecycle.resume() : lifecycle.pause('user'));
  const toggleFullscreen = () => {
    if (!canFullscreen) return;
    if (doc.fullscreenElement) void doc.exitFullscreen?.();
    else void doc.documentElement.requestFullscreen?.().catch(() => {});
  };
  const toggleMute = () => lifecycle.setMuted(!lifecycle.muted);
  const openHelp = () => {
    lifecycle.pause('help');
    if (!dialog.open) dialog.showModal?.();
    render();
  };
  const closeHelp = () => {
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener('close', () => {
    // Opening help paused the game; closing it resumes only that pause.
    if (lifecycle.pauseReason === 'help') lifecycle.resume();
    render();
  });

  menuBtn.addEventListener('click', exitToMenu);
  pauseMenuBtn.addEventListener('click', exitToMenu);
  pauseBtn.addEventListener('click', togglePause);
  resumeBtn.addEventListener('click', () => lifecycle.resume());
  muteBtn.addEventListener('click', toggleMute);
  fullBtn.addEventListener('click', toggleFullscreen);
  helpBtn.addEventListener('click', openHelp);
  closeBtn.addEventListener('click', closeHelp);
  // Keep HUD clicks from reaching the game (e.g. a tap-to-flap handler on window).
  for (const node of [bar, pauseLayer, rotateLayer, dialog]) {
    node.addEventListener('pointerdown', (event) => event.stopPropagation());
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const key = event.key.toLowerCase();
    if (reserved.has(key)) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
    if (key === 'escape' && platformPause) {
      if (dialog.open) return; // the dialog closes itself on Esc
      togglePause();
    } else if (key === 'm') toggleMute();
    else if (key === 'f') toggleFullscreen();
    else return;
    event.preventDefault();
  };
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('fullscreenchange', render);
  const unsubscribe = lifecycle.subscribe(render);

  return {
    setRotatePrompt(visible, wanted) {
      rotating = visible;
      rotateText.textContent = `Rotate your device to ${wanted} to play`;
      render();
    },
    openHelp,
    destroy() {
      unsubscribe();
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('fullscreenchange', render);
      host.remove();
    },
  };
}

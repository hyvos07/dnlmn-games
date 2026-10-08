/**
 * Dev only (never in production builds): compare accent presets live.
 * Use `?accent=coral` or the picker in the bottom-left corner. To ship one, set
 * `ACCENT` in packages/config/src/theme.ts.
 */
import { ACCENT, ACCENT_NAMES, ACCENTS, type AccentName } from '@games/config/theme';

const root = document.documentElement;

function apply(name: AccentName): void {
  const preset = ACCENTS[name];
  root.style.setProperty('--accent', preset.accent);
  root.style.setProperty('--on-accent', preset.onAccent);
  root.style.setProperty('--accent-text-dark', preset.accentTextDark);
  root.style.setProperty('--accent-text-light', preset.accentTextLight);
  root.style.setProperty('--secondary', preset.secondary);
  window.dispatchEvent(new CustomEvent('accentchange'));
}

const isAccent = (value: string | null): value is AccentName =>
  value !== null && (ACCENT_NAMES as string[]).includes(value);

const fromUrl = new URLSearchParams(location.search).get('accent');
let currentName: AccentName = isAccent(fromUrl) ? fromUrl : ACCENT;
if (currentName !== ACCENT) apply(currentName);

const picker = document.createElement('label');
picker.style.cssText =
  'position:fixed;left:12px;bottom:12px;z-index:100;display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:999px;background:#16161c;color:#f4f1ea;font:600 13px system-ui;border:1px solid #2a2a33';
picker.textContent = 'Accent (dev)';
const select = document.createElement('select');
select.style.cssText =
  'font:inherit;background:#0c0c10;color:inherit;border-radius:6px;padding:2px 4px';
for (const name of ACCENT_NAMES) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name === ACCENT ? `${name} (shipped)` : name;
  option.selected = name === currentName;
  select.append(option);
}
select.addEventListener('change', () => {
  if (!isAccent(select.value)) return;
  currentName = select.value;
  apply(currentName);
  const url = new URL(location.href);
  url.searchParams.set('accent', currentName);
  history.replaceState(history.state, '', url);
});
picker.append(select);
document.body.append(picker);

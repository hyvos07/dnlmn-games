const STYLE_ID = 'games-sdk-mobile';

/**
 * Mobile-friendly defaults: no pull-to-refresh or overscroll bounce, no double-tap zoom,
 * no long-press callout or context menu on the game root.
 */
export function applyMobileDefaults(root: HTMLElement, doc: Document = document): () => void {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `html,body{overscroll-behavior:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}`;
    doc.head.append(style);
  }
  root.style.touchAction = 'none';
  root.style.userSelect = 'none';
  root.style.setProperty('-webkit-user-select', 'none');
  root.style.setProperty('-webkit-touch-callout', 'none');
  const block = (event: Event) => event.preventDefault();
  root.addEventListener('contextmenu', block);
  // Safari ignores touch-action for pinch zoom inside the page; block gesture events too.
  root.addEventListener('gesturestart', block);
  return () => {
    root.removeEventListener('contextmenu', block);
    root.removeEventListener('gesturestart', block);
  };
}

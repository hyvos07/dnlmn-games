/** A centered, keyboard-accessible mode menu without the native popup's checkmark gutter. */
export function setupModeSelect(root: HTMLElement): void {
  const value = root.querySelector<HTMLInputElement>('#mode');
  const toggle = root.querySelector<HTMLButtonElement>('#mode-toggle');
  const label = root.querySelector<HTMLElement>('#mode-label');
  const list = root.querySelector<HTMLElement>('#mode-options');
  const options = [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  if (!value || !toggle || !label || !list || options.length === 0) {
    throw new Error('Missing mode menu elements');
  }

  const close = (restoreFocus = false) => {
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  const focusOption = (index: number) => {
    options[(index + options.length) % options.length]?.focus({ preventScroll: true });
  };
  const open = () => {
    list.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    root.dataset.openAbove = 'false';
    root.dataset.openAbove = String(list.getBoundingClientRect().bottom > innerHeight - 12);
    focusOption(options.findIndex((option) => option.dataset.value === value.value));
  };

  toggle.addEventListener('click', () => (list.hidden ? open() : close()));
  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    open();
  });
  for (const option of options) {
    option.addEventListener('click', () => {
      value.value = option.dataset.value ?? 'timed';
      label.textContent = option.textContent;
      toggle.setAttribute('aria-label', `Game mode: ${option.textContent}`);
      for (const item of options) item.setAttribute('aria-selected', String(item === option));
      close(true);
      value.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  list.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        focusOption(index + (event.key === 'ArrowDown' ? 1 : -1));
        break;
      case 'Home':
      case 'End':
        event.preventDefault();
        focusOption(event.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(true);
        break;
      default:
        if (event.key.length === 1 && event.key !== ' ') {
          const match = options.findIndex((option) =>
            option.textContent?.toLowerCase().startsWith(event.key.toLowerCase()),
          );
          if (match >= 0) {
            event.preventDefault();
            focusOption(match);
          }
        }
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target as Node)) close();
  });
  document.addEventListener('focusin', (event) => {
    if (!root.contains(event.target as Node)) close();
  });
}

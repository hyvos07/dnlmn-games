/** Auto-start the page-local toy; the error message remains usable without JS. */
export function bootShooter(): void {
  const root = document.querySelector<HTMLElement>('[data-shooter]');
  if (!root) return;
  // Let the static error message paint before loading gameplay.
  requestAnimationFrame(() => {
    setTimeout(() => {
      void import('./error-shooter.ts')
        .then(({ mountShooter }) => {
          mountShooter(root);
        })
        .catch(() => {
          const status = root.querySelector<HTMLElement>('[data-shooter-status]');
          if (status)
            status.textContent =
              'The ship is offline. Refresh to try again, or head back to the games.';
        });
    }, 0);
  });
}

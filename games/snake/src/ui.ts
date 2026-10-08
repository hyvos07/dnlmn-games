/** DOM chrome around the canvas: score bar, title screen and game-over card. */

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing from index.html`);
  return node as T;
};

export class Ui {
  readonly stage = $<HTMLElement>('stage');
  readonly canvas = $<HTMLCanvasElement>('board');
  private readonly score = $<HTMLOutputElement>('score');
  private readonly best = $<HTMLOutputElement>('best');
  private readonly start = $<HTMLElement>('start');
  private readonly over = $<HTMLElement>('over');
  private readonly overKicker = $<HTMLElement>('over-kicker');
  private readonly overScore = $<HTMLElement>('over-score');
  private readonly overBest = $<HTMLElement>('over-best');
  readonly playButton = $<HTMLButtonElement>('play');
  readonly againButton = $<HTMLButtonElement>('again');

  setScore(value: number, bump = false): void {
    this.score.value = String(value);
    if (bump) this.bump(this.score);
  }

  setBest(value: number): void {
    this.best.value = String(value);
  }

  showStart(): void {
    this.over.hidden = true;
    this.start.hidden = false;
    this.stage.dataset.mode = 'attract';
  }

  showPlaying(): void {
    this.start.hidden = true;
    this.over.hidden = true;
    this.stage.dataset.mode = 'playing';
    // Keep keyboard focus off the (now hidden) buttons so Space doesn't re-click them.
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  showOver(score: number, best: number, newBest: boolean, won: boolean): void {
    this.overKicker.textContent = won ? 'Board cleared!' : newBest ? 'New best!' : 'Game over';
    this.overKicker.classList.toggle('accent', newBest || won);
    this.overScore.textContent = String(score);
    this.overBest.textContent = newBest ? 'Previous best beaten' : `Best ${best}`;
    this.over.hidden = false;
    this.stage.dataset.mode = 'over';
    this.againButton.focus({ preventScroll: true });
  }

  private bump(node: HTMLElement): void {
    node.classList.remove('bump');
    // Force a reflow so the animation restarts on rapid eats.
    void node.offsetWidth;
    node.classList.add('bump');
  }
}

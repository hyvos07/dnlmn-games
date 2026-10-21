import { getAccent } from '@games/config/theme';
import { type Game, initGame } from '@games/sdk';
import manifest from '../game.json';
import { BoardView } from './board-view.ts';
import { bindInput } from './input.ts';
import { type Direction, GameManager, readSave } from './logic/rules.ts';
import { MergeSound } from './sound.ts';

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export class TwentyFortyEight {
  private readonly board = element('board');
  private readonly view = new BoardView(this.board, element('tiles'));
  private readonly sound = new MergeSound();
  private readonly sdk: Game;
  private manager: GameManager;
  private best = 0;
  private started = false;
  private hasSave = false;
  private readonly dialog = element<HTMLDialogElement>('restart-dialog');
  private readonly overlay = element('overlay');
  private readonly resetPointer: () => void;
  private demoTimer = 0;

  constructor() {
    const accent = getAccent();
    document.documentElement.style.setProperty('--games-accent', accent.accent);
    document.documentElement.style.setProperty('--games-on-accent', accent.onAccent);
    this.sdk = initGame(manifest, {
      root: element('stage'),
      onPause: () => {
        this.resetPointer?.();
        this.view.pause();
        this.sound.mute(true);
      },
      onResume: () => {
        this.resetPointer?.();
        this.view.resume();
        this.sound.mute(this.sdk.muted);
      },
      onMuteChange: (muted) => this.sound.mute(muted || this.sdk.paused),
    });
    this.sdk.setPlaying(false);
    this.board.inert = true;
    this.sdk.onUnlock(() => {
      this.sound.unlock();
      this.sound.mute(this.sdk.muted || this.sdk.paused);
    });
    const saved = readSave(this.sdk.storage.get<unknown>('board-v1', null));
    this.hasSave = !!saved && !saved.over;
    this.manager = new GameManager(Math.random, this.hasSave ? saved : undefined);
    if (!this.manager.movesAvailable()) this.manager.over = true;
    const best = this.sdk.storage.get<unknown>('highscore', 0);
    this.best = typeof best === 'number' && Number.isSafeInteger(best) && best >= 0 ? best : 0;
    this.best = Math.max(this.best, this.manager.score);
    element('best').textContent = String(this.best);
    this.view.render(this.manager.grid, false);
    element('score').textContent = String(this.manager.score);
    if (this.hasSave) {
      element('overlay-title').textContent = 'Room for one more?';
      element('overlay-copy').textContent = 'Your board is right where you left it.';
      element('play').textContent = 'Resume game';
    } else {
      this.startDemo();
    }
    this.resetPointer = bindInput(
      this.board,
      (direction) => this.move(direction),
      () =>
        this.started && !this.sdk.paused && !this.dialog.open && !this.manager.isGameTerminated(),
    );
    element('play').addEventListener('click', () => this.start(false));
    element('retry').addEventListener('click', () => this.start(true));
    element('continue').addEventListener('click', () => {
      this.manager.continue();
      this.update();
      this.board.focus({ preventScroll: true });
    });
    element('new-game').addEventListener('click', () => {
      if ((!this.started && !this.hasSave) || this.manager.over) return this.start(true);
      this.resetPointer();
      this.view.pause();
      this.dialog.showModal();
      element('cancel-restart').focus();
    });
    element('cancel-restart').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('keydown', (event) => {
      // Keep Escape scoped to native dialog cancellation.
      if (event.key === 'Escape') event.stopPropagation();
    });
    this.dialog.addEventListener('close', () => {
      if (!this.sdk.paused) this.view.resume();
      this.resetPointer();
    });
    element('confirm-restart').addEventListener('click', () => {
      this.dialog.close();
      this.start(true);
    });
    window.addEventListener('pagehide', () => clearInterval(this.demoTimer));
  }

  private startDemo(): void {
    // Real rules and moves, isolated from the player's board, saves and score.
    let demo = new GameManager();
    let step = 0;
    const directions: Direction[] = [3, 2, 3, 0, 3, 2, 1, 2];
    this.demoTimer = window.setInterval(() => {
      if (
        document.hidden ||
        this.dialog.open ||
        this.started ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const direction = directions[step++ % directions.length] ?? 3;
      if (demo.over || demo.won) demo = new GameManager();
      if (demo.move(direction)) this.view.render(demo.grid);
    }, 700);
  }

  private start(fresh: boolean): void {
    clearInterval(this.demoTimer);
    this.resetPointer();
    if (fresh) this.manager = new GameManager();
    element('score-gain').textContent = '';
    this.started = true;
    this.view.render(this.manager.grid, false);
    this.update();
    if (!this.manager.isGameTerminated()) this.board.focus({ preventScroll: true });
  }

  private move(direction: Direction): void {
    const before = this.manager.score;
    if (!this.manager.move(direction)) return;
    const gain = this.manager.score - before;
    this.view.render(this.manager.grid);
    if (gain) {
      this.sound.play(gain);
      element('score-gain').textContent = `+${gain}`;
    } else {
      element('score-gain').textContent = '';
    }
    this.update();
  }

  private update(): void {
    const manager = this.manager;
    this.best = Math.max(this.best, manager.score);
    this.sdk.storage.set('highscore', this.best);
    if (manager.over) this.sdk.storage.remove('board-v1');
    else this.sdk.storage.set('board-v1', manager.serialize());
    element('score').textContent = String(manager.score);
    element('best').textContent = String(this.best);
    element('play').hidden = true;
    element('continue').hidden = !manager.won || manager.over || manager.keepPlaying;
    element('retry').hidden = !manager.isGameTerminated();
    this.overlay.hidden = !manager.isGameTerminated();
    this.board.inert = manager.isGameTerminated();
    if (manager.isGameTerminated()) {
      element('overlay-title').textContent = manager.over ? 'No more moves.' : '2048. Nicely done.';
      element('overlay-copy').textContent = manager.over
        ? `You made ${manager.score.toLocaleString()} points. Ready for another?`
        : 'You reached 2048. Keep going and see how big you can get.';
      element(manager.over ? 'retry' : 'continue').focus({ preventScroll: true });
    }
    this.sdk.setPlaying(!manager.isGameTerminated());
    element('status').textContent = manager.over
      ? `No more moves. Final score ${manager.score}.`
      : manager.won && !manager.keepPlaying
        ? 'You reached 2048! Keep going or play again.'
        : `Score ${manager.score}. ${manager.grid.availableCells().length} empty cells.`;
  }
}

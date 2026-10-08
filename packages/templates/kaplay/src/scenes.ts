import type { Game } from '@games/sdk';
import type { GameObj, KAPLAYCtx, PosComp } from 'kaplay';
import { approach, clampX, fallSpeed, pickX, spawnDelay } from './logic/dodge.ts';

const PAPER = '#f4f1ea';
const MUTED = '#a29e95';
const ACCENT = '#c6ff3d';
const HAZARD = '#ff5c8a';

const PLAYER_SIZE = 40;
/** Distance from the bottom edge to the player's centre. */
const PLAYER_BOTTOM = 70;
const PLAYER_SPEED = 520;
const HAZARD_SIZE = 36;
/** Ignore restart input briefly after a crash, so a stray tap doesn't skip the result. */
const RESTART_GRACE = 0.5;

export interface Deps {
  k: KAPLAYCtx;
  game: Game;
  blip: (freq: number, seconds?: number) => void;
}

/**
 * KAPLAY organises a game into scenes. `play` is a run; `over` shows the result.
 * Everything that is not a scene, such as setup, the HUD and saved data, lives in main.ts.
 */
export function registerScenes({ k, game, blip }: Deps): void {
  k.scene('play', () => {
    game.setPlaying(true);
    let elapsed = 0;
    let sinceSpawn = 0;
    let score = 0;

    const player = k.add([
      k.rect(PLAYER_SIZE, PLAYER_SIZE, { radius: 8 }),
      k.pos(k.width() / 2, k.height() - PLAYER_BOTTOM),
      k.anchor('center'),
      k.color(ACCENT),
      k.area(),
      'player',
    ]);

    const scoreLabel = k.add([
      k.text('0', { size: 28 }),
      k.pos(16, 14),
      k.color(PAPER),
      k.fixed(),
      k.z(10),
    ]);

    // The screen can change size (window resize, phone rotation): keep the player on it.
    k.onResize(() => {
      player.pos.y = k.height() - PLAYER_BOTTOM;
      player.pos.x = clampX(player.pos.x, k.width(), PLAYER_SIZE);
    });

    player.onUpdate(() => {
      // Keyboard moves at a steady speed; a finger or mouse drags the player toward it.
      // `touchToMouse` (on by default) makes a touch look like the mouse.
      const step = PLAYER_SPEED * k.dt();
      let x = player.pos.x;
      if (k.isKeyDown(['left', 'a'])) x -= step;
      if (k.isKeyDown(['right', 'd'])) x += step;
      if (k.isMouseDown()) x = approach(x, k.mousePos().x, step * 1.6);
      player.pos.x = clampX(x, k.width(), PLAYER_SIZE);
    });

    k.onUpdate(() => {
      elapsed += k.dt();
      sinceSpawn += k.dt();
      if (sinceSpawn < spawnDelay(elapsed)) return;
      sinceSpawn = 0;

      const hazard = k.add([
        k.rect(HAZARD_SIZE, HAZARD_SIZE, { radius: 6 }),
        k.pos(pickX(Math.random, k.width(), HAZARD_SIZE), -HAZARD_SIZE),
        k.anchor('center'),
        k.color(HAZARD),
        k.area(),
        'hazard',
      ]);
      hazard.onUpdate(() => {
        hazard.pos.y += fallSpeed(elapsed) * k.dt();
        if (hazard.pos.y < k.height() + HAZARD_SIZE) return;
        hazard.destroy();
        score += 1;
        scoreLabel.text = String(score);
        if (score % 10 === 0) blip(660, 0.18);
      });
    });

    player.onCollide('hazard', () => {
      blip(110, 0.35);
      k.shake(14);
      const best = game.storage.get<number>('highscore', 0);
      if (score > best) game.storage.set('highscore', score);
      game.setPlaying(false);
      k.go('over', score, best);
    });
  });

  k.scene('over', (score: number, previousBest: number) => {
    const isBest = score > previousBest;
    // Each line sits at a fixed offset from the screen centre, and moves with it on resize.
    const lines: Array<{ obj: GameObj<PosComp>; y: number }> = [];
    const line = (text: string, y: number, size: number, color: string) => {
      const obj = k.add([
        k.text(text, { size, align: 'center', width: k.width() - 32 }),
        k.pos(k.center().x, k.center().y + y),
        k.anchor('center'),
        k.color(color),
      ]);
      lines.push({ obj, y });
    };

    line('Game over', -80, 48, PAPER);
    line(`Score ${score}`, -20, 32, ACCENT);
    line(isBest ? 'New best!' : `Best ${previousBest}`, 24, 24, isBest ? HAZARD : MUTED);
    line('Tap or press Space to play again', 90, 20, MUTED);
    k.onResize(() => {
      for (const { obj, y } of lines) obj.pos = k.vec2(k.center().x, k.center().y + y);
    });

    let ready = false;
    k.wait(RESTART_GRACE, () => {
      ready = true;
    });
    const again = () => {
      if (ready) k.go('play');
    };
    k.onKeyPress(['space', 'enter'], again);
    k.onClick(again);
  });
}

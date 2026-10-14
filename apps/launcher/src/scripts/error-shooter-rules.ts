export const FIELD_WIDTH = 360;
export const FIELD_HEIGHT = 400;
export const SHIP_Y = FIELD_HEIGHT - 46;

export interface Enemy {
  id: number;
  x: number;
  y: number;
  homeX: number;
  phase: number;
}
export interface Shot {
  id: number;
  x: number;
  y: number;
  hostile: boolean;
}
export interface ShooterState {
  shipX: number;
  shipY: number;
  targetX: number;
  targetY: number;
  score: number;
  shields: number;
  wave: number;
  elapsed: number;
  invulnerable: number;
  fireIn: number;
  hostileIn: number;
  waveIn: number;
  over: boolean;
  nextId: number;
  enemies: Enemy[];
  shots: Shot[];
}
export interface Hit {
  x: number;
  y: number;
  kind: 'enemy' | 'ship';
}

function spawnWave(state: ShooterState): void {
  state.wave++;
  const rows = Math.min(3, 1 + state.wave);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < 4; column++) {
      const x = 60 + column * 80;
      state.enemies.push({ id: state.nextId++, x, homeX: x, y: 78 + row * 43, phase: row * 0.6 });
    }
  }
}

export function createShooter(): ShooterState {
  const state: ShooterState = {
    shipX: FIELD_WIDTH / 2,
    shipY: SHIP_Y,
    targetX: FIELD_WIDTH / 2,
    targetY: SHIP_Y,
    score: 0,
    shields: 3,
    wave: 0,
    elapsed: 0,
    invulnerable: 0,
    fireIn: 0,
    hostileIn: 1.7,
    waveIn: 0,
    over: false,
    nextId: 1,
    enemies: [],
    shots: [],
  };
  spawnWave(state);
  return state;
}

export function steer(state: ShooterState, x: number, y = state.targetY): void {
  state.targetX = Math.max(22, Math.min(FIELD_WIDTH - 22, x));
  state.targetY = Math.max(72, Math.min(FIELD_HEIGHT - 28, y));
}

/** Pointer mode is a direct game cursor, rather than a ship chasing a target. */
export function followPointer(state: ShooterState, x: number, y: number): void {
  steer(state, x, y);
  state.shipX = state.targetX;
  state.shipY = state.targetY;
}

/** Caller uses fixed 1/60-second steps so fast lasers cannot tunnel through enemies. */
export function stepShooter(state: ShooterState, dt: number): Hit[] {
  if (state.over || dt <= 0) return [];
  const hits: Hit[] = [];
  state.elapsed += dt;
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  const dx = state.targetX - state.shipX;
  const dy = state.targetY - state.shipY;
  const distance = Math.hypot(dx, dy);
  const movement = distance ? Math.min(1, (340 * dt) / distance) : 0;
  state.shipX += dx * movement;
  state.shipY += dy * movement;
  state.fireIn -= dt;
  state.hostileIn -= dt;
  if (state.fireIn <= 0) {
    state.shots.push({ id: state.nextId++, x: state.shipX, y: state.shipY - 20, hostile: false });
    state.fireIn += 0.23;
  }
  if (state.hostileIn <= 0 && state.enemies.length) {
    const index = Math.floor(state.elapsed * 3) % state.enemies.length;
    const enemy = state.enemies[index];
    if (enemy) state.shots.push({ id: state.nextId++, x: enemy.x, y: enemy.y + 16, hostile: true });
    state.hostileIn = Math.max(0.55, 1.7 - state.wave * 0.1);
  }

  const damage = (x: number, y: number): void => {
    if (state.invulnerable > 0) return;
    state.shields--;
    state.invulnerable = 1.2;
    hits.push({ x, y, kind: 'ship' });
    if (state.shields <= 0) state.over = true;
  };

  for (const enemy of state.enemies) {
    enemy.x = enemy.homeX + Math.sin(state.elapsed * 1.7 + enemy.phase) * 22;
    enemy.y += Math.min(45, 9 + state.wave * 2.5) * dt;
  }
  for (const shot of state.shots) {
    const before = shot.y;
    shot.y += (shot.hostile ? 110 + Math.min(80, state.wave * 10) : -460) * dt;
    if (shot.hostile) {
      if (
        Math.abs(shot.x - state.shipX) < 17 &&
        before <= state.shipY + 12 &&
        shot.y >= state.shipY - 14
      ) {
        damage(state.shipX, state.shipY);
        shot.y = FIELD_HEIGHT + 40;
      }
    } else {
      const enemy = state.enemies.find(
        (item) => Math.abs(shot.x - item.x) < 19 && before >= item.y - 14 && shot.y <= item.y + 14,
      );
      if (enemy) {
        state.score += 100;
        hits.push({ x: enemy.x, y: enemy.y, kind: 'enemy' });
        state.enemies = state.enemies.filter((item) => item.id !== enemy.id);
        shot.y = -40;
      }
    }
  }
  state.shots = state.shots.filter((shot) => shot.y > -30 && shot.y < FIELD_HEIGHT + 30);
  state.enemies = state.enemies.filter((enemy) => {
    if (Math.abs(enemy.x - state.shipX) < 30 && Math.abs(enemy.y - state.shipY) < 25) {
      damage(state.shipX, state.shipY);
      return false;
    }
    // The breach line stays fixed even when the pilot flies upward.
    if (enemy.y < SHIP_Y - 24) return true;
    damage(state.shipX, state.shipY);
    return false;
  });
  if (!state.enemies.length && !state.over) {
    state.waveIn += dt;
    if (state.waveIn >= 0.8) {
      state.waveIn = 0;
      spawnWave(state);
    }
  }
  return hits;
}

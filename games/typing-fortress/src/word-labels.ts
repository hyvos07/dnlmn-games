import { candidates, type GameState } from './logic/game.ts';
import type { Battlefield } from './render/battlefield.ts';

interface Label {
  root: HTMLDivElement;
  prefix: HTMLSpanElement;
  rest: HTMLSpanElement;
  health: HTMLSpanElement;
}

export class WordLabels {
  private readonly items = new Map<number, Label>();
  private readonly errors = new Map<number, number>();

  constructor(private readonly container: HTMLElement) {}

  clear(): void {
    this.container.replaceChildren();
    this.items.clear();
    this.errors.clear();
  }

  mistake(id: number | null, elapsed: number): void {
    if (id !== null) this.errors.set(id, elapsed + 0.45);
  }

  update(state: GameState, battlefield: Battlefield): void {
    const current = new Set(state.enemies.map((enemy) => enemy.id));
    for (const [id, label] of this.items) {
      if (!current.has(id)) {
        label.root.remove();
        this.items.delete(id);
        this.errors.delete(id);
      }
    }
    const matches = new Set(candidates(state).map((enemy) => enemy.id));
    const ordered = [...state.enemies].sort(
      (a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.id - b.id,
    );
    const nearest = ordered.find((enemy) => !state.buffer || matches.has(enemy.id))?.id;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const enemy of ordered) {
      let label = this.items.get(enemy.id);
      if (!label) {
        const root = document.createElement('div');
        root.className = 'enemy-word';
        const prefix = document.createElement('span');
        prefix.className = 'word-prefix';
        const rest = document.createElement('span');
        rest.className = 'word-rest';
        const health = document.createElement('span');
        health.className = 'enemy-pips';
        root.append(prefix, rest, health);
        this.container.append(root);
        label = { root, prefix, rest, health };
        this.items.set(enemy.id, label);
      }
      const active = state.buffer.length > 0 && matches.has(enemy.id);
      const count = active ? state.buffer.length : 0;
      const prefix = enemy.word.slice(0, count);
      const rest = enemy.word.slice(count);
      const health =
        enemy.maxHp > 1 ? `${'◆'.repeat(enemy.hp)}${'◇'.repeat(enemy.maxHp - enemy.hp)}` : '';
      if (label.prefix.textContent !== prefix) label.prefix.textContent = prefix;
      if (label.rest.textContent !== rest) label.rest.textContent = rest;
      if (label.health.textContent !== health) label.health.textContent = health;
      label.root.dataset.enemyId = String(enemy.id);
      label.root.dataset.word = enemy.word;
      label.root.dataset.kind = enemy.kind;
      label.root.dataset.health = String(enemy.hp);
      label.root.classList.toggle('is-matching', active);
      label.root.classList.toggle('is-nearest', nearest === enemy.id);
      label.root.classList.toggle('is-error', (this.errors.get(enemy.id) ?? 0) > state.elapsed);
      const position = battlefield.project(enemy.x, enemy.z, enemy.kind === 'crawler' ? 1.3 : 1.9);
      label.root.hidden = !position.visible;
    }
    // Batch all measurements after content updates, before positioning any label.
    const sizes = new Map(
      [...this.items].map(([id, label]) => [
        id,
        { width: label.root.offsetWidth, height: label.root.offsetHeight },
      ]),
    );
    for (const enemy of ordered) {
      const label = this.items.get(enemy.id);
      const size = sizes.get(enemy.id);
      if (!label || !size) continue;
      const position = battlefield.project(enemy.x, enemy.z, enemy.kind === 'crawler' ? 1.3 : 1.9);
      if (!position.visible) continue;
      // Measure the actual word, padding, and elite pips, rather than guessing by length.
      const labelWidth = size.width;
      const labelHeight = size.height;
      const x = Math.max(labelWidth / 2 + 8, Math.min(width - labelWidth / 2 - 8, position.x));
      const floor = Math.max(130, height - 150);
      let y = Math.max(112, Math.min(floor, position.y - 8));
      for (let attempt = 0; attempt < 8; attempt++) {
        const overlap = placed.some(
          (other) =>
            Math.abs(x - other.x) < (labelWidth + other.width) / 2 + 6 &&
            y - labelHeight < other.y + 6 &&
            y + 6 > other.y - other.height,
        );
        if (!overlap) break;
        y = Math.max(
          112,
          Math.min(
            floor,
            position.y - 8 + (attempt % 2 ? -1 : 1) * (Math.floor(attempt / 2) + 1) * 36,
          ),
        );
      }
      placed.push({ x, y, width: labelWidth, height: labelHeight });
      label.root.style.left = `${x}px`;
      label.root.style.top = `${y}px`;
    }
  }
}

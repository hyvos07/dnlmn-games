import type { Enemy } from '../logic/game';
import { palette as p, ShapeBuilder } from './geometry';

export function buildLandscape(): ShapeBuilder {
  const shapes = new ShapeBuilder();
  shapes.prism(0, -0.55, 0, 38, 0.45, p.soil, 72);
  // Low, irregular facets retain a level gameplay plane while giving the valley relief.
  const rings = [0, 3.6, 7.5, 11.8, 16.1];
  const point = (radius: number, angle: number): readonly [number, number, number] => {
    const distance = radius + Math.sin(angle * 5 + radius) * (radius / 16) * 0.55;
    return [
      Math.cos(angle) * distance,
      -0.085 + Math.sin(angle * 3 + radius) * 0.014,
      Math.sin(angle) * distance,
    ];
  };
  for (let layer = 1; layer < rings.length; layer++) {
    const inner = rings[layer - 1] ?? 0;
    const outer = rings[layer] ?? 16;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const b = ((i + 1) / 36) * Math.PI * 2;
      const variation = Math.sin(i * 2.7 + layer * 4) * 0.008;
      const green = 0.195 - layer * 0.004 + variation;
      const color = [green * 0.65, green, green * 0.79] as const;
      shapes.triangle(point(inner, a), point(outer, b), point(outer, a), color);
      shapes.triangle(point(inner, a), point(inner, b), point(outer, b), color);
    }
  }
  shapes.prism(0, -0.08, 0, 3.5, 0.14, p.stoneDark, 16);
  shapes.ring(3.33, 0.085, 0.07, [0.34, 0.41, 0.33], 0, 48);
  shapes.ring(3.8, 0.026, -0.015, p.rune, 0.28);
  // Deterministic original landscape: scattered angular stones and outer pines.
  for (let i = 0; i < 100; i++) {
    const a = i * 2.39996;
    const radius = 4.8 + ((i * 7.37) % 14);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const size = 0.13 + ((i * 0.317) % 0.45);
    shapes.prism(x, -0.12, z, size, size * 0.7, i % 3 ? p.moss : p.stoneDark, 5, size * 0.6, 0, a);
    if (i % 5 === 0) {
      shapes.prism(x + 0.15, -0.04, z + 0.1, 0.08, 0.24, p.teal, 5, 0, 0.6);
    }
  }
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996 + 0.3;
    const radius = 16 + (i % 4) * 1.25;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const h = 1.5 + (i % 3) * 0.3;
    shapes.prism(x, -0.1, z, 0.12, h, [0.16, 0.18, 0.13], 5);
    shapes.prism(x, 0.4, z, 0.7, h * 0.9, [0.055, 0.15, 0.13], 5, 0);
    shapes.prism(x, 1, z, 0.52, h * 0.7, [0.1, 0.23, 0.17], 5, 0);
  }
  // Ring of broken ancient standing stones at the edge of the playable valley.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.23;
    const x = Math.cos(a) * 15.8;
    const z = Math.sin(a) * 15.8;
    shapes.prism(x, 0, z, 0.35, 0.8 + (i % 3) * 0.3, p.stoneDark, 4, 0.26, 0, a);
    shapes.crystal(x, 0.6, z, 0.065, 0.18, p.teal, 0.7);
  }
  return shapes;
}

/** One translucent draw gives static objects contact with the ground, without shadow maps. */
export function buildContactShadows(): ShapeBuilder {
  const shapes = new ShapeBuilder();
  const shade = [0.018, 0.032, 0.021] as const;
  shapes.ellipse(0.3, 0.46, 3.5, 3.4, 0.025, shade);
  for (let i = 0; i < 100; i++) {
    const a = i * 2.39996;
    const radius = 4.8 + ((i * 7.37) % 14);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const size = 0.13 + ((i * 0.317) % 0.45);
    shapes.ellipse(x + size * 0.16, z + size * 0.23, size * 1.17, size * 0.88, -0.045, shade);
  }
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996 + 0.3;
    const radius = 16 + (i % 4) * 1.25;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    shapes.ellipse(x + 0.18, z + 0.3, 0.8, 0.68, -0.065, shade);
  }
  return shapes;
}

export function buildFortress(): ShapeBuilder {
  const shapes = new ShapeBuilder();
  // Layered foundation and warm stone courtyard.
  shapes.box(0, 0.18, 0, 4.4, 0.35, 4.4, p.stoneDark);
  shapes.box(0, 0.37, 0, 3.8, 0.12, 3.8, [0.4, 0.42, 0.32]);
  // Four curtain walls; the southern wall has an open-looking inset gate.
  shapes.box(0, 0.93, -1.83, 3.9, 1.15, 0.35, p.stone);
  shapes.box(-1.83, 0.93, 0, 0.35, 1.15, 3.9, p.stone);
  shapes.box(1.83, 0.93, 0, 0.35, 1.15, 3.9, p.stone);
  shapes.box(-1.35, 0.93, 1.83, 1.15, 1.15, 0.35, p.stone);
  shapes.box(1.35, 0.93, 1.83, 1.15, 1.15, 0.35, p.stone);
  shapes.box(0, 1.45, 1.83, 1.5, 0.33, 0.4, p.stoneLight);
  shapes.box(0, 0.77, 1.83, 1.12, 0.77, 0.2, [0.13, 0.19, 0.17]);
  for (let i = -3; i <= 3; i++) {
    shapes.box(i * 0.14, 0.78, 1.96, 0.045, 0.83, 0.07, [0.37, 0.31, 0.2]);
  }
  for (let i = -3; i <= 3; i++) {
    for (const side of [-1, 1]) {
      shapes.box(i * 0.47, 1.62, side * 1.83, 0.25, 0.32, 0.42, p.stoneLight);
      shapes.box(side * 1.83, 1.62, i * 0.47, 0.42, 0.32, 0.25, p.stoneLight);
      shapes.box(i * 0.47, 0.79, side * 2.016, 0.075, 0.27, 0.025, [0.16, 0.23, 0.2]);
      shapes.box(side * 2.016, 0.79, i * 0.47, 0.025, 0.27, 0.075, [0.16, 0.23, 0.2]);
    }
  }
  // Corner towers, crenellations and witch-hat copper roofs.
  for (const x of [-1.77, 1.77]) {
    for (const z of [-1.77, 1.77]) {
      shapes.prism(x, 0.25, z, 0.56, 1.75, p.stone, 8);
      shapes.prism(x, 1.8, z, 0.66, 0.15, p.stoneLight, 8);
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        shapes.box(
          x + Math.cos(a) * 0.54,
          2.06,
          z + Math.sin(a) * 0.54,
          0.18,
          0.3,
          0.18,
          p.stoneLight,
        );
      }
      shapes.prism(x, 2.15, z, 0.51, 0.7, p.roof, 8, 0);
      shapes.crystal(x, 2.92, z, 0.07, 0.21, p.gold, 0.9);
      shapes.box(x, 1.29, z + 0.555, 0.13, 0.24, 0.04, p.gold);
    }
  }
  // Heartstone altar and ceremonial gold trim.
  shapes.prism(0, 0.42, 0, 0.92, 0.37, p.stoneDark, 8);
  shapes.prism(0, 0.79, 0, 0.84, 0.12, p.stoneLight, 8);
  shapes.prism(0, 0.91, 0, 0.63, 0.3, p.roof, 8, 0.47);
  shapes.ring(0.95, 0.035, 0.435, p.gold, 0.65, 32);
  shapes.ring(1.15, 0.028, 0.435, p.rune, 0.55, 32);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    shapes.box(Math.sin(a) * 1.1, 0.45, Math.cos(a) * 1.1, 0.1, 0.025, 0.1, p.gold);
  }
  // Steps leading to the gate.
  for (let i = 0; i < 3; i++) {
    shapes.box(0, 0.06 + i * 0.07, 2.8 - i * 0.26, 1.25, 0.12, 0.29, p.stone);
  }
  return shapes;
}

export function buildEnemy(kind: Enemy['kind']): ShapeBuilder {
  const shapes = new ShapeBuilder();
  if (kind === 'crawler') {
    shapes.prism(0, 0.2, 0, 0.4, 0.33, [0.38, 0.48, 0.36], 5, 0.27);
    shapes.prism(0, 0.35, -0.35, 0.22, 0.18, p.stoneLight, 5, 0.15);
    for (const side of [-1, 1]) {
      for (const z of [-0.25, 0.22]) {
        shapes.crystal(side * 0.4, 0.2, z, 0.14, 0.43, p.stoneDark);
      }
      shapes.crystal(side * 0.09, 0.46, -0.49, 0.055, 0.12, p.gold, 1);
    }
    shapes.crystal(0, 0.57, 0, 0.085, 0.28, p.teal, 0.8);
  } else if (kind === 'wisp') {
    shapes.crystal(0, 0.55, 0, 0.23, 0.72, p.violet, 0.65);
    shapes.crystal(-0.28, 0.5, 0, 0.09, 0.26, [0.5, 0.38, 0.65], 0.4);
    shapes.crystal(0.28, 0.65, 0, 0.09, 0.26, [0.5, 0.38, 0.65], 0.4);
    shapes.crystal(0, 0.42, -0.2, 0.07, 0.17, p.gold, 1);
    shapes.ring(0.32, 0.026, 0.5, p.violet, 0.8, 20);
  } else {
    shapes.prism(0, 0.34, 0, 0.39, 0.66, [0.37, 0.39, 0.32], 6, 0.5);
    shapes.prism(0, 1.06, -0.05, 0.26, 0.36, p.stoneLight, 5, 0.21);
    for (const side of [-1, 1]) {
      shapes.prism(side * 0.57, 0.29, 0, 0.2, 0.64, p.stoneDark, 5, 0.29);
      shapes.box(side * 0.21, 0.18, 0, 0.27, 0.36, 0.32, p.stoneDark);
      shapes.crystal(side * 0.38, 0.98, 0, 0.13, 0.38, p.gold, 0.6);
      shapes.crystal(side * 0.08, 1.26, -0.25, 0.05, 0.12, p.gold, 1);
    }
    shapes.crystal(0, 0.76, -0.43, 0.13, 0.36, p.gold, 0.85);
  }
  return shapes;
}

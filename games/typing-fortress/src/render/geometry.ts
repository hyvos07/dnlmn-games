import { Geometry, type OGLRenderingContext } from 'ogl';

type Point = readonly [number, number, number];
export type Color = readonly [number, number, number];

/** Bake original flat-shaded shapes into one draw call, including their vertex colors. */
export class ShapeBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly glows: number[] = [];

  triangle(a: Point, b: Point, c: Point, color: Color, glow = 0): void {
    const ab: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Point = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: Point = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...normal) || 1;
    for (const point of [a, b, c]) {
      this.positions.push(...point);
      this.normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
      this.colors.push(...color);
      this.glows.push(glow);
    }
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: Color): void {
    const points = [
      [x - w / 2, y - h / 2, z - d / 2],
      [x + w / 2, y - h / 2, z - d / 2],
      [x + w / 2, y + h / 2, z - d / 2],
      [x - w / 2, y + h / 2, z - d / 2],
      [x - w / 2, y - h / 2, z + d / 2],
      [x + w / 2, y - h / 2, z + d / 2],
      [x + w / 2, y + h / 2, z + d / 2],
      [x - w / 2, y + h / 2, z + d / 2],
    ] as const;
    const faces = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ] as const;
    for (const [a, b, c, e] of faces) {
      this.triangle(points[a], points[b], points[c], color);
      this.triangle(points[a], points[c], points[e], color);
    }
  }

  prism(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    color: Color,
    sides = 6,
    topRadius = radius,
    glow = 0,
    angle = 0,
  ): void {
    for (let i = 0; i < sides; i++) {
      const a = angle + (i / sides) * Math.PI * 2;
      const b = angle + ((i + 1) / sides) * Math.PI * 2;
      const lowerA: Point = [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius];
      const lowerB: Point = [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius];
      const upperA: Point = [x + Math.cos(a) * topRadius, y + height, z + Math.sin(a) * topRadius];
      const upperB: Point = [x + Math.cos(b) * topRadius, y + height, z + Math.sin(b) * topRadius];
      this.triangle(lowerA, upperA, lowerB, color, glow);
      this.triangle(lowerB, upperA, upperB, color, glow);
      this.triangle([x, y + height, z], upperB, upperA, color, glow);
      this.triangle([x, y, z], lowerA, lowerB, color, glow);
    }
  }

  crystal(
    x: number,
    y: number,
    z: number,
    radius: number,
    h: number,
    color: Color,
    glow = 0,
  ): void {
    this.prism(x, y, z, radius, h * 0.65, color, 5, 0, glow);
    this.prism(x, y - h * 0.35, z, 0, h * 0.35, color, 5, radius, glow);
  }

  ring(radius: number, width: number, y: number, color: Color, glow = 0, segments = 48): void {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const b = ((i + 1) / segments) * Math.PI * 2;
      const p: Point = [Math.sin(a) * radius, y, Math.cos(a) * radius];
      const q: Point = [Math.sin(b) * radius, y, Math.cos(b) * radius];
      const r: Point = [Math.sin(a) * (radius + width), y, Math.cos(a) * (radius + width)];
      const s: Point = [Math.sin(b) * (radius + width), y, Math.cos(b) * (radius + width)];
      this.triangle(p, r, q, color, glow);
      this.triangle(r, s, q, color, glow);
    }
  }

  ellipse(x: number, z: number, rx: number, rz: number, y: number, color: Color): void {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const b = ((i + 1) / 16) * Math.PI * 2;
      this.triangle(
        [x, y, z],
        [x + Math.cos(b) * rx, y, z + Math.sin(b) * rz],
        [x + Math.cos(a) * rx, y, z + Math.sin(a) * rz],
        color,
      );
    }
  }

  geometry(gl: OGLRenderingContext): Geometry {
    return new Geometry(gl, {
      position: { size: 3, data: new Float32Array(this.positions) },
      normal: { size: 3, data: new Float32Array(this.normals) },
      color: { size: 3, data: new Float32Array(this.colors) },
      glow: { size: 1, data: new Float32Array(this.glows) },
    });
  }
}

export const palette = {
  stone: [0.38, 0.43, 0.39],
  stoneLight: [0.58, 0.59, 0.46],
  stoneDark: [0.22, 0.28, 0.28],
  roof: [0.1, 0.29, 0.29],
  soil: [0.085, 0.15, 0.13],
  moss: [0.14, 0.23, 0.17],
  rune: [0.68, 0.91, 0.64],
  gold: [1, 0.69, 0.27],
  teal: [0.25, 0.9, 0.74],
  violet: [0.64, 0.53, 0.91],
} satisfies Record<string, Color>;

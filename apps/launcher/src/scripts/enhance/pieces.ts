/**
 * Low-poly "game piece" meshes as flat, non-indexed triangle lists (positions only).
 * Flat shading comes from screen-space derivatives in the fragment shader, so no
 * normals are needed and every piece stays crisp and faceted.
 */

type Vec3 = [number, number, number];

function pushTri(out: number[], a: Vec3, b: Vec3, c: Vec3): void {
  out.push(...a, ...b, ...c);
}

function quad(out: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  pushTri(out, a, b, c);
  pushTri(out, a, c, d);
}

/** An axis-aligned box centred on (x, y, z). */
function box(out: number[], [x, y, z]: Vec3, [w, h, d]: Vec3): void {
  const [x0, x1, y0, y1, z0, z1] = [
    x - w / 2,
    x + w / 2,
    y - h / 2,
    y + h / 2,
    z - d / 2,
    z + d / 2,
  ];
  quad(out, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  quad(out, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
  quad(out, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
  quad(out, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  quad(out, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
  quad(out, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
}

/** Voxel clusters from grid cells, recentred on the origin. */
function voxels(cells: Array<[number, number]>, depth = 1): Float32Array {
  const cx = cells.reduce((s, [x]) => s + x, 0) / cells.length;
  const cy = cells.reduce((s, [, y]) => s + y, 0) / cells.length;
  const out: number[] = [];
  // Slightly inset cubes leave a hairline gap so the voxel structure reads.
  for (const [x, y] of cells) box(out, [x - cx, y - cy, 0], [0.94, 0.94, depth * 0.94]);
  return new Float32Array(out);
}

function icosahedron(): Float32Array {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const v = raw.map(([x, y, z]) => {
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len] as Vec3;
  });
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const out: number[] = [];
  for (const [a, b, c] of faces)
    pushTri(out, v[a as number] as Vec3, v[b as number] as Vec3, v[c as number] as Vec3);
  return new Float32Array(out);
}

function octahedron(): Float32Array {
  const p: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const faces = [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ];
  const out: number[] = [];
  for (const [a, b, c] of faces)
    pushTri(out, p[a as number] as Vec3, p[b as number] as Vec3, p[c as number] as Vec3);
  return new Float32Array(out);
}

/** A chunky low-poly coin: a decagonal prism. */
function coin(segments = 10, depth = 0.34): Float32Array {
  const out: number[] = [];
  const z = depth / 2;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0: Vec3 = [Math.cos(a0), Math.sin(a0), 0];
    const p1: Vec3 = [Math.cos(a1), Math.sin(a1), 0];
    pushTri(out, [0, 0, z], [p0[0], p0[1], z], [p1[0], p1[1], z]);
    pushTri(out, [0, 0, -z], [p1[0], p1[1], -z], [p0[0], p0[1], -z]);
    quad(out, [p0[0], p0[1], -z], [p1[0], p1[1], -z], [p1[0], p1[1], z], [p0[0], p0[1], z]);
  }
  return new Float32Array(out);
}

export interface PieceKind {
  name: string;
  positions: Float32Array;
  /** Relative share of instances. */
  weight: number;
  /** [min, max] instance scale. */
  scale: [number, number];
}

export function pieceKinds(): PieceKind[] {
  return [
    {
      name: 'T',
      positions: voxels([
        [0, 0],
        [1, 0],
        [2, 0],
        [1, -1],
      ]),
      weight: 0.17,
      scale: [0.3, 0.46],
    },
    {
      name: 'L',
      positions: voxels([
        [0, 1],
        [0, 0],
        [0, -1],
        [1, -1],
      ]),
      weight: 0.13,
      scale: [0.3, 0.46],
    },
    {
      name: 'S',
      positions: voxels([
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ]),
      weight: 0.12,
      scale: [0.3, 0.44],
    },
    {
      name: 'dpad',
      positions: voxels(
        [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ],
        0.5,
      ),
      weight: 0.1,
      scale: [0.28, 0.4],
    },
    { name: 'd20', positions: icosahedron(), weight: 0.16, scale: [0.5, 0.8] },
    { name: 'coin', positions: coin(), weight: 0.14, scale: [0.42, 0.62] },
    { name: 'pellet', positions: octahedron(), weight: 0.18, scale: [0.3, 0.5] },
  ];
}

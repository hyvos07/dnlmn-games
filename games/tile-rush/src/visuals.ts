import pixel1AliveUrl from './assets/pixel-1-alive.svg?url';
import pixel2AliveUrl from './assets/pixel-2-alive.svg?url';
import pixel3AliveUrl from './assets/pixel-3-alive.svg?url';
import pixel4AliveUrl from './assets/pixel-4-alive.svg?url';

const pixelSources = [pixel1AliveUrl, pixel2AliveUrl, pixel3AliveUrl, pixel4AliveUrl];
const pixelImages: HTMLImageElement[] = [];
let pixelAssetsPromise: Promise<void> | undefined;

async function decodeSprite(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

/** Decoded SVGs are reused by every canvas frame. */
export function preloadSprites(): Promise<void> {
  pixelAssetsPromise ??= Promise.all(pixelSources.map(decodeSprite)).then((sprites) => {
    pixelImages.push(...sprites);
  });
  return pixelAssetsPromise;
}

export interface Visuals {
  accent: string;
  background: string;
  panel: string;
  ink: string;
  muted: string;
  drawTarget: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    variant: number,
    completed: boolean,
  ) => void;
}

export const visuals: Visuals = {
  accent: '#8fbfff',
  background: '#090f1d',
  panel: '#121e33',
  ink: '#eaf1ff',
  muted: '#97a9c4',
  drawTarget(ctx, x, y, size, variant) {
    const sprite = pixelImages[((variant % 4) + 4) % 4];
    if (sprite) ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  },
};

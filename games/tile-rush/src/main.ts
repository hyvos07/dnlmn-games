import '@fontsource/bricolage-grotesque/latin-800.css';
import './style.css';
import { TileRush } from './tile-rush.ts';
import { preloadSprites } from './visuals.ts';

void preloadSprites().then(() => new TileRush());

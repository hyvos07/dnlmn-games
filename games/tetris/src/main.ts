import { boot } from './controller.ts';

const root = document.getElementById('app') ?? document.getElementById('stage');
if (root) boot(root);

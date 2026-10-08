import type { APIRoute } from 'astro';
import { getGames, tagCounts } from '../lib/games.ts';

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? 'https://games.dnlmn.dev';
  const games = await getGames();
  const paths = [
    '/',
    '/about/',
    ...games.map((game) => game.href),
    ...tagCounts(games).map(({ tag }) => `/tag/${tag}/`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};

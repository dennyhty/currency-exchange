import { readFileSync } from 'node:fs';

/** Load a real captured response from fixtures/ (test helper). */
export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'));
}

/** A fetch that serves canned JSON by URL substring (first match wins), or fails with 500. */
export function fakeFetch(routes: Array<[string, unknown]>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes.find(([part]) => url.includes(part));
    if (!hit) return new Response('nope', { status: 500 });
    return new Response(JSON.stringify(hit[1]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

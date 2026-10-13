// Run on YOUR computer (not on GitHub): publish the GolaVisa API response that you read in your own
// browser to the `data` branch, where the site picks it up.
// usage: node scripts/publish-golavisa.ts <file-with-the-api-json> [--remote <git remote name or url>] [--no-deploy]
// After publishing it asks GitHub to run the Deploy workflow (needs `gh`), so E.SUN and today's history
// are refreshed right away instead of waiting for GitHub's scheduled run, which often starts hours late.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildGolaFile, parseGolaFile } from '../src/sources/golavisa.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: 'string', default: 'origin' },
    'no-deploy': { type: 'boolean', default: false },
  },
});
const input = positionals[0];
if (!input) {
  console.error(
    'usage: publish-golavisa.ts <file-with-api-json> [--remote <name|url>] [--no-deploy]',
  );
  process.exit(2);
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// 1. validate before touching anything: a page that is not the API JSON must never be published
let response: unknown;
try {
  response = JSON.parse(readFileSync(input, 'utf8'));
} catch {
  console.error(
    'That file is not JSON. Is it the text of https://www.golavisa.co/api/exchange-rates ?',
  );
  process.exit(1);
}
let file: ReturnType<typeof buildGolaFile>;
try {
  file = buildGolaFile(response); // refuses missing or implausible numbers
} catch (e) {
  console.error(`Not published: ${e instanceof Error ? e.message : String(e)}`);
  console.error(
    'The text must be the JSON of https://www.golavisa.co/api/exchange-rates (not a verification page).',
  );
  process.exit(1);
}
const g = parseGolaFile(file);
console.log(
  `OK: TWD ${g.twdToVnd}/${g.vndToTwd}, USD ${g.usdToVnd}/${g.vndToUsd} VND, ` +
    `site time ${g.updatedAt ? new Date(g.updatedAt).toISOString() : 'unknown'}`,
);

// 2. write it to the data branch in a throwaway clone (does not touch your working tree)
const remoteUrl = /[:/]/.test(values.remote)
  ? values.remote
  : git(process.cwd(), 'remote', 'get-url', values.remote);
const work = mkdtempSync(join(tmpdir(), 'golavisa-'));
try {
  try {
    git(
      work,
      'clone',
      '--quiet',
      '--branch',
      'data',
      '--single-branch',
      '--depth',
      '1',
      remoteUrl,
      '.',
    );
  } catch {
    console.log('no `data` branch yet: creating it');
    git(work, 'init', '--quiet', '-b', 'data');
    git(work, 'remote', 'add', 'origin', remoteUrl);
  }
  writeFileSync(join(work, 'golavisa.json'), `${JSON.stringify(file, null, 2)}\n`);
  git(work, 'add', 'golavisa.json');
  git(work, 'commit', '--quiet', '-m', `data: GolaVisa rates ${file.fetchedAt}`);
  git(work, 'push', '--quiet', 'origin', 'data');
  console.log('published to the `data` branch. The site reads it within a few minutes.');
} finally {
  rmSync(work, { recursive: true, force: true });
}

// 3. best effort: refresh the site now (E.SUN rates.json + today's history entry with these GolaVisa rates)
if (!values['no-deploy']) {
  try {
    execFileSync('gh', ['workflow', 'run', 'deploy.yml', '--ref', 'main'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(
      'asked GitHub to run the Deploy workflow (E.SUN and history refresh in a few minutes).',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    console.log(`could not start the Deploy workflow (${msg}); the daily schedule will still run.`);
  }
}

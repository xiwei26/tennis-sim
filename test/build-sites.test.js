import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildSites, forceRemoteServerMode } from '../build-sites.js';
import sitesWorker from '../sites-worker.js';

const validPage = '<!doctype html><meta name="tennis-server-mode" content="auto"><main>Game</main>';

function createFixture(t, pages = {}) {
  const root = mkdtempSync(resolve('test', '.tmp-sites-build-'));
  const publicDir = resolve(root, 'public');
  const distDir = resolve(root, 'dist');
  const workerPath = resolve(root, 'sites-worker.js');

  mkdirSync(publicDir);
  writeFileSync(resolve(publicDir, 'index.html'), pages.index ?? validPage);
  writeFileSync(resolve(publicDir, 'game.html'), pages.game ?? validPage);
  writeFileSync(workerPath, 'export default {};');
  t.after(() => rmSync(root, { recursive: true, force: true }));

  return { distDir, publicDir, workerPath };
}

test('Sites build forces both deployed pages to remote mode without changing source pages', (t) => {
  const fixture = createFixture(t);

  buildSites(fixture);

  for (const file of ['index.html', 'game.html']) {
    assert.match(readFileSync(resolve(fixture.publicDir, file), 'utf8'), /content="auto"/);
    const built = readFileSync(resolve(fixture.distDir, file), 'utf8');
    assert.match(built, /name="tennis-server-mode" content="remote"/);
    assert.doesNotMatch(built, /content="auto"/);
  }
  assert.equal(
    readFileSync(resolve(fixture.distDir, 'server', 'index.js'), 'utf8'),
    'export default {};',
  );
});

test('Sites worker serves the app shell only for extensionless GET misses', async () => {
  const requests = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        requests.push(url.pathname);
        return url.pathname === '/index.html'
          ? new Response('app shell', { status: 200 })
          : new Response('missing', { status: 404 });
      },
    },
  };

  const routeResponse = await sitesWorker.fetch(new Request('https://example.test/room/ABC'), env);
  assert.equal(routeResponse.status, 200);
  assert.equal(await routeResponse.text(), 'app shell');
  assert.deepEqual(requests, ['/room/ABC', '/index.html']);

  requests.length = 0;
  const assetResponse = await sitesWorker.fetch(new Request('https://example.test/missing.js'), env);
  assert.equal(assetResponse.status, 404);
  assert.deepEqual(requests, ['/missing.js']);
});

test('server mode replacement supports attribute order, quote, and source mode variations', () => {
  const html = "<meta content='preview' data-purpose='runtime' name='tennis-server-mode'>";
  assert.equal(
    forceRemoteServerMode(html, 'fixture'),
    "<meta content=\"remote\" data-purpose='runtime' name='tennis-server-mode'>",
  );
});

test('Sites build rejects missing, duplicate, and ambiguous server mode markers', async (t) => {
  const cases = [
    ['missing marker', '<meta name="other" content="auto">', /exactly one tennis-server-mode marker/],
    [
      'duplicate marker',
      `${validPage}<meta name="tennis-server-mode" content="auto">`,
      /exactly one tennis-server-mode marker/,
    ],
    [
      'duplicate content',
      '<meta name="tennis-server-mode" content="auto" content="preview">',
      /exactly one content value/,
    ],
    [
      'case-mismatched marker',
      '<meta name="TENNIS-SERVER-MODE" content="auto">',
      /exactly one tennis-server-mode marker/,
    ],
  ];

  for (const [name, game, expectedError] of cases) {
    await t.test(name, (subtest) => {
      const fixture = createFixture(subtest, { game });
      mkdirSync(fixture.distDir);
      writeFileSync(resolve(fixture.distDir, 'stale.txt'), 'old build');
      assert.throws(() => buildSites(fixture), expectedError);
      assert.equal(existsSync(fixture.distDir), false);
    });
  }
});

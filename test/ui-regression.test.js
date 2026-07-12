import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const landingPages = ['public/index.html'];
const gamePages = ['public/game.html'];
const rendererFiles = ['public/render.js'];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function cssRule(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

test('root Pages entrypoints only redirect into public', () => {
  const index = read('index.html');
  const game = read('game.html');

  assert.match(index, /window\.location\.replace\('public\/index\.html' \+ window\.location\.search\)/);
  assert.match(game, /window\.location\.replace\('public\/game\.html' \+ window\.location\.search\)/);
  assert.doesNotMatch(index, /Create New Room/);
  assert.doesNotMatch(game, /new GameApp\(\)/);
});

test('runtime client files live only under public', () => {
  for (const file of ['input.js', 'network.js', 'render.js', 'game.js']) {
    assert.throws(() => read(file), /ENOENT/);
  }
});

test('runtime assets live only under public assets', () => {
  assert.equal(existsSync(new URL('../assets/red.fbx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../assets/blue.fbx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../assets/003_Tennis_court.fbx', import.meta.url)), false);

  const publicAssets = readdirSync(new URL('../public/assets/', import.meta.url));
  assert.deepEqual(publicAssets.sort(), [
    '003_Tennis_court.fbx',
    'blue.fbx',
    'blue_basecolor.jpg',
    'red.fbx',
    'red_basecolor.jpg',
  ]);
});

for (const page of landingPages) {
  test(`${page} keeps room join controls inside the card`, () => {
    const html = read(page);
    const inputRule = cssRule(html, '.input-group input');
    const buttonRule = cssRule(html, '.input-group .btn');

    assert.match(inputRule, /min-width\s*:\s*0\b/);
    assert.match(buttonRule, /flex\s*:\s*0\s+0\s+auto\b/);
  });

  test(`${page} redirects HTTPS Pages actions to the HTTP game server`, () => {
    const html = read(page);

    assert.match(html, /const serverOrigin = `http:\/\/\$\{serverIP\}:5000`/);
    assert.match(html, /const isSecureStaticPage = window\.location\.protocol === 'https:'/);
    assert.match(html, /function continueOnGameServer\(params = \{\}\)/);
    assert.match(html, /continueOnGameServer\(\{ action: 'create' \}\)/);
    assert.match(html, /continueOnGameServer\(\{ action: 'join', room: code \}\)/);
    assert.match(html, /window\.location\.href = `\/game\.html\?room=\$\{roomId\}`/);
    assert.match(html, /if \(startupAction === 'create'\) createBtn\.click\(\)/);
    assert.match(html, /if \(startupAction === 'join' && startupRoom\)/);
  });

  test(`${page} checks create-room HTTP errors before redirecting`, () => {
    const html = read(page);

    assert.match(html, /if \(!resp\.ok\) return resp\.json\(\)\.then\(d => \{ throw new Error\(d\.error/);
  });
}

for (const page of gamePages) {
  test(`${page} shows the invite code in the match room`, () => {
    const html = read(page);

    assert.match(html, /id="room-invite"/);
    assert.match(html, /id="room-code-badge"/);
    assert.match(html, /roomCodeBadge\.textContent\s*=\s*roomId/);
    assert.match(html, /roomInvite\.hidden\s*=\s*false/);
    assert.match(html, /@media\s*\(max-width:\s*520px\)[\s\S]*#room-invite\s*\{[^}]*top:\s*116px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\)/);
    assert.match(html, /const serverOrigin = 'http:\/\/138\.2\.47\.126:5000'/);
    assert.match(html, /window\.location\.replace\(`\$\{serverOrigin\}\/game\.html\?\$\{redirectParams\.toString\(\)\}`\)/);
  });
}

for (const file of rendererFiles) {
  test(`${file} lays out player labels without overlap`, () => {
    const js = read(file);

    assert.match(js, /labels\.id\s*=\s*'player-labels'/);
    assert.match(js, /display:flex/);
    assert.doesNotMatch(js, /transform:translateX\(-120px\)/);
    assert.doesNotMatch(js, /transform:translateX\(20px\)/);
  });

  test(`${file} excludes embedded FBX lights from scene lighting`, () => {
    const js = read(file);

    assert.match(js, /const embeddedLights = \[\];/);
    assert.match(js, /if \(child\.isLight\) \{/);
    assert.match(js, /embeddedLights\.forEach\(\(light\) => \{/);
    assert.match(js, /light\.parent\.remove\(light\)/);
  });

  test(`${file} aligns the imported court and player models to gameplay coordinates`, () => {
    const js = read(file);

    assert.match(js, /this\._fitCourtModel\(obj\)/);
    assert.match(js, /this\._getMaterialBounds\(obj, 'court line'\)/);
    assert.match(js, /group\.rotation\.y = Math\.PI \/ 2;/);
    assert.match(js, /if \(this\.netGroup\) this\.netGroup\.visible = false/);
  });

  test(`${file} cancels older message timers before hiding overlays`, () => {
    const js = read(file);

    assert.match(js, /clearTimeout\(this\._messageTimer\)/);
    assert.match(js, /this\._messageTimer = setTimeout/);
  });
}

for (const file of ['public/network.js']) {
  test(`${file} rejects connects that close before opening and avoids duplicate input loops`, () => {
    const js = read(file);

    assert.match(js, /let settled = false/);
    assert.match(js, /reject\(new Error\('WebSocket closed before connecting'\)\)/);
    assert.match(js, /this\._stopInputLoop\(\);\s*this\._inputInterval = setInterval/s);
  });
}

test('server REST join rejects closing rooms before websocket join', () => {
  const js = read('server/index.js');

  assert.match(js, /if \(room\.closing\) return res\.status\(400\)\.json\(\{ error: 'Room is closing' \}\)/);
});

for (const file of ['public/game.js']) {
  test(`${file} starts the gameplay loops only once`, () => {
    const js = read(file);

    assert.match(js, /if \(this\.running\) return/);
  });
}

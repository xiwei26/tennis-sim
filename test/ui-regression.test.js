import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';

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

test('all HTML inline scripts are syntactically valid', () => {
  for (const page of ['index.html', 'game.html', 'public/index.html', 'public/game.html']) {
    const html = read(page);
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, `${page} must contain an inline startup script`);
    scripts.forEach((match, index) => {
      assert.doesNotThrow(() => new Script(match[1], { filename: `${page}#inline-${index + 1}` }));
    });
  }
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
  assert.equal(existsSync(new URL('../public/vendor/three.LICENSE.txt', import.meta.url)), true);
  assert.equal(existsSync(new URL('../public/vendor/fflate.LICENSE.txt', import.meta.url)), true);
});

for (const page of landingPages) {
  test(`${page} keeps room join controls inside the card`, () => {
    const html = read(page);
    const inputRule = cssRule(html, '.input-group input');
    const buttonRule = cssRule(html, '.input-group .btn');

    assert.match(inputRule, /min-width\s*:\s*0\b/);
    assert.match(buttonRule, /flex\s*:\s*0\s+0\s+auto\b/);
    assert.match(cssRule(html, '.lobby'), /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/);
  });

  test(`${page} accepts the server's eight-character room codes`, () => {
    const html = read(page);

    assert.match(html, /id="room-code-input"[^>]*maxlength="8"/);
    assert.match(html, /code\.length !== 8/);
    assert.match(html, /eight-character code/);
    assert.doesNotMatch(html, /five-character code/);
  });

  test(`${page} uses same-origin APIs except on explicitly configured static deployments`, () => {
    const html = read(page);

    assert.match(html, /name="tennis-server-mode" content="auto"/);
    assert.match(html, /name="tennis-game-server" content="http:\/\/138\.2\.47\.126:5000"/);
    assert.match(html, /window\.location\.hostname\.endsWith\('\.github\.io'\)/);
    assert.match(html, /const serverApi = useRemoteGameServer \? configuredGameOrigin : window\.location\.origin/);
    assert.match(html, /const shouldHandoffToGameServer = useRemoteGameServer/);
    assert.match(html, /function continueOnGameServer\(params = \{\}\)/);
    assert.match(html, /continueOnGameServer\(\{ action: 'create' \}\)/);
    assert.match(html, /continueOnGameServer\(\{ action: 'join', room: code \}\)/);
    assert.match(html, /new URL\('game\.html', window\.location\.href\)/);
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
    assert.match(html, /src="vendor\/three\.min\.js"/);
    assert.match(html, /const socketProtocol = window\.location\.protocol === 'https:' \? 'wss:' : 'ws:'/);
    assert.match(html, /const serverUrl = `\$\{socketProtocol\}\/\/\$\{window\.location\.host\}`/);
    assert.doesNotMatch(html, /params\.get\('server'\)/);
    assert.match(html, /window\.location\.replace\(`\$\{configuredGameOrigin\}\/game\.html\?\$\{redirectParams\.toString\(\)\}`\)/);
  });

  test(`${page} keeps narrow-screen match controls from overlapping`, () => {
    const html = read(page);

    assert.match(html, /@media\s*\(max-width:\s*520px\)[\s\S]*#score-display\s*\{[^}]*left:\s*12px\s*!important;[^}]*transform:\s*none\s*!important/);
    assert.match(html, /@media\s*\(max-width:\s*520px\)[\s\S]*#controls-help\s*\{\s*display:\s*none;/);
    assert.match(html, /@media\s*\(max-width:\s*520px\)[\s\S]*#charge-bar\s*\{[^}]*bottom:\s*24px\s*!important/);
    assert.match(html, /@media\s*\(max-height:\s*420px\)[\s\S]*#room-invite\s*\{[^}]*top:\s*68px;[^}]*transform:\s*none/);
    assert.match(html, /@media\s*\(max-height:\s*420px\)[\s\S]*#player-labels\s*\{\s*display:\s*none\s*!important/);
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

  test(`${file} keeps waiting players on their own baselines before the first server state`, () => {
    const js = read(file);

    assert.match(js, /player1:\s*-10/);
    assert.match(js, /player2:\s*10/);
    assert.match(js, /group\.position\.set\(0, 0, PLAYER_START_Z\[id\] \?\? 0\)/);
  });

  test(`${file} drives both players' run animations from authoritative movement`, () => {
    const js = read(file);

    assert.match(js, /if \(previous\) \{\s*const distance = Math\.hypot/);
    assert.doesNotMatch(js, /id !== this\.localPlayerId && previous/);
    assert.match(js, /previous\.crossFadeTo\(next, 0\.16, false\)/);
  });

  test(`${file} cancels older message timers before hiding overlays`, () => {
    const js = read(file);

    assert.match(js, /clearTimeout\(this\._messageTimer\)/);
    assert.match(js, /this\._messageTimer = setTimeout/);
  });

  test(`${file} renders server scores through text-only DOM APIs`, () => {
    const js = read(file);

    assert.doesNotMatch(js, /scoreDisplay\.innerHTML/);
    assert.match(js, /this\.scoreDisplay\.replaceChildren\(p1, pointScore, p2\)/);
    assert.match(js, /Number\.isFinite\(number\)/);
  });

  test(`${file} releases scene resources and ignores late model loads after destroy`, () => {
    const js = read(file);

    assert.match(js, /if \(this\._destroyed\) \{\s*this\._disposeObject\(obj\);\s*return;/);
    assert.match(js, /this\._disposeObject\(this\.scene\)/);
    assert.match(js, /textures\.forEach\(\(texture\) => texture\.dispose\(\)\)/);
    assert.match(js, /this\.playerLabelsContainer/);
  });
}

for (const file of ['public/network.js']) {
  test(`${file} rejects connects that close before opening and avoids duplicate input loops`, () => {
    const js = read(file);

    assert.match(js, /let settled = false/);
    assert.match(js, /reject\(new Error\('WebSocket closed before connecting'\)\)/);
    assert.match(js, /this\.stopInputLoop\(\);\s*this\._inputInterval = setInterval/s);
    assert.match(js, /stopInputLoop\(\) \{/);
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
    assert.match(js, /if \(msg\.score\) this\.renderer\.updateScore\(msg\.score\)/);
    assert.match(js, /this\._stopGameplay\(\);[\s\S]*if \(msg\.score\) this\.renderer\.updateScore\(msg\.score\)/);
    assert.match(js, /this\.network\.stopInputLoop\(\)/);
    assert.doesNotMatch(js, /input\.isMoving\(\)/);
  });
}

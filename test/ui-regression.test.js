import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const landingPages = ['index.html', 'public/index.html'];
const gamePages = ['game.html', 'public/game.html'];
const rendererFiles = ['render.js', 'public/render.js'];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function cssRule(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

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
    assert.match(html, /if \(startupAction === 'create'\) createBtn\.click\(\)/);
    assert.match(html, /if \(startupAction === 'join' && startupRoom\)/);
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
    assert.match(js, /group\.rotation\.y = Math\.PI \/ 2 \+ \(id === 'player2' \? Math\.PI : 0\)/);
    assert.match(js, /if \(this\.netGroup\) this\.netGroup\.visible = false/);
  });
}

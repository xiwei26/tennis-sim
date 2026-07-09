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
}

for (const page of gamePages) {
  test(`${page} shows the invite code in the match room`, () => {
    const html = read(page);

    assert.match(html, /id="room-invite"/);
    assert.match(html, /id="room-code-badge"/);
    assert.match(html, /roomCodeBadge\.textContent\s*=\s*roomId/);
    assert.match(html, /roomInvite\.hidden\s*=\s*false/);
    assert.match(html, /@media\s*\(max-width:\s*520px\)[\s\S]*#room-invite\s*\{[^}]*top:\s*116px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\)/);
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
}

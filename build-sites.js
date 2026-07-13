import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SERVER_MODE_META = 'tennis-server-mode';
const SITE_PAGES = ['index.html', 'game.html'];

function readAttributes(tag) {
  const attributes = [];
  const body = tag.replace(/^<meta\b/i, '').replace(/>$/, '');
  const pattern = /(?:^|\s)([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of body.matchAll(pattern)) {
    attributes.push({
      name: match[1].toLowerCase(),
      value: match[2] ?? match[3] ?? match[4],
    });
  }

  return attributes;
}

function inspectServerModeMeta(html, label) {
  const markerTags = [];
  const tagPattern = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const attributes = readAttributes(match[0]);
    const nameAttributes = attributes.filter((attribute) => attribute.name === 'name');
    const hasMarker = nameAttributes.some(
      (attribute) => attribute.value === SERVER_MODE_META,
    );

    if (!hasMarker) continue;
    if (nameAttributes.length !== 1) {
      throw new Error(`${label} has an ambiguous ${SERVER_MODE_META} marker.`);
    }

    markerTags.push({ tag: match[0], index: match.index, attributes });
  }

  if (markerTags.length !== 1) {
    throw new Error(`${label} must contain exactly one ${SERVER_MODE_META} marker.`);
  }

  const marker = markerTags[0];
  const contentAttributes = marker.attributes.filter((attribute) => attribute.name === 'content');
  if (contentAttributes.length !== 1 || contentAttributes[0].value === undefined) {
    throw new Error(`${label} ${SERVER_MODE_META} marker must contain exactly one content value.`);
  }

  return { ...marker, mode: contentAttributes[0].value };
}

export function forceRemoteServerMode(html, label = 'HTML') {
  const marker = inspectServerModeMeta(html, label);
  const updatedTag = marker.tag.replace(
    /(\scontent\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/i,
    '$1"remote"',
  );
  const output = `${html.slice(0, marker.index)}${updatedTag}${html.slice(marker.index + marker.tag.length)}`;
  const outputMarker = inspectServerModeMeta(output, label);

  if (outputMarker.mode !== 'remote') {
    throw new Error(`${label} ${SERVER_MODE_META} marker was not replaced with remote.`);
  }

  return output;
}

export function buildSites({
  distDir = resolve('dist'),
  publicDir = resolve('public'),
  workerPath = resolve('sites-worker.js'),
} = {}) {
  rmSync(distDir, { recursive: true, force: true });

  try {
    if (!existsSync(publicDir) || !existsSync(workerPath)) {
      throw new Error('Sites build requires public/ and sites-worker.js.');
    }

    const pages = SITE_PAGES.map((file) => ({
      file,
      html: forceRemoteServerMode(
        readFileSync(resolve(publicDir, file), 'utf8'),
        `public/${file}`,
      ),
    }));

    mkdirSync(resolve(distDir, 'server'), { recursive: true });
    cpSync(publicDir, distDir, { recursive: true });
    cpSync(workerPath, resolve(distDir, 'server', 'index.js'));

    for (const { file, html } of pages) {
      const outputPath = resolve(distDir, file);
      writeFileSync(outputPath, html);
      const builtMarker = inspectServerModeMeta(readFileSync(outputPath, 'utf8'), `dist/${file}`);
      if (builtMarker.mode !== 'remote') {
        throw new Error(`dist/${file} ${SERVER_MODE_META} marker was not replaced with remote.`);
      }
    }
  } catch (error) {
    rmSync(distDir, { recursive: true, force: true });
    throw error;
  }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) buildSites();

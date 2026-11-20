import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const hash = bytes => createHash('sha256').update(bytes).digest('base64');

let html = (await read('index.html')).toString();
for (const [tag, path, opening, closing] of [
  ['<link rel="stylesheet" href="./css/style.css">', 'css/style.css', '<style>', '</style>'],
  ['<script src="./js/words.js"></script>', 'js/words.js', '<script>', '</script>'],
  ['<script src="./js/audio.js"></script>', 'js/audio.js', '<script>', '</script>'],
  ['<script src="./js/app.js"></script>', 'js/app.js', '<script>', '</script>'],
]) {
  if (!html.includes(tag)) throw new Error(`Missing build tag for ${path}`);
  const content = (await read(path)).toString();
  if (content.toLowerCase().includes(closing)) throw new Error(`Unescaped ${closing} in ${path}`);
  html = html.replace(tag, () => `${opening}\n${content}${closing}`);
}

const files = {
  'index.html': Buffer.from(html),
  'manifest.webmanifest': await read('manifest.webmanifest'),
  'assets/icon-192.png': await read('assets/icon-192.png'),
  'assets/icon-512.png': await read('assets/icon-512.png'),
  'assets/apple-touch-icon.png': await read('assets/apple-touch-icon.png'),
};
const resources = Object.entries(files).map(([path, bytes]) => [path, `sha256-${hash(bytes)}`]);
const worker = (await read('sw.js')).toString();
const version = createHash('sha256').update(worker).update(JSON.stringify(resources)).digest('hex');
files['sw.js'] = worker
  .replace('/* BUILD_RESOURCES */ []', JSON.stringify(resources))
  .replace('BUILD_VERSION', version);
for (const [path, bytes] of Object.entries(files)) {
  const output = new URL(`dist/${path}`, root);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, bytes);
}

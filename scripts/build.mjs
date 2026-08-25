import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const classesDir = path.join(root, 'classes');
const distDir = path.join(root, 'dist');

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else out.push(rel);
  }
  return out;
}

function humanizeSlug(slug) {
  return slug
    .replace(/^\d+[-_\s]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || slug;
}

function inferCategory(files, title) {
  const lower = files.join(' ').toLowerCase() + ` ${title.toLowerCase()}`;
  if (/\bcss\b|style\.css|scss|tailwind/.test(lower)) return 'CSS';
  if (/\bjavascript\b|\bjs\b|\.js\b|dom|event/.test(lower)) return 'JavaScript';
  if (/\bhtml\b|index\.html|semantic/.test(lower)) return 'HTML';
  if (/typescript|\.ts\b/.test(lower)) return 'TypeScript';
  return 'Web Development';
}

function inferTags(files, title, category) {
  const text = `${title} ${category} ${files.join(' ')}`.toLowerCase();
  const candidates = [
    ['HTML', /html|\.html/],
    ['CSS', /css|\.css/],
    ['JavaScript', /javascript|\.js\b|dom|event/],
    ['TypeScript', /typescript|\.ts\b/],
    ['Responsive Design', /responsive|media[-_ ]?query/],
    ['Animation', /animation|transition|keyframes/],
    ['Components', /component|card|navbar|button/],
    ['Forms', /form|input|label/],
    ['Layout', /flexbox|grid|layout/],
  ];
  const tags = candidates.filter(([, re]) => re.test(text)).map(([tag]) => tag);
  if (!tags.includes(category)) tags.unshift(category);
  return [...new Set(tags)].slice(0, 6);
}

async function extractZip(zipPath, tempRoot) {
  const target = path.join(tempRoot, path.basename(zipPath, '.zip'));
  await fs.mkdir(target, { recursive: true });
  try {
    await execFileAsync('unzip', ['-q', zipPath, '-d', target]);
  } catch (error) {
    if (process.platform === 'win32') {
      await execFileAsync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${target.replace(/'/g, "''")}' -Force`]);
    } else {
      throw new Error(`Could not extract ${path.basename(zipPath)}. Ensure the archive is a valid ZIP.`);
    }
  }

  const entries = await fs.readdir(target, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const onlyDir = path.join(target, entries[0].name);
    const nested = await findClassRoot(onlyDir);
    return nested || onlyDir;
  }
  return (await findClassRoot(target)) || target;
}

async function findClassRoot(dir, depth = 0) {
  if (depth > 4) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const names = new Set(entries.filter(e => e.isFile()).map(e => e.name.toLowerCase()));
  if (names.has('index.html') || names.has('index.htm')) return dir;

  const children = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    const found = await findClassRoot(path.join(dir, child.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function readClassMetadata(sourceDir, slug) {
  const metaPath = path.join(sourceDir, 'class.json');
  let meta = {};
  if (await exists(metaPath)) {
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid JSON in ${slug}/class.json: ${error.message}`);
    }
  }

  const files = await walk(sourceDir);
  const title = meta.title || humanizeSlug(slug);
  const entry = meta.entry || files.find(file => /(^|\/)index\.html?$/i.test(file)) || files.find(file => /\.html?$/i.test(file));
  const category = meta.category || inferCategory(files, title);
  const tags = meta.tags?.length ? meta.tags : inferTags(files, title, category);

  return {
    id: meta.id || slug,
    title,
    slug,
    description: meta.description || `Practice ${title} in an interactive browser-based project workspace.`,
    category,
    level: meta.level || 'Beginner',
    tags,
    duration: meta.duration || 'Self-paced',
    date: meta.date || null,
    technologies: meta.technologies || tags,
    featured: Boolean(meta.featured),
    entry: entry || null,
    homework: meta.homework || null,
    files,
  };
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(path.join(distDir, 'classes'), { recursive: true });

const siteConfig = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'future-web-lab-'));
const sources = [];

try {
  const entries = (await fs.readdir(classesDir, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const slug = entry.isDirectory() ? entry.name : path.basename(entry.name, '.zip');
    const sourceDir = entry.isDirectory()
      ? path.join(classesDir, entry.name)
      : await extractZip(path.join(classesDir, entry.name), tempRoot);
    sources.push({ slug, sourceDir, originalZip: !entry.isDirectory() });
  }

  const classes = [];
  for (const source of sources) {
    const meta = await readClassMetadata(source.sourceDir, source.slug);
    if (!meta.entry) {
      console.warn(`Skipping ${source.slug}: no HTML entry file found.`);
      continue;
    }
    classes.push(meta);

    const target = path.join(distDir, 'classes', source.slug);
    await fs.cp(source.sourceDir, target, { recursive: true });
  }

  const ids = new Set();
  for (const cls of classes) {
    if (ids.has(cls.id)) throw new Error(`Duplicate class id: ${cls.id}`);
    ids.add(cls.id);
  }

  classes.sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));

  await fs.writeFile(path.join(distDir, 'classes.json'), JSON.stringify(classes));
  await fs.writeFile(path.join(distDir, 'site-config.json'), JSON.stringify(siteConfig));

  for (const rel of ['src/index.html', 'src/app.js', 'src/styles.css']) {
    await fs.copyFile(path.join(root, rel), path.join(distDir, path.basename(rel)));
  }

  console.log(`Built ${classes.length} classes.`);
  for (const cls of classes) console.log(`- ${cls.id}: ${cls.title}`);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

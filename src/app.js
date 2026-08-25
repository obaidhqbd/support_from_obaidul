import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from 'https://esm.sh/@codemirror/view@6.36.5';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from 'https://esm.sh/@codemirror/commands@6.8.1';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, closeBrackets } from 'https://esm.sh/@codemirror/language@6.11.1';
import { html } from 'https://esm.sh/@codemirror/lang-html@6.4.9';
import { css } from 'https://esm.sh/@codemirror/lang-css@6.3.1';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6.2.2';
import { autocompletion, closeBracketsKeymap, completionKeymap } from 'https://esm.sh/@codemirror/autocomplete@6.18.6';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const $ = (s) => document.querySelector(s);
const classGrid = $('#classGrid');
const filtersEl = $('#filters');
const workspaceShell = $('#workspaceShell');
const workspaceEmpty = $('#workspaceEmpty');
const searchInput = $('#search');

let classes = [];
let siteConfig = {};
let activeClass = null;
let files = new Map();
let editorView = null;
let activeFile = null;
let previewObjectUrl = null;
let saveTimer = null;
let currentFilter = 'All';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

async function boot() {
  try {
    [classes, siteConfig] = await Promise.all([getJSON('classes.json'), getJSON('site-config.json')]);
    applyBrand();
    buildFilters();
    renderClasses();
    searchInput.addEventListener('input', renderClasses);
    window.addEventListener('keydown', onGlobalShortcut);
  } catch (err) {
    classGrid.innerHTML = `<div class="empty">Could not load the project library: ${escapeHtml(err.message)}</div>`;
  }
}

function applyBrand() {
  const b = siteConfig.brand ?? {};
  $('#brandName').textContent = b.name || 'Web Lab';
  $('#brandRole').textContent = b.role || 'Learning Lab';
  $('#brandTagline').textContent = b.tagline || 'Learn. Code. Experiment. Build.';
  $('#brandDescription').textContent = b.description || 'A hands-on coding lab.';
  $('#footerBrand').textContent = b.name || 'Web Lab';
  $('#brandMark').textContent = b.shortName || initials(b.name || 'Web Lab');
  document.title = `${b.name || 'Web Lab'} · ${b.role || 'Learning Lab'}`;
}

function initials(name) { return name.split(/\s+/).map(x => x[0]).join('').slice(0,3).toUpperCase(); }

function buildFilters() {
  const cats = ['All', ...new Set(classes.map(c => c.category).filter(Boolean))];
  filtersEl.innerHTML = cats.map(cat => `<button class="filter ${cat===currentFilter?'active':''}" data-filter="${escapeAttr(cat)}">${escapeHtml(cat)}</button>`).join('');
  filtersEl.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; buildFilters(); renderClasses(); }));
}

function renderClasses() {
  const q = searchInput.value.trim().toLowerCase();
  const visible = classes.filter(c => {
    const hay = [c.title,c.description,c.category,c.level,...(c.tags||[])].join(' ').toLowerCase();
    return (currentFilter === 'All' || c.category === currentFilter) && hay.includes(q);
  });
  $('#classCount').textContent = classes.length;
  $('#emptyState').hidden = visible.length > 0;
  classGrid.innerHTML = visible.map(c => cardTemplate(c)).join('');
  classGrid.querySelectorAll('.class-card').forEach(card => {
    card.addEventListener('mousemove', (e) => { const r=card.getBoundingClientRect(); card.style.setProperty('--mx', `${e.clientX-r.left}px`); card.style.setProperty('--my', `${e.clientY-r.top}px`); });
    card.addEventListener('click', () => openClass(card.dataset.id));
  });
}

function cardTemplate(c) {
  return `<article class="class-card" data-id="${escapeAttr(c.id)}"><div class="card-top"><span class="card-id">${escapeHtml(c.id)}</span><span class="card-level">${escapeHtml(c.level || 'Project')}</span></div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description || '')}</p><div class="tags">${(c.tags||[]).slice(0,4).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><div class="card-bottom"><span>${escapeHtml(c.category || 'Web Development')} · ${escapeHtml(c.duration || 'Self-paced')}</span><b>→</b></div></article>`;
}

async function openClass(id) {
  activeClass = classes.find(c => c.id === id);
  if (!activeClass) return;
  location.hash = `workspace/${encodeURIComponent(activeClass.id)}`;
  $('#workspaceSubtitle').textContent = `${activeClass.title} · edit, preview and export your version.`;
  workspaceEmpty.remove();
  workspaceShell.innerHTML = workspaceTemplate(activeClass);
  setupWorkspace();
  await loadProject(activeClass);
  document.querySelector('#workspace')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function workspaceTemplate(c) {
  return `<div class="editor-shell" id="editorShell"><aside class="files-panel"><div class="panel-head"><span>PROJECT</span><span class="project-title">${escapeHtml(c.id)}</span></div><div class="file-list" id="fileList"></div></aside><section class="editor-panel"><div class="toolbar"><button class="tool-btn" data-action="save">Save</button><button class="tool-btn" data-action="reset">Reset</button><button class="tool-btn" data-action="undo">Undo</button><button class="tool-btn" data-action="redo">Redo</button><span class="toolbar-spacer"></span><button class="tool-btn" data-action="editor-full">Editor ⛶</button><button class="tool-btn" data-action="preview-mode">Preview</button></div><div class="editor-wrap"><div class="code-host" id="codeHost"></div></div><div class="statusbar"><span class="status-dot"></span><span id="saveStatus">Ready</span><span id="languageStatus">—</span></div></section><section class="preview-panel"><div class="toolbar"><span class="project-title">LIVE PREVIEW</span><span class="toolbar-spacer"></span><button class="tool-btn" data-action="refresh">Refresh</button><button class="tool-btn" data-action="preview-full">Preview ⛶</button><button class="tool-btn" data-action="download">Download ZIP</button></div><div class="preview-wrap"><iframe id="previewFrame" sandbox="allow-scripts allow-forms allow-modals"></iframe></div></section></div>`;
}

function setupWorkspace() {
  const root = $('#workspaceShell');
  root.querySelector('[data-action="save"]').onclick = () => saveCurrent(true);
  root.querySelector('[data-action="reset"]').onclick = () => resetProject();
  root.querySelector('[data-action="undo"]').onclick = () => editorView && undo(editorView);
  root.querySelector('[data-action="redo"]').onclick = () => editorView && redo(editorView);
  root.querySelector('[data-action="refresh"]').onclick = () => updatePreview();
  root.querySelector('[data-action="download"]').onclick = () => downloadZip(true);
  root.querySelector('[data-action="editor-full"]').onclick = () => toggleFullscreen($('.editor-panel'));
  root.querySelector('[data-action="preview-full"]').onclick = () => toggleFullscreen($('.preview-panel'));
  root.querySelector('[data-action="preview-mode"]').onclick = () => $('#editorShell').classList.toggle('preview-mode');
}

async function loadProject(c) {
  files.clear();
  activeFile = null;
  editorView?.destroy();
  editorView = null;
  const stored = loadStored(c.id);

  for (const rel of c.files) {
    const url = `classes/${encodeURIComponent(c.slug)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        files.set(rel, { binary: true, url, original: null, error: true });
        continue;
      }
      if (isBinary(rel)) {
        files.set(rel, { binary: true, url, original: null, error: false });
      } else {
        files.set(rel, { binary: false, url, original: await res.text(), error: false });
      }
    } catch {
      files.set(rel, { binary: isBinary(rel), url, original: null, error: true });
    }
  }

  const editable = [...files.keys()].filter(r => isEditable(r));
  if (!editable.length) {
    showWorkspaceNotice('No editable source files were found in this class. Add an HTML, CSS, JavaScript, Markdown, JSON or SVG file.');
    return;
  }

  editable.forEach(rel => {
    const saved = stored?.files?.[rel];
    files.get(rel).current = saved != null ? saved : files.get(rel).original;
  });

  renderFileList([...files.keys()]);
  const preferred = c.entry && files.has(c.entry) ? c.entry : editable.find(r => /(^|\/)index\.html?$/i.test(r)) || editable.find(r => /\.html?$/i.test(r)) || editable[0];
  selectFile(preferred);
  updatePreview();
}

function renderFileList(allFiles) {
  const groups = [...allFiles].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $('#fileList').innerHTML = groups.map(rel => {
    const item = files.get(rel);
    const disabled = item?.binary ? ' aria-disabled="true"' : '';
    return `<button class="file-btn ${item?.binary ? 'binary' : ''}" data-file="${escapeAttr(rel)}"${disabled}>
      <span>${fileIcon(rel)}</span><span>${escapeHtml(rel)}</span>
    </button>`;
  }).join('');
  $('#fileList').querySelectorAll('.file-btn').forEach(btn => {
    btn.onclick = () => {
      const rel = btn.dataset.file;
      if (files.get(rel)?.binary) {
        $('#saveStatus').textContent = 'Asset file · preview only';
        return;
      }
      selectFile(rel);
    };
  });
}

function selectFile(rel) {
  const item = files.get(rel);
  if (!item || item.binary) return;
  activeFile = rel;
  $('#fileList').querySelectorAll('.file-btn').forEach(b => b.classList.toggle('active', b.dataset.file === rel));
  editorView?.destroy();
  const language = rel.match(/\.html?$/i)
    ? html()
    : rel.match(/\.css$/i)
      ? css()
      : rel.match(/\.(js|mjs|ts)$/i)
        ? javascript({typescript: /\.ts$/.test(rel)})
        : [];
  const extensions = [
    lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, ...completionKeymap, ...closeBracketsKeymap]),
    bracketMatching(), closeBrackets(), foldGutter(), indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, {fallback:true}),
    autocompletion({activateOnTyping:true}), language,
    EditorView.updateListener.of(v => { if (v.docChanged) onEdit(); })
  ];
  editorView = new EditorView({state: EditorState.create({doc: item.current ?? item.original ?? '', extensions}), parent: $('#codeHost')});
  $('#languageStatus').textContent = extensionLabel(rel);
  $('#saveStatus').textContent = localExists(activeClass.id) ? 'Local changes available' : 'Original project';
}

function onEdit() {
  if (!editorView || !activeFile) return;
  files.get(activeFile).current = editorView.state.doc.toString();
  $('#saveStatus').textContent = 'Unsaved local edit';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrent(false), 350);
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(updatePreview, 450);
}

function saveCurrent(manual) {
  if (!activeClass) return;
  if (editorView && activeFile) files.get(activeFile).current = editorView.state.doc.toString();
  const out = { version: 1, files: {} };
  for (const [rel, item] of files) {
    if (!item.binary && isEditable(rel)) out.files[rel] = item.current ?? item.original ?? '';
  }
  localStorage.setItem(storageKey(activeClass.id), JSON.stringify(out));
  $('#saveStatus').textContent = manual ? 'Saved locally' : 'Autosaved';
}

function loadStored(id) {
  try { return JSON.parse(localStorage.getItem(storageKey(id))); } catch { return null; }
}
function localExists(id) { return !!localStorage.getItem(storageKey(id)); }
function storageKey(id) { return `future-web-lab:${id}`; }

async function resetProject() {
  if (!activeClass || !confirm('Reset this project to the original files? Your local edits will be removed.')) return;
  localStorage.removeItem(storageKey(activeClass.id));
  await loadProject(activeClass);
  $('#saveStatus').textContent = 'Restored original';
}

let previewDebounce = null;
let previewBase = null;

async function updatePreview() {
  if (!activeClass) return;
  const htmlFile = activeClass.entry || [...files.keys()].find(r => /(^|\/)index\.html?$/i.test(r));
  if (!htmlFile || !files.has(htmlFile)) return;

  const htmlText = files.get(htmlFile)?.current ?? files.get(htmlFile)?.original ?? '';
  const documentHtml = await buildPreviewDocument(htmlText, htmlFile);
  const frame = $('#previewFrame');
  if (!frame) return;
  frame.srcdoc = documentHtml;
  $('#saveStatus').textContent = localExists(activeClass.id) ? 'Preview updated · local work saved' : 'Preview updated';
}

async function buildPreviewDocument(htmlText, entryFile) {
  const classBase = new URL(`classes/${encodeURIComponent(activeClass.slug)}/`, document.baseURI);
  const entryBase = new URL(pathDir(entryFile) ? `${pathDir(entryFile)}/` : '', classBase);
  const cssJobs = [];

  let out = htmlText;
  out = out.replace(/<base\b[^>]*>/gi, '');

  out = out.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi, (match, a, src, b) => {
    const key = normalizePath(pathDir(entryFile), src);
    const file = files.get(key);
    if (file && !file.binary) {
      return `<script${a}${b}>\n${file.current ?? file.original ?? ''}\n<\/script>`;
    }
    return `<script${a}src="${escapeAttr(new URL(src, entryBase).href)}"${b}></script>`;
  });

  out = out.replace(/<link\b([^>]*?)href=["']([^"']+\.css(?:\?[^"']*)?)["']([^>]*)>/gi, (match, a, href, b) => {
    const key = normalizePath(pathDir(entryFile), href.split('?')[0]);
    const file = files.get(key);
    if (file && !file.binary) {
      cssJobs.push({ key, css: file.current ?? file.original ?? '' });
      return '';
    }
    return `<link${a}href="${escapeAttr(new URL(href, entryBase).href)}"${b}>`;
  });

  // Keep local HTML assets resolvable against the deployed class directory.
  out = out.replace(/\b(src|href)=["']([^"']+)["']/gi, (match, attr, value) => {
    if (/^(https?:|data:|#|mailto:|javascript:|tel:|blob:)/i.test(value)) return match;
    const key = normalizePath(pathDir(entryFile), value);
    if (files.has(key) && files.get(key).binary) return `${attr}="${escapeAttr(new URL(key, classBase).href)}"`;
    return match;
  });

  const styles = [];
  for (const job of cssJobs) {
    let cssText = job.css;
    const cssBase = new URL(pathDir(job.key) ? `${pathDir(job.key)}/` : '', classBase);
    cssText = cssText.replace(/url\((["']?)([^)"']+)\1\)/gi, (match, quote, value) => {
      if (/^(https?:|data:|#|blob:)/i.test(value)) return match;
      const assetKey = normalizePath(pathDir(job.key), value);
      return files.has(assetKey) && files.get(assetKey).binary
        ? `url(${quote}${new URL(assetKey, classBase).href}${quote})`
        : `url(${quote}${new URL(value, cssBase).href}${quote})`;
    });
    styles.push(`<style>\n${cssText}\n</style>`);
  }

  const baseTag = `<base href="${escapeAttr(entryBase.href)}">`;
  if (/<head\b[^>]*>/i.test(out)) out = out.replace(/<head\b[^>]*>/i, m => `${m}${baseTag}${styles.join('')}`);
  else out = `${baseTag}${styles.join('')}${out}`;

  return out;
}

async function downloadZip(edited) {
  if (!activeClass) return;
  const zip = new JSZip();
  for (const [rel,item] of files) {
    if (rel === 'class.json') continue;
    if (item.binary) {
      try { const res=await fetch(item.url); if(res.ok) zip.file(rel, await res.blob()); } catch {}
    } else zip.file(rel, edited ? (item.current ?? item.original ?? '') : (item.original ?? ''));
  }
  zip.file('PROJECT-INFO.txt', `${activeClass.title}\n${siteConfig.brand?.name||'Web Lab'}\n\nGenerated by Web Lab.`);
  const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${activeClass.id}${edited?'-my-version':''}.zip`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function showWorkspaceNotice(text) { $('.editor-shell')?.remove(); workspaceShell.innerHTML = `<div class="workspace-empty"><div class="empty-icon">!</div><h3>Project needs attention</h3><p>${escapeHtml(text)}</p></div>`; }
function toggleFullscreen(el) { if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); }
function onGlobalShortcut(e) { if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); searchInput.focus(); } }
function isEditable(rel) { return /\.(html?|css|js|mjs|ts|json|md|svg)$/i.test(rel); }
function isBinary(rel) { return /\.(png|jpe?g|gif|webp|avif|mp4|webm|mp3|wav|ogg|woff2?|ttf|ico|pdf)$/i.test(rel); }
function extensionLabel(rel){const e=rel.split('.').pop().toUpperCase(); return e==='HTML'?'HTML':e==='CSS'?'CSS':e==='JS'||e==='MJS'?'JavaScript':e;}
function fileIcon(rel){if(/\.html?$/i.test(rel))return'◈';if(/\.css$/i.test(rel))return'◌';if(/\.(js|mjs|ts)$/i.test(rel))return'✦';if(/\.(png|jpe?g|webp|svg)$/i.test(rel))return'▧';if(/\.(mp4|webm|mp3|wav|ogg)$/i.test(rel))return'◉';return'·';}
function pathDir(p){const i=p.lastIndexOf('/'); return i<0?'':p.slice(0,i);}
function normalizePath(base, p){const parts=(base?base+'/':'').split('/').concat(p.split('/')); const out=[]; for(const x of parts){if(!x||x==='.')continue;if(x==='..')out.pop();else out.push(x)} return out.join('/');}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function escapeAttr(s=''){return escapeHtml(s);}

boot();

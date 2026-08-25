# Future Web Lab

A GitHub Pages-ready, file-driven web development learning lab with a futuristic UI, smart browser editor, live preview, local autosave, and ZIP export.

## The simplest GitHub workflow

You can manage classes directly from the GitHub website. No CMS, database, or backend is required.

### 1. Upload the main project once

Upload the project root to a GitHub repository. The repository must contain:

```text
.github/workflows/deploy.yml
classes/
src/
scripts/
site.config.json
package.json
README.md
```

Then go to **Settings → Pages** and set **Source = GitHub Actions**.

### 2. Add a class

The easiest browser-only workflow is to upload a class ZIP into `classes/`.

For example:

```text
classes/
└── 004-html-text-formatting.zip
```

The ZIP may contain either:

```text
004-html-text-formatting/
├── index.html
├── style.css
├── script.js
├── class.json          # optional
└── assets/
```

or even a wrapper such as:

```text
classes/004-html-text-formatting/
├── index.html
└── assets/
```

The build automatically finds the directory containing `index.html`, so you do not need to rearrange the archive manually.

### 3. Commit

GitHub Actions will automatically:

```text
Upload / commit
      ↓
Discover class folders + ZIP packages
      ↓
Read optional class.json
      ↓
Infer missing metadata
      ↓
Build static website
      ↓
Deploy to GitHub Pages
```

### `class.json` is optional

If you want complete control over the card title, description, category, level, tags, and other metadata, add `class.json`.

```json
{
  "id": "004-html-text-formatting",
  "title": "Text Formatting in HTML",
  "description": "Learn practical HTML text formatting.",
  "category": "HTML",
  "level": "Beginner",
  "tags": ["HTML", "Text Formatting"]
}
```

Without `class.json`, the builder can infer a title, category, tags, and HTML entry file.

## Student workflow

Students can open a class, browse its source files, edit HTML/CSS/JavaScript, see the live preview, keep local browser changes, reset to the original project, and download the modified project as a ZIP.

Student edits stay in the browser. They are never pushed back to GitHub.

## Branding

Edit `site.config.json` to change the instructor name, role, tagline, logo, avatar, GitHub, YouTube, and website links.

## Important folders

```text
classes/   ← teacher's class projects and class ZIPs
src/       ← website source code
dist/      ← generated during build; do not edit
scripts/   ← build automation
.github/   ← GitHub Pages deployment workflow
```

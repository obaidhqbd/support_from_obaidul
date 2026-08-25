# Classes upload area

Add either:

- a class folder, or
- a `.zip` containing a class project.

Each class should contain an `index.html` entry file. `class.json` is optional.

Example ZIP:

```text
001-my-first-page.zip
└── 001-my-first-page/
    ├── index.html
    ├── style.css
    ├── script.js
    └── assets/
```

The GitHub Actions build automatically discovers class folders and ZIP packages.

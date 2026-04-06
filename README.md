# vxUI

A lightweight, dependency-free UI framework for building clean admin interfaces. Design tokens, components, and a minimal SPA runtime — no jQuery, no build tools required.

## Quick Start

Open `index.html` in a browser to browse all components with live demos and code examples.

To start a new project, copy `examples/starter.html` and adjust it to your needs.

## Directory

```text
vxUI/
├── index.html                  ← Component showcase & documentation
├── css/
│   ├── vxui-framework.css      ← Core design tokens + all component styles
│   └── vxui-showcase.css       ← Additional showcase-only styles
├── js/
│   ├── vxui-framework.js       ← Runtime: router, sidebar, theme, auth, feedback
│   ├── vxui-components.js      ← Component builder helpers (VXUIComponents)
│   └── vxui-tmpui-bridge.js    ← Optional: adapter for tmpUI host integration
├── lib/
│   └── iconpark.js             ← Icon library (IconPark web components)
└── examples/
    ├── starter.html            ← Minimal integration template
    └── bridge.html             ← tmpUI bridge demo
```

## Minimal Setup

```html
<link rel="stylesheet" href="css/vxui-framework.css">
<script src="lib/iconpark.js"></script>
<script src="js/vxui-framework.js"></script>
```

```javascript
const app = new VXUIFramework({
  root: '#vx-app',
  authProvider: () => ({ loggedIn: true, user: { name: 'Admin' } })
});

app.registerViews({
  overview: {
    title: 'Overview',
    render: () => '<section class="vx-panel">Hello vxUI</section>'
  }
});

app.setNavigation([
  { view: 'overview', label: 'Overview', icon: 'house' }
]);

app.init();
```

## Core API

| Method | Description |
| --- | --- |
| `registerView(name, config)` | Register a named view with a `render` function. |
| `registerViews(map)` | Register multiple views from a plain object. |
| `setNavigation(items)` | Set the sidebar navigation array. |
| `navigate(name, state)` | Navigate to a view, updating the hash route. |
| `setTheme(mode)` / `cycleTheme()` | Switch theme (`light`, `dark`, `system`). |
| `refreshAuth()` | Re-evaluate auth state and update `data-auth` visibility. |
| `toastSuccess / toastWarning / toastError / toastInfo` | Show a timed toast notification. |
| `alert / confirm / prompt` | Promise-based replacement for native browser dialogs. |
| `openModal(options)` | Open a stacked modal dialog. |

## Component Helpers (VXUIComponents)

Include `js/vxui-components.js` for programmatic HTML builders:

```javascript
VXUIComponents.dataList({ columns, rows })
VXUIComponents.button({ label, icon, className })
VXUIComponents.iconButton({ icon, title })
VXUIComponents.moduleHeader({ title, icon, rightHtml })
VXUIComponents.tabStrip({ items })
VXUIComponents.selectionBar({ actions, caption })
VXUIComponents.switchItem({ title, description, checked })
```

## Design Tokens

All design values are CSS custom properties under `--vx-*`. Override any token to theme the framework:

```css
:root {
  --vx-primary: #2563eb;
  --vx-radius:  8px;
  --vx-font:    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

## Sidebar Behavior

- **Desktop** — `toggleSidebar()` collapses to a 64 px icon rail.
- **Mobile / portrait tablet** — `toggleSidebar()` opens a slide-in drawer with backdrop and scroll lock.

State classes are applied to the `.vx-layout` element:

| Class | Effect |
| --- | --- |
| `sidebar-collapsed` | Desktop collapse (64 px icon rail). |
| `sidebar-open` | Mobile drawer open. |
| `vx-logged-in` | Auth-state CSS visibility. |
| `vx-logged-out` | Auth-state CSS visibility. |

## Optional: tmpUI Bridge

For embedding vxUI inside a tmpUI host, use `js/vxui-tmpui-bridge.js`. See `examples/bridge.html` for a working demo.

## Boundaries

- The framework core does not handle uploads, file management, payments, AI, or any other business logic.
- No multi-language support in the core. Language switching is available as an optional UI feature.
- No build tools required. All files are plain CSS and vanilla JavaScript.

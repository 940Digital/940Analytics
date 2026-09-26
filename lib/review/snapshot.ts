/**
 * Turns a stored page snapshot into the document that gets framed in the
 * reviewer. The document differs by mode, so the frame is re-fetched when the
 * mode changes rather than patched in place.
 *
 * In "notes" mode the page is frozen on purpose:
 *
 *  1. Every <script> is removed. That is not only about safety. These sites
 *     gate their scroll animations behind a `.js` class that their own script
 *     adds, so with the scripts gone the page renders its no-JS fallback:
 *     everything visible, no intro overlay, no analytics beacon firing from
 *     inside a review. That is exactly the state you want to read copy in.
 *  2. Nothing is clickable. Every element is a target for a note instead.
 *
 * In "preview" mode the site runs. Its own scripts are left in, so menus,
 * accordions, sliders and buttons behave the way they will for a visitor, and
 * links walk between the pages held in this snapshot. What stops it being the
 * live site is the Content Security Policy on the response, not surgery on the
 * HTML: cross-origin scripts, every fetch/XHR/beacon, and every form submit are
 * refused by the browser. That is what keeps a preview from filing a real lead
 * or logging a session against the client's own analytics, and it holds even
 * for a tracker that builds its own script tag at runtime, which no regex over
 * the markup would have caught.
 *
 * Both modes get:
 *
 *  - A <base> so relative asset URLs resolve to the asset route for this
 *    review, which means stylesheets and images come back without rewriting a
 *    single attribute.
 *  - The annotation layer, which numbers every element so a comment can point
 *    at one, and talks to the parent window by postMessage.
 *
 * Processing happens on the way out rather than on the way in, so the raw
 * HTML stays untouched in the database and this layer can change without
 * re-pushing a snapshot.
 */

export type FrameMode = "notes" | "preview";

export function frameModeFrom(value: string | null): FrameMode {
  return value === "preview" ? "preview" : "notes";
}

/**
 * What the framed page is allowed to do. Both modes are locked down; preview
 * is the looser of the two only in that it may run the scripts that came with
 * the snapshot, all of which are served same-origin through the asset route.
 *
 * Styles, fonts, images and media are allowed off-origin because a preview
 * that silently loses its webfont or its hero image is lying about the design.
 * Scripts are not, which is what blocks the tracker. `connect-src 'none'` and
 * `form-action 'none'` mean nothing the page does can leave the browser.
 */
export function frameCsp(mode: FrameMode): string {
  const scripts =
    mode === "preview" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
  /* Preview allows embeds because a local business page without its map is not
     the page. Whatever loads in there is cross-origin to this document and
     cannot reach the review; the only thing it learns is that someone looked. */
  const frames = mode === "preview" ? "frame-src https:" : "frame-src 'none'";
  return [
    "default-src 'self'",
    scripts,
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' data: https:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'none'",
    "form-action 'none'",
    frames,
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SELF_CLOSING_SCRIPT = /<script\b[^>]*\/>/gi;

/** The in-frame agent. Written without backticks so it can live in a template. */
const ANNOTATOR = `
(function () {
  if (window.__rvReady) return;
  window.__rvReady = true;

  var ORIGIN = window.location.origin;
  var ASSET_BASE = window.__rvAssetBase || '';
  var selected = null;
  /* 'notes' is the working state: nothing on the page is pressable, every
     element is a target for a comment instead. 'preview' strips every trace of
     the tool off the page and lets the site behave, so it can be read and
     poked at the way a visitor will meet it. */
  var view = window.__rvMode === 'preview' ? 'preview' : 'notes';

  /* ---- number every element, in document order ---------------------- */
  /* Notes only. In preview the site is running for real, so the agent keeps
     its hands off the DOM: no attribute on every element, no extra last child
     under body for a 'body > *' rule to trip over. Mode cannot change without
     reloading this document, so there is nothing to set up for later. */
  var notesMode = view === 'notes';
  var all = notesMode && document.body ? document.body.querySelectorAll('*') : [];
  for (var i = 0; i < all.length; i++) all[i].setAttribute('data-rv-i', String(i));

  function ownText(node) {
    var out = '';
    for (var k = 0; k < node.childNodes.length; k++) {
      var c = node.childNodes[k];
      if (c.nodeType === 3 && c.nodeValue) out += c.nodeValue;
    }
    return out.trim();
  }

  function annotatable(node) {
    if (!node || node.nodeType !== 1) return false;
    var t = node.tagName;
    if (t === 'BODY' || t === 'HTML' || t === 'BR' || t === 'STYLE' || t === 'LINK') return false;
    if (node.id === 'rv-layer' || node.closest('#rv-layer')) return false;
    if (t === 'IMG' || t === 'PICTURE' || t === 'SVG') return true;
    return ownText(node).length > 1;
  }

  /* Inline dressing inside a sentence is not the unit anybody wants to edit.
     Clicking the italic half of a headline should offer the whole headline.
     Climbing has to be by tag rather than by "does the parent hold text of
     its own", because a heading split across two spans holds none: all of its
     words belong to its children. */
  var INLINE = { EM: 1, STRONG: 1, SPAN: 1, I: 1, B: 1, A: 1, SMALL: 1, U: 1, MARK: 1, BR: 1 };
  var BLOCK = {
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, P: 1, LI: 1, BLOCKQUOTE: 1,
    FIGCAPTION: 1, TD: 1, TH: 1, DT: 1, DD: 1, LABEL: 1, BUTTON: 1, SUMMARY: 1,
  };

  function nearest(node) {
    var found = null;
    while (node && node !== document.body) {
      if (annotatable(node)) { found = node; break; }
      node = node.parentElement;
    }
    if (!found) return null;

    while (
      INLINE[found.tagName] &&
      found.parentElement &&
      found.parentElement !== document.body &&
      (BLOCK[found.parentElement.tagName] || annotatable(found.parentElement))
    ) {
      found = found.parentElement;
    }
    return found;
  }

  function label(node) {
    var t = (node.tagName || '').toLowerCase();
    var s = (node.innerText || node.getAttribute('alt') || '').replace(/\\s+/g, ' ').trim();
    if (s.length > 70) s = s.slice(0, 70) + '\\u2026';
    return s ? t + ' \\u00b7 ' + s : t;
  }

  /* ---- styling. Outline and box-shadow only, because neither one moves
         anything on the page. Badges live in their own fixed layer for the
         same reason: setting position on a client's element would become a
         containing block and could shift their absolutely placed children. */
  var css = document.createElement('style');
  css.textContent =
    '[data-rv-hot]{outline:2px solid #3194E0!important;outline-offset:1px;cursor:crosshair}' +
    /* nothing on the page is pressable here, so nothing should look it */
    'html[data-rv-view="notes"] a,html[data-rv-view="notes"] button' +
      '{cursor:crosshair!important}' +
    /* the badges are part of the tool, so they go with it */
    'html[data-rv-view="preview"] #rv-layer{display:none}' +
    '[data-rv-sel]{outline:2px solid #3194E0!important;outline-offset:1px;' +
      'box-shadow:0 0 0 4px rgba(49,148,224,.28)!important}' +
    '#rv-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483000}' +
    '.rv-badge{position:absolute;min-width:22px;height:22px;border-radius:999px;' +
      'background:#3194E0;color:#fff;font:700 11px/22px ui-sans-serif,system-ui,sans-serif;' +
      'text-align:center;padding:0 6px;box-sizing:border-box;pointer-events:auto;' +
      'cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.4)}' +
    '.rv-badge[data-s="accepted"]{background:#2F9E56}' +
    '.rv-badge[data-s="declined"]{background:#7B7E85}' +
    '.rv-badge[data-s="resolved"]{background:#7B7E85}';
  document.head.appendChild(css);

  var layer = document.createElement('div');
  layer.id = 'rv-layer';
  if (notesMode) document.body.appendChild(layer);

  /* ---- hover ---------------------------------------------------------- */
  var hot = null;
  document.addEventListener('mouseover', function (e) {
    if (view !== 'notes') { if (hot) { hot.removeAttribute('data-rv-hot'); hot = null; } return; }
    var n = nearest(e.target);
    if (n === hot) return;
    if (hot) hot.removeAttribute('data-rv-hot');
    hot = n;
    if (hot) hot.setAttribute('data-rv-hot', '1');
  }, true);

  document.addEventListener('mouseleave', function () {
    if (hot) { hot.removeAttribute('data-rv-hot'); hot = null; }
  }, true);

  /* ---- click ----------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href]') : null;

    if (view === 'preview') {
      /* The site is live here, so buttons and scripts are left alone and only
         anchors need a word. The frame must not follow one itself: the asset
         route would serve raw HTML with no annotator and no way back, and a
         clean URL like /services is not an asset at all. So work out what the
         link points at and let the parent, which holds the page list, decide.
         Hashes, tel: and mailto: are the page's own business. */
      if (!link) return;
      var raw = link.getAttribute('href') || '';
      if (!raw || /^(tel:|mailto:|sms:|javascript:)/i.test(raw)) return;

      /* A fragment link has to be scrolled by hand. The <base> this document
         needs for its assets also becomes what a bare '#top' resolves against,
         so letting the browser follow one would walk out of the page and into
         the asset route. Nothing gave that away before, because every anchor
         used to have its default taken away whatever it pointed at. */
      if (raw.charAt(0) === '#') {
        e.preventDefault();
        var id = decodeURIComponent(raw.slice(1));
        if (!id) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        var t = document.getElementById(id) || document.getElementsByName(id)[0];
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      var href = link.href || '';
      e.preventDefault();
      if (href.indexOf(ORIGIN) !== 0) { post({ type: 'rv:extern', href: href }); return; }

      /* A relative href resolved against the <base> and landed under the asset
         route; a root-relative one ignored the base and landed at the top. Both
         are pages of this snapshot, so strip whichever prefix applies. */
      var path = href.slice(ORIGIN.length).split('#')[0].split('?')[0];
      if (path.indexOf(ASSET_BASE) === 0) path = path.slice(ASSET_BASE.length);
      post({ type: 'rv:navigate', path: path, href: href });
      return;
    }

    /* notes: nothing on the page is pressable, every click picks a target */
    if (link) e.preventDefault();

    var n = nearest(e.target);
    if (!n) return;
    select(n.getAttribute('data-rv-i'));
    e.preventDefault();
    e.stopPropagation();
    post({
      type: 'rv:select',
      anchor: n.getAttribute('data-rv-i'),
      label: label(n),
      text: (n.innerText || '').replace(/\\s+\\n/g, '\\n').trim(),
      tag: (n.tagName || '').toLowerCase()
    });
  }, true);

  function select(anchor) {
    if (selected) selected.removeAttribute('data-rv-sel');
    selected = anchor == null ? null : document.querySelector('[data-rv-i="' + anchor + '"]');
    if (selected) selected.setAttribute('data-rv-sel', '1');
  }

  /* ---- badges --------------------------------------------------------- */
  var marks = [];
  var queued = false;

  function draw() {
    queued = false;
    if (!notesMode) return;
    layer.textContent = '';
    for (var m = 0; m < marks.length; m++) {
      var el = document.querySelector('[data-rv-i="' + marks[m].anchor + '"]');
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.bottom < -40 || r.top > window.innerHeight + 40) continue;
      var b = document.createElement('div');
      b.className = 'rv-badge';
      b.textContent = String(marks[m].n);
      b.setAttribute('data-s', marks[m].status || 'open');
      b.style.left = Math.max(2, r.left - 9) + 'px';
      b.style.top = Math.max(2, r.top - 9) + 'px';
      b.setAttribute('data-thread', marks[m].id);
      layer.appendChild(b);
    }
  }

  function redraw() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(draw);
  }

  layer.addEventListener('click', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-thread');
    if (id) post({ type: 'rv:open', id: id });
  });

  /* Toggling modes reloads this document, because whether the site's scripts
     run is baked into it. Handing the scroll position back and forth is what
     stops that reload throwing the reader back to the top of the page. */
  var lastY = 0;
  window.addEventListener('scroll', function () {
    redraw();
    var y = window.scrollY || 0;
    if (Math.abs(y - lastY) < 40) return;
    lastY = y;
    post({ type: 'rv:scroll', y: y });
  }, { passive: true });
  window.addEventListener('resize', redraw);

  /* ---- parent channel -------------------------------------------------- */
  function post(msg) { window.parent.postMessage(msg, ORIGIN); }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data) return;
    if (e.data.type === 'rv:marks') { marks = e.data.marks || []; redraw(); }
    if (e.data.type === 'rv:view') {
      view = e.data.view === 'preview' ? 'preview' : 'notes';
      if (view !== 'notes') {
        if (hot) { hot.removeAttribute('data-rv-hot'); hot = null; }
        select(null);
      }
      document.documentElement.setAttribute('data-rv-view', view);
    }
    if (e.data.type === 'rv:select') { select(e.data.anchor); }
    if (e.data.type === 'rv:scrollY') {
      window.scrollTo(0, e.data.y || 0);
      lastY = e.data.y || 0;
    }
    if (e.data.type === 'rv:scrollTo') {
      var el = document.querySelector('[data-rv-i="' + e.data.anchor + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.documentElement.setAttribute('data-rv-view', view);

  post({ type: 'rv:ready', count: all.length, view: view });
})();
`;

export function buildFrameHtml(rawHtml: string, assetBase: string, mode: FrameMode = "notes"): string {
  const base = assetBase.endsWith("/") ? assetBase : assetBase + "/";

  /* Preview keeps the site's scripts so the site behaves; the CSP on the
     response is what keeps them harmless. Notes drops them, which is how the
     page renders its no-JS fallback with every section already visible. */
  let html = mode === "preview" ? rawHtml : rawHtml.replace(SCRIPT_TAG, "").replace(SELF_CLOSING_SCRIPT, "");

  const baseTag = `<base href="${base}">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  } else {
    html = baseTag + html;
  }

  /* The agent's own settings go in first and separately, so the annotator
     itself stays a constant string with nothing interpolated into it. */
  const settings =
    `<script>window.__rvMode=${JSON.stringify(mode)};window.__rvAssetBase=${JSON.stringify(base)};</script>`;
  const agent = `${settings}<script>${ANNOTATOR}</script>`;
  if (/<\/body\s*>/i.test(html)) {
    html = html.replace(/<\/body\s*>/i, `${agent}</body>`);
  } else {
    html += agent;
  }

  return html;
}

/** Content types for the handful of things a static site actually ships. */
export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp4": "video/mp4",
  };
  return map[ext] || "application/octet-stream";
}

/** Text assets are stored as-is; everything else as base64. */
export function isTextAsset(path: string): boolean {
  return /\.(css|js|json|svg|html|txt|xml)$/i.test(path);
}

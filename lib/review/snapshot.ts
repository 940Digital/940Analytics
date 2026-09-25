/**
 * Turns a stored page snapshot into the document that gets framed in the
 * reviewer.
 *
 * Three changes are made to the client's own HTML and nothing else:
 *
 *  1. Every <script> is removed. That is not only about safety. These sites
 *     gate their scroll animations behind a `.js` class that their own script
 *     adds, so with the scripts gone the page renders its no-JS fallback:
 *     everything visible, no intro overlay, no analytics beacon firing from
 *     inside a review. That is exactly the state you want to read copy in.
 *  2. A <base> is inserted so relative asset URLs resolve to the asset route
 *     for this review, which means stylesheets and images come back without
 *     rewriting a single attribute.
 *  3. The annotation layer is appended. It numbers every element so a comment
 *     can point at one, and talks to the parent window by postMessage.
 *
 * Processing happens on the way out rather than on the way in, so the raw
 * HTML stays untouched in the database and this layer can change without
 * re-pushing a snapshot.
 */

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SELF_CLOSING_SCRIPT = /<script\b[^>]*\/>/gi;

/** The in-frame agent. Written without backticks so it can live in a template. */
const ANNOTATOR = `
(function () {
  if (window.__rvReady) return;
  window.__rvReady = true;

  var ORIGIN = window.location.origin;
  var selected = null;
  /* 'notes' turns every click into a comment; 'browse' hands the page back so
     links and buttons behave the way the visitor will experience them. */
  var mode = 'notes';

  /* ---- number every element, in document order ---------------------- */
  var all = document.body ? document.body.querySelectorAll('*') : [];
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
    /* nothing should look pressable while notes are the point */
    'html[data-rv-mode="notes"] a,html[data-rv-mode="notes"] button{cursor:crosshair!important}' +
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
  document.body.appendChild(layer);

  /* ---- hover ---------------------------------------------------------- */
  var hot = null;
  document.addEventListener('mouseover', function (e) {
    if (mode !== 'notes') { if (hot) { hot.removeAttribute('data-rv-hot'); hot = null; } return; }
    var n = nearest(e.target);
    if (n === hot) return;
    if (hot) hot.removeAttribute('data-rv-hot');
    hot = n;
    if (hot) hot.setAttribute('data-rv-hot', '1');
  }, true);

  document.addEventListener('mouseleave', function () {
    if (hot) { hot.removeAttribute('data-rv-hot'); hot = null; }
  }, true);

  /* ---- click: select, or follow an internal link ---------------------- */
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href]') : null;

    /* Browsing: let the page be the page. Internal links still change the
       reviewer's own page rather than loading a file out of the asset route,
       and outside links stay put, because a review is not a place to wander
       off to someone else's site. */
    if (mode !== 'notes') {
      if (!link) return;
      var to = link.getAttribute('href') || '';
      e.preventDefault();
      if (to && to.charAt(0) !== '#' && !/^(https?:|mailto:|tel:)/i.test(to)) {
        post({ type: 'rv:nav', href: to.split('/').pop() });
      } else if (to.charAt(0) === '#') {
        var anchorEl = document.getElementById(to.slice(1));
        if (anchorEl) anchorEl.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (link) {
      var href = link.getAttribute('href') || '';
      e.preventDefault();
      e.stopPropagation();
      if (href && href.charAt(0) !== '#' && !/^(https?:|mailto:|tel:)/i.test(href)) {
        post({ type: 'rv:nav', href: href.split('/').pop() });
        return;
      }
      if (href.charAt(0) === '#') {
        var target = document.getElementById(href.slice(1));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      return; /* external links do nothing inside a review */
    }

    var n = nearest(e.target);
    if (!n) return;
    e.preventDefault();
    e.stopPropagation();
    select(n.getAttribute('data-rv-i'));
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

  window.addEventListener('scroll', redraw, { passive: true });
  window.addEventListener('resize', redraw);

  /* ---- parent channel -------------------------------------------------- */
  function post(msg) { window.parent.postMessage(msg, ORIGIN); }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data) return;
    if (e.data.type === 'rv:marks') { marks = e.data.marks || []; redraw(); }
    if (e.data.type === 'rv:mode') {
      mode = e.data.mode === 'browse' ? 'browse' : 'notes';
      if (mode !== 'notes') {
        if (hot) { hot.removeAttribute('data-rv-hot'); hot = null; }
        select(null);
      }
      document.documentElement.setAttribute('data-rv-mode', mode);
    }
    if (e.data.type === 'rv:select') { select(e.data.anchor); }
    if (e.data.type === 'rv:scrollTo') {
      var el = document.querySelector('[data-rv-i="' + e.data.anchor + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  /* set before the parent's first message, so the cursor is right from the
     opening frame rather than after a round trip */
  document.documentElement.setAttribute('data-rv-mode', mode);

  post({ type: 'rv:ready', count: all.length });
})();
`;

export function buildFrameHtml(rawHtml: string, assetBase: string): string {
  let html = rawHtml.replace(SCRIPT_TAG, "").replace(SELF_CLOSING_SCRIPT, "");

  const baseTag = `<base href="${assetBase.endsWith("/") ? assetBase : assetBase + "/"}">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  } else {
    html = baseTag + html;
  }

  const agent = `<script>${ANNOTATOR}</script>`;
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

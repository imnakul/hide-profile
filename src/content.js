(() => {
  const site = HP.siteForHost(location.hostname);
  if (!site) return;

  const ATTR = 'data-hp';
  const MEDIA = 'data-hp-media';
  const ORIG = 'data-hp-orig';
  const COUNT = 'data-hp-count';
  const REVEAL = 'data-hp-reveal';
  const imgSel = site.img.join(',');
  const bgSel = (site.bg || []).join(',');
  const mediaSel = (site.media || []).join(',');
  const EASE = 'cubic-bezier(.23,1,.32,1)';

  let settings = HP.DEFAULTS;
  let active = false;
  let styleEl = null;
  let rafId = 0;
  const pending = new Set();

  // ---------- Detection ----------

  const isRound = (value, width) => {
    const n = parseFloat(value);
    if (!n) return false;
    return value.endsWith('%') ? n >= 40 : n >= width * 0.4;
  };

  // Avatars are small, square and clipped to a circle — either on the image
  // itself or on a wrapper of roughly the same size.
  function looksLikeAvatar(el) {
    const r = el.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    if (w < 18 || w > 200 || Math.abs(w - h) > Math.max(2, w * 0.1)) return false;
    if (el instanceof SVGElement) return true;

    let node = el;
    for (let i = 0; i < 4 && node && node !== document.body; i++, node = node.parentElement) {
      const nr = i === 0 ? r : node.getBoundingClientRect();
      if (nr.width > w * 1.4 + 4 || nr.height > h * 1.4 + 4) break;
      const cs = getComputedStyle(node);
      if (isRound(cs.borderTopLeftRadius, nr.width)) return true;
      if (/^(circle|ellipse)/.test(cs.clipPath)) return true;
    }
    return false;
  }

  // Post photos and thumbnails: anything big enough not to be an icon or emoji.
  function looksLikeMedia(el) {
    const r = el.getBoundingClientRect();
    return r.width >= 120 && r.height >= 80;
  }

  // ---------- Marking ----------

  function mark(el, kind) {
    if (el.getAttribute(ATTR) !== kind) el.setAttribute(ATTR, kind);
    if (kind === 'svg' && settings.mode === 'replace') swapSvg(el);
  }

  function unmark(el) {
    if (el.hasAttribute(ORIG)) restoreSvg(el);
    el.removeAttribute(ATTR);
    el.removeAttribute(MEDIA);
    el.removeAttribute(COUNT);
  }

  function swapSvg(el) {
    if (el.hasAttribute(ORIG)) return;
    el.setAttribute(ORIG, el.getAttribute('href') ?? '');
    el.setAttribute('href', HP.avatarUrl(settings));
  }

  function restoreSvg(el) {
    const orig = el.getAttribute(ORIG);
    if (orig) el.setAttribute('href', orig);
    else el.removeAttribute('href');
    el.removeAttribute(ORIG);
  }

  function queue(el) {
    if (el.hasAttribute(ATTR) || el.hasAttribute(MEDIA)) return;
    pending.add(el);
    // rAF runs after layout but before paint, so heuristic matches never flash.
    rafId ||= requestAnimationFrame(flush);
  }

  function flush() {
    rafId = 0;
    for (const el of pending) {
      if (!el.isConnected || el.hasAttribute(ATTR) || el.hasAttribute(MEDIA)) continue;
      if (settings.smart && looksLikeAvatar(el)) {
        mark(el, el instanceof SVGElement ? 'svg' : 'img');
      } else if (settings.media && el.tagName === 'IMG' && looksLikeMedia(el)) {
        el.setAttribute(MEDIA, '');
      }
    }
    pending.clear();
  }

  function scan(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      checkText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const each = (sel, fn) => {
      if (!sel) return;
      if (root.matches(sel)) fn(root);
      root.querySelectorAll(sel).forEach(fn);
    };
    each(imgSel, (el) => mark(el, 'img'));
    each(bgSel, (el) => mark(el, 'bg'));
    if (settings.smart || settings.media) each('img', queue);
    if (site.svg) each('svg image', queue);
    if (settings.media) each(mediaSel, (el) => el.setAttribute(MEDIA, ''));
    if (settings.words || settings.counts) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) checkText(n);
    }
  }

  function clearMarks() {
    document.querySelectorAll(`[${ATTR}],[${MEDIA}],[${COUNT}]`).forEach(unmark);
  }

  function checkText(node) {
    if (settings.words) maskText(node);
    if (settings.counts) markCount(node);
  }

  // ---------- Follower counts ----------

  // Number and label are often split across spans ("<b>1.2K</b> Followers"),
  // so climb from the text node to the smallest short ancestor that reads as a
  // count as a whole. Language-agnostic markup, English labels only.
  const COUNT_PART = /^(?:[\d.,]+\s*[KMB]?\+?|followers?|following|subscribers?|connections?|friends)$/i;

  function markCount(node) {
    const text = node.data.trim();
    if (!text || text.length > 40) return;
    if (!COUNT_PART.test(text) && !HP.COUNT_RE.test(text)) return;
    let el = node.parentElement;
    for (let i = 0; i < 4 && el && el !== document.body; i++, el = el.parentElement) {
      if (el.hasAttribute(COUNT)) return;
      const full = el.textContent.replace(/\s+/g, ' ').trim();
      if (full.length > 40) return;
      if (HP.COUNT_RE.test(full)) {
        el.setAttribute(COUNT, '');
        return;
      }
    }
  }

  // ---------- Reveal one post ----------

  // Post containers across supported sites; `article` covers X, Bluesky,
  // Threads, DEV and Medium.
  const POST_SEL = [
    'article',
    '[role="article"]',
    'shreddit-post',
    'shreddit-comment',
    '.feed-shared-update-v2',
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-comment-thread-renderer',
    'li',
  ].join(',');

  let revealed = null;

  function hideRevealed() {
    revealed?.removeAttribute(REVEAL);
    revealed = null;
  }

  // Toggles the reveal on the post holding keyboard focus, or the one under
  // the pointer when nothing is focused. Only one post is revealed at a time.
  function revealPost() {
    const focused = document.activeElement !== document.body ? document.activeElement : null;
    const hovered = [...document.querySelectorAll(':hover')].pop();
    const post = focused?.closest(POST_SEL) || hovered?.closest(POST_SEL);
    if (!post || post === revealed) return hideRevealed();
    hideRevealed();
    post.setAttribute(REVEAL, '');
    revealed = post;
  }

  // Moving focus to another post hides the revealed one again.
  document.addEventListener('focusin', (e) => {
    if (revealed && !revealed.contains(e.target)) hideRevealed();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'reveal-post' && active) revealPost();
  });

  // ---------- Swear words ----------

  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
  const masked = new Map(); // text node -> { orig, text }

  function maskText(node) {
    const parent = node.parentElement;
    if (!parent || SKIP_TEXT.has(parent.tagName) || parent.isContentEditable) return;
    HP.WORDS_RE.lastIndex = 0;
    if (!HP.WORDS_RE.test(node.data)) return;

    const orig = masked.get(node)?.orig ?? node.data;
    const text = node.data.replace(HP.WORDS_RE, (w) => w[0] + '•'.repeat(w.length - 1));
    masked.set(node, { orig, text });
    node.data = text;

    if (masked.size > 2000) {
      for (const n of masked.keys()) if (!n.isConnected) masked.delete(n);
    }
  }

  function restoreText() {
    // Skip nodes the page has rewritten since we masked them.
    for (const [node, { orig, text }] of masked) if (node.data === text) node.data = orig;
    masked.clear();
  }

  // ---------- Styles ----------

  function buildCSS(s) {
    // With "reveal on hover", every rule steps aside while the avatar (or its
    // direct wrapper) is hovered. Everything inside a post revealed with the
    // shortcut is always left alone.
    const nr = `:not([${REVEAL}] *)`;
    const nh = (s.reveal ? ':not(:hover):not(:hover > *)' : '') + nr;
    const img = `img[${ATTR}]${nh}`;
    const bg = `[${ATTR}="bg"]${nh}`;
    const svg = `image[${ATTR}]${nh}`;
    let css = `[${ATTR}],[${MEDIA}],[${COUNT}],video{transition:filter .25s ${EASE},opacity .25s ${EASE}!important}`;

    if (s.mode === 'blur') {
      css += `${img},${bg},${svg}{filter:blur(10px) saturate(.6)!important}`;
    } else if (s.mode === 'hide') {
      css += `${img}{content:url("${HP.BLANK}")!important}`;
      css += `${bg}{background-image:url("${HP.BLANK}")!important}`;
      css += `${svg}{opacity:0!important}`;
    } else {
      const url = HP.avatarUrl(s);
      css += `${img}{content:url("${url}")!important;object-fit:cover!important}`;
      css += `${bg}{background-image:url("${url}")!important;background-size:cover!important}`;
    }

    if (s.media) {
      // Videos sit under player overlays (controls, captions), so a hover
      // anywhere in the player reveals them.
      const vh = (s.reveal ? ':not(:hover > *, :hover > * > *, :hover > * > * > *)' : '') + nr;
      const blur = 'filter:blur(28px) saturate(.5)!important';
      // Containers (X cards) blur their children so their own rounded clip
      // contains the bleed; images and videos clip it to their box.
      css += `img[${MEDIA}]${nh},video${vh}{${blur};clip-path:inset(0)}`;
      css += `[${MEDIA}]:not(img)${s.reveal ? ':not(:hover)' : ''}${nr} > *{${blur};transform:scale(1.15)}`;
      css += `[${MEDIA}]:not(img) > *{transition:filter .25s ${EASE},transform .25s ${EASE}!important}`;
    }

    if (s.counts) css += `[${COUNT}]${nh}{filter:blur(5px)!important}`;
    return css;
  }

  // ---------- Lifecycle ----------

  const observer = new MutationObserver((mutations) => {
    if (!styleEl.isConnected) document.documentElement.append(styleEl);
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) scan(n);
      } else if (m.type === 'characterData') {
        checkText(m.target);
      } else {
        // src/style swapped on a recycled element: re-evaluate from scratch.
        unmark(m.target);
        scan(m.target);
      }
    }
  });

  function apply() {
    const on = settings.enabled && settings.sites[site.id] !== false;
    observer.disconnect();
    clearMarks();
    if (!on || !settings.words) restoreText();

    if (!on) {
      hideRevealed();
      styleEl?.remove();
      active = false;
      return;
    }

    styleEl ||= Object.assign(document.createElement('style'), { id: 'hide-profile' });
    styleEl.textContent = buildCSS(settings);
    if (!styleEl.isConnected) document.documentElement.append(styleEl);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: settings.words || settings.counts,
      attributes: true,
      attributeFilter: bgSel ? ['src', 'style'] : ['src'],
    });
    active = true;
    scan(document.documentElement);
  }

  const watchImages = () => active && (settings.smart || settings.media);

  // Images often have no size until they load, and lazy ones appear on scroll.
  document.addEventListener(
    'load',
    (e) => watchImages() && e.target.tagName === 'IMG' && queue(e.target),
    true
  );
  window.addEventListener(
    'scrollend',
    () => watchImages() && document.querySelectorAll(`img:not([${ATTR}],[${MEDIA}])`).forEach(queue),
    { passive: true }
  );

  chrome.storage.onChanged.addListener(async (_, area) => {
    if (area !== 'local') return;
    settings = await HP.loadSettings();
    apply();
  });

  HP.loadSettings().then((s) => {
    settings = s;
    apply();
  });
})();

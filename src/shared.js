// Shared between the content script, popup and service worker.
// Exposed as a global so it works in all three without a bundler.
(() => {
  const svg = (body) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`
    );

  const gradient = (from, to) =>
    svg(`
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
        </linearGradient>
        <radialGradient id="h" cx=".28" cy=".24" r=".6">
          <stop offset="0" stop-color="#fff" stop-opacity=".45"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill="url(#g)"/>
      <rect width="64" height="64" fill="url(#h)"/>`);

  const PRESETS = [
    {
      id: 'silhouette',
      name: 'Silhouette',
      url: svg(`
        <rect width="64" height="64" fill="#d4d4d8"/>
        <circle cx="32" cy="25" r="11" fill="#a1a1aa"/>
        <ellipse cx="32" cy="60" rx="22" ry="17" fill="#a1a1aa"/>`),
    },
    { id: 'aurora', name: 'Aurora', url: gradient('#6366f1', '#c026d3') },
    { id: 'sunset', name: 'Sunset', url: gradient('#fb923c', '#e11d48') },
    { id: 'mint', name: 'Mint', url: gradient('#34d399', '#0891b2') },
    {
      id: 'smile',
      name: 'Smile',
      url: svg(`
        <rect width="64" height="64" fill="#fde047"/>
        <circle cx="24" cy="28" r="3.5" fill="#1c1917"/>
        <circle cx="40" cy="28" r="3.5" fill="#1c1917"/>
        <path d="M22 38q10 10 20 0" stroke="#1c1917" stroke-width="3.5" stroke-linecap="round" fill="none"/>`),
    },
    {
      id: 'ghost',
      name: 'Ghost',
      url: svg(`
        <rect width="64" height="64" fill="#312e81"/>
        <path d="M18 56V30a14 14 0 0 1 28 0v26l-4.67-4-4.66 4L32 52l-4.67 4-4.66-4z" fill="#eef2ff"/>
        <ellipse cx="27" cy="32" rx="2.5" ry="3.5" fill="#312e81"/>
        <ellipse cx="37" cy="32" rx="2.5" ry="3.5" fill="#312e81"/>`),
    },
    {
      id: 'moon',
      name: 'Moon',
      url: svg(`
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#0f172a"/>
          </linearGradient>
          <mask id="m"><rect width="64" height="64" fill="#fff"/><circle cx="41" cy="25" r="12" fill="#000"/></mask>
        </defs>
        <rect width="64" height="64" fill="url(#g)"/>
        <circle cx="32" cy="33" r="15" fill="#fde68a" mask="url(#m)"/>
        <circle cx="48" cy="44" r="1.3" fill="#fef3c7"/>
        <circle cx="16" cy="16" r="1" fill="#fef3c7"/>
        <circle cx="50" cy="14" r="1" fill="#fef3c7" opacity=".7"/>`),
    },
  ];

  const BLANK = svg('<rect width="64" height="64" fill="#808080" fill-opacity=".28"/>');

  // `img`: selectors for <img> avatars, `bg`: elements painting the avatar as a
  // background-image, `svg`: avatars drawn with <svg><image>. Anything not
  // covered here is caught by smart detection (small, square, circular images).
  const SITES = [
    {
      id: 'x',
      name: 'X / Twitter',
      hosts: ['x.com', 'twitter.com'],
      img: ['img[src*="pbs.twimg.com/profile_images"]', 'img[src*="default_profile_images"]'],
      bg: ['[data-testid^="UserAvatar-Container"] div[style*="background-image"]'],
      // X paints post media as background images, so blur the containers.
      media: ['[data-testid="tweetPhoto"]', '[data-testid="card.layoutLarge.media"]', '[data-testid="card.layoutSmall.media"]'],
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      hosts: ['linkedin.com'],
      img: [
        'img[src*="profile-displayphoto"]',
        'img[src*="profile-framedphoto"]',
        'img.presence-entity__image',
        'img[class*="EntityPhoto-circle"]',
        'img.update-components-actor__avatar-image',
      ],
    },
    { id: 'peerlist', name: 'Peerlist', hosts: ['peerlist.io'], img: [] },
    {
      id: 'github',
      name: 'GitHub',
      hosts: ['github.com'],
      img: ['img.avatar', 'img.avatar-user', 'img[src*="avatars.githubusercontent.com"]'],
    },
    {
      id: 'reddit',
      name: 'Reddit',
      hosts: ['reddit.com'],
      img: [
        'img[src*="styles.redditmedia.com"]',
        'img[src*="redditstatic.com/avatars"]',
        'img[alt*="avatar" i]',
      ],
    },
    {
      id: 'youtube',
      name: 'YouTube',
      hosts: ['youtube.com'],
      img: [
        '#avatar img',
        '#author-thumbnail img',
        'yt-avatar-shape img',
        'img[src*="yt3.ggpht.com"]',
      ],
    },
    {
      id: 'instagram',
      name: 'Instagram',
      hosts: ['instagram.com'],
      img: ['img[alt*="profile picture" i]'],
    },
    {
      id: 'threads',
      name: 'Threads',
      hosts: ['threads.net', 'threads.com'],
      img: ['img[alt*="profile picture" i]'],
    },
    { id: 'facebook', name: 'Facebook', hosts: ['facebook.com'], img: [], svg: true },
    {
      id: 'bluesky',
      name: 'Bluesky',
      hosts: ['bsky.app'],
      img: ['img[src*="/img/avatar"]', 'img[src*="avatar_thumbnail"]'],
    },
    { id: 'devto', name: 'DEV', hosts: ['dev.to'], img: ['img.crayons-avatar__image'] },
    { id: 'medium', name: 'Medium', hosts: ['medium.com'], img: [] },
  ];

  const DEFAULTS = {
    enabled: true,
    mode: 'blur', // 'blur' | 'hide' | 'replace'
    avatar: 'aurora', // preset id or 'custom'
    customAvatar: null, // data URL
    reveal: true,
    smart: true,
    words: false, // mask swear words
    media: false, // blur post images & videos
    sites: Object.fromEntries(SITES.map((s) => [s.id, true])),
  };

  // Swear words: English, romanised Hindi and Devanagari. Each entry is a stem;
  // any letters after it are matched too ("fuck" → "fucking").
  const WORDS = [
    'fuck', 'motherfuck', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dickhead',
    'cunt', 'slut', 'whore', 'wanker', 'twat', 'porn',
    'chutiy', 'bhenchod', 'behenchod', 'bhanchod', 'madarchod', 'maderchod',
    'bhosdi', 'bhosad', 'gaandu', 'gandu', 'lauda', 'lavda', 'harami', 'jhaat', 'chod',
    'चूतिय', 'चुतिय', 'भेनचोद', 'बहनचोद', 'मादरचोद', 'भोसड़', 'भोसड', 'गांडू', 'लंड', 'लौड़',
    'रंडी', 'हरामी', 'झाट',
  ];

  // Letters may be swapped for look-alikes or symbols: f*ck, sh1t, b!tch.
  const LOOKALIKE = { a: 'a@4*', e: 'e3*', i: 'i1!*', o: 'o0*', u: 'u*v', s: 's$5' };
  const escape = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = (word) =>
    [...word].map((c) => (LOOKALIKE[c] ? `[${escape(LOOKALIKE[c])}]` : escape(c))).join('');
  const WORDS_RE = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${[...new Set(WORDS)].map(pattern).join('|')})[\\p{L}\\p{M}]*`,
    'giu'
  );

  const siteForHost = (host) => {
    host = host.replace(/^www\./, '');
    return SITES.find((s) => s.hosts.some((h) => host === h || host.endsWith('.' + h)));
  };

  const avatarUrl = (settings) =>
    settings.avatar === 'custom' && settings.customAvatar
      ? settings.customAvatar
      : (PRESETS.find((p) => p.id === settings.avatar) || PRESETS[1]).url;

  const loadSettings = async () => {
    const stored = await chrome.storage.local.get(null);
    return { ...DEFAULTS, ...stored, sites: { ...DEFAULTS.sites, ...stored.sites } };
  };

  globalThis.HP = { PRESETS, BLANK, SITES, DEFAULTS, WORDS_RE, siteForHost, avatarUrl, loadSettings };
})();

const $ = (sel) => document.querySelector(sel);
const MODES = ['blur', 'hide', 'replace'];

const ICON_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_PEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L8 20H4v-4z"/></svg>';

// Stand-in "photos" for the preview, so each style can be seen at a glance.
const face = (bg, skin, hair, shirt) =>
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="${bg}"/>
    <ellipse cx="32" cy="64" rx="24" ry="16" fill="${shirt}"/>
    <rect x="27" y="38" width="10" height="12" rx="4" fill="${skin}"/>
    <ellipse cx="32" cy="29" rx="12" ry="13.5" fill="${skin}"/>
    <path d="M19.5 28c0-10 6-15 12.5-15S44.5 18 44.5 28c-3-5-7-7.5-12.5-7.5S22.5 23 19.5 28z" fill="${hair}"/>
  </svg>`);

const SAMPLES = [
  face('#bfdbfe', '#f1c7a5', '#3f2a1d', '#1e3a8a'),
  face('#fde68a', '#c68b62', '#111827', '#065f46'),
  face('#fecdd3', '#f5d0b5', '#a16207', '#7c2d12'),
];

let settings;
let currentSite = null;

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.local.set(patch);
  render();
}

// ---------- Rendering ----------

function renderStatus() {
  const el = $('#status');
  const text = $('#statusText');
  if (!settings.enabled) {
    el.dataset.state = 'off';
    text.textContent = 'Turned off';
  } else if (!currentSite) {
    el.dataset.state = 'idle';
    text.textContent = 'Not running on this page';
  } else if (!settings.sites[currentSite.id]) {
    el.dataset.state = 'paused';
    text.textContent = `Paused on ${currentSite.name}`;
  } else {
    el.dataset.state = 'on';
    text.textContent = `Active on ${currentSite.name}`;
  }
}

function renderPreview() {
  const preview = $('.preview');
  const changed =
    'mode' in preview.dataset &&
    (preview.dataset.mode !== settings.mode || preview.dataset.avatar !== settings.avatar);
  preview.dataset.mode = settings.mode;
  preview.dataset.avatar = settings.avatar;

  preview.querySelectorAll('.pv-avatar').forEach((img, i) => {
    const src =
      settings.mode === 'hide' ? HP.BLANK : settings.mode === 'replace' ? HP.avatarUrl(settings) : SAMPLES[i];
    if (img.getAttribute('src') === src) return;
    img.src = src;
    if (changed && settings.mode !== 'blur') {
      img.classList.remove('pop');
      void img.offsetWidth; // restart the animation
      img.classList.add('pop');
    }
  });
}

function renderMode() {
  const i = MODES.indexOf(settings.mode);
  $('#mode').style.setProperty('--i', i);
  document.querySelectorAll('#mode button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
  });
  $('#avatarPanel').toggleAttribute('data-open', settings.mode === 'replace');
}

function renderAvatars() {
  const wrap = $('#avatars');
  wrap.textContent = '';

  for (const p of HP.PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.role = 'radio';
    b.title = p.name;
    b.setAttribute('aria-checked', String(settings.avatar === p.id));
    b.innerHTML = `<img alt="${p.name}">`;
    b.firstChild.src = p.url;
    b.onclick = () => save({ avatar: p.id });
    wrap.append(b);
  }

  const custom = document.createElement('button');
  custom.type = 'button';
  custom.role = 'radio';
  if (settings.customAvatar) {
    const selected = settings.avatar === 'custom';
    custom.className = 'tile';
    custom.title = selected ? 'Change your image' : 'Your image';
    custom.setAttribute('aria-checked', String(selected));
    custom.innerHTML = `<img alt="Your image"><span class="tile-edit">${ICON_PEN}</span>`;
    custom.firstChild.src = settings.customAvatar;
    custom.onclick = () => (selected ? $('#upload').click() : save({ avatar: 'custom' }));
  } else {
    custom.className = 'tile tile-upload';
    custom.title = 'Upload your own';
    custom.setAttribute('aria-checked', 'false');
    custom.innerHTML = ICON_PLUS;
    custom.onclick = () => $('#upload').click();
  }
  wrap.append(custom);
}

function renderSites() {
  const wrap = $('#sites');
  wrap.textContent = '';

  // Current site first, the rest in their defined order.
  const sites = [...HP.SITES].sort((a, b) => (b === currentSite) - (a === currentSite));

  for (const site of sites) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.innerHTML = `<span class="chip-icon">${site.name[0]}</span>${site.name}${
      site === currentSite ? '<span class="chip-here" title="This tab"></span>' : ''
    }`;
    chip.setAttribute('aria-pressed', String(settings.sites[site.id] !== false));
    chip.onclick = () => {
      const on = settings.sites[site.id] === false;
      chip.setAttribute('aria-pressed', String(on));
      save({ sites: { ...settings.sites, [site.id]: on } });
    };
    wrap.append(chip);
  }
}

function render() {
  $('#enabled').checked = settings.enabled;
  $('#reveal').checked = settings.reveal;
  $('#smart').checked = settings.smart;
  $('#words').checked = settings.words;
  $('#media').checked = settings.media;
  $('.app').toggleAttribute('data-off', !settings.enabled);
  renderStatus();
  renderMode();
  renderPreview();
  renderAvatars();
}

// ---------- Custom avatar ----------

async function toAvatar(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  canvas
    .getContext('2d')
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 160, 160);
  return canvas.toDataURL('image/webp', 0.9);
}

// ---------- Init ----------

async function init() {
  settings = await HP.loadSettings();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // The tab URL is only visible for sites we have host access to — i.e. supported ones.
  if (tab?.url) {
    try {
      currentSite = HP.siteForHost(new URL(tab.url).hostname) || null;
    } catch {}
  }

  $('#enabled').onchange = (e) => save({ enabled: e.target.checked });
  $('#reveal').onchange = (e) => save({ reveal: e.target.checked });
  $('#smart').onchange = (e) => save({ smart: e.target.checked });
  $('#words').onchange = (e) => save({ words: e.target.checked });
  $('#media').onchange = (e) => save({ media: e.target.checked });

  document.querySelectorAll('#mode button').forEach((b) => {
    b.onclick = () => save({ mode: b.dataset.mode });
  });

  // Arrow keys move between modes, like a native radio group.
  $('#mode').onkeydown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = MODES[(MODES.indexOf(settings.mode) + step + MODES.length) % MODES.length];
    save({ mode: next });
    $(`#mode [data-mode="${next}"]`).focus();
  };

  $('#upload').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      save({ customAvatar: await toAvatar(file), avatar: 'custom' });
    } catch {
      $('.hint').textContent = "Couldn't read that image — try a PNG or JPG.";
    }
  };

  render();
  renderSites();

  // Skip transitions on first paint so nothing slides into place on open.
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
}

init();

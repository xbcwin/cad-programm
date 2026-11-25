// ================= Übersetzbare Oberfläche =================
const TEXTS_DE = /*JSON:texte-de.json*/null;
const TEXTS_EN = /*JSON:texte-en.json*/null;

const I18n = (() => {
  const SUPPORTED = ['de', 'en'];
  const packs = { de: TEXTS_DE || {}, en: TEXTS_EN || {} };
  let marker = null;
  const ev = makeEmitter();

  function detect(nav) {
    const list = Array.isArray(nav) ? nav
      : (typeof nav === 'string' ? [nav]
        : (typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language].filter(Boolean) : []));
    for (const item of list) {
      const code = String(item || '').trim().toLowerCase().split(/[-_]/)[0];
      if (SUPPORTED.includes(code)) return code;
    }
    return 'de';
  }

  function resolve(pref) {
    return SUPPORTED.includes(pref) ? pref : detect();
  }

  function initialLang() {
    try {
      const raw = typeof storageGet === 'function' ? storageGet('masswerk.view') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.lang === 'string') return resolve(parsed.lang);
      }
    } catch (_) {}
    return detect();
  }

  let lang = initialLang();
  let cur = packs[lang] || packs.de;

  function format(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }

  function mark(str) {
    if (!marker) return str;
    const [o, c] = marker;
    const s = String(str);
    if (!s) return s;
    if (!/<[a-z/!]/i.test(s)) return o + s + c;
    return s.split(/(<[^>]+>)/g).map((part, i) => (i % 2 === 0 && part.trim() ? o + part + c : part)).join('');
  }

  function t(key, vars) {
    const hasCur = Object.prototype.hasOwnProperty.call(cur, key) && cur[key] != null && cur[key] !== '';
    const hasDe = Object.prototype.hasOwnProperty.call(packs.de, key);
    if (!hasCur && !hasDe) return format(key, vars);
    const raw = hasCur ? cur[key] : packs.de[key];
    return mark(format(raw, vars));
  }

  function applyDom(root = document) {
    if (root === document && document.documentElement) document.documentElement.lang = lang;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-tip]')) el.dataset.tip = t(el.dataset.i18nTip);
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }

  function refresh() {
    applyDom();
    ev.emit('change', lang);
  }

  function set(key, val) {
    if (key && typeof key === 'object') Object.assign(cur, key);
    else if (typeof key === 'string') cur[key] = val;
    refresh();
  }

  function use(code, dict) {
    const target = (!code || code === 'auto') ? detect() : String(code);
    if (dict && typeof dict === 'object') packs[target] = { ...(packs[target] || {}), ...dict };
    if (!packs[target]) packs[target] = {};
    lang = target;
    cur = packs[target];
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
    refresh();
  }

  function setTestMode(on, open = '⟦', close = '⟧') {
    marker = on ? [String(open || '⟦'), String(close || '⟧')] : null;
    refresh();
  }

  return {
    t,
    mark,
    set,
    use,
    detect,
    resolve,
    refresh,
    applyDom,
    setTestMode,
    on: ev.on,
    get supported() { return [...SUPPORTED]; },
    get lang() { return lang; },
    get texts() { return cur; },
    get packs() { return packs; },
    get testMode() { return !!marker; },
    get marker() { return marker ? [...marker] : null; },
  };
})();

function T(key, vars) { return I18n.t(key, vars); }
Object.defineProperty(T, 'texts', { get: () => I18n.texts });

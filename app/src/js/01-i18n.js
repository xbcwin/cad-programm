// ================= Übersetzbare Oberfläche =================
const TEXTS_DE = /*JSON:texte-de.json*/null;

const I18n = (() => {
  let lang = 'de';
  const packs = { de: TEXTS_DE || {} };
  let cur = packs.de;
  const ev = makeEmitter();

  function format(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }

  function t(key, vars) {
    const raw = Object.prototype.hasOwnProperty.call(cur, key)
      ? cur[key]
      : Object.prototype.hasOwnProperty.call(packs.de, key)
        ? packs.de[key]
        : key;
    return format(raw, vars);
  }

  function applyDom(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-tip]')) el.dataset.tip = t(el.dataset.i18nTip);
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
    if (dict && typeof dict === 'object') packs[code] = { ...(packs[code] || {}), ...dict };
    if (!packs[code]) packs[code] = {};
    lang = code;
    cur = packs[code];
    refresh();
  }

  return {
    t,
    set,
    use,
    refresh,
    applyDom,
    on: ev.on,
    get lang() { return lang; },
    get texts() { return cur; },
    get packs() { return packs; },
  };
})();

function T(key, vars) { return I18n.t(key, vars); }
Object.defineProperty(T, 'texts', { get: () => I18n.texts });

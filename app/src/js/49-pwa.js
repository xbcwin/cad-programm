// ================= Web-App-Installation & Offline-Speicher (BE-23) =================
const PWA = (() => {
  const ev = makeEmitter();
  let swState = 'idle'; // 'idle' | 'unsupported' | 'registering' | 'installing' | 'ready' | 'error'
  let registration = null;
  let offlineReady = false;
  let deferredPrompt = null;
  let installed = false;
  let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  let initialized = false;
  let regStarted = false;
  let resolveReady;
  const readyPromise = new Promise((res) => { resolveReady = res; });

  function isStandalone() {
    try {
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
    } catch (_) {}
    return false;
  }

  function canRegister() {
    try {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
      if (typeof window === 'undefined' || !window.isSecureContext) return false;
      const p = location.protocol;
      const h = location.hostname;
      return p === 'https:' || h === 'localhost' || h === '127.0.0.1';
    } catch (_) {
      return false;
    }
  }

  function emitChange() {
    ev.emit('change', status());
  }

  function trackWorker(w) {
    if (!w) return;
    if (w.state === 'installing' || w.state === 'installed') {
      if (swState !== 'ready') swState = 'installing';
      emitChange();
    } else if (w.state === 'activated') {
      swState = 'ready';
      offlineReady = true;
      emitChange();
    }
    w.addEventListener('statechange', () => {
      if (w.state === 'activated') {
        swState = 'ready';
        offlineReady = true;
      } else if (w.state === 'redundant' && !offlineReady) {
        swState = registration && registration.active ? 'ready' : 'error';
      } else if (w.state === 'installing' || w.state === 'installed') {
        if (!offlineReady) swState = 'installing';
      }
      emitChange();
    });
  }

  function register() {
    if (regStarted) return readyPromise;
    regStarted = true;
    if (!canRegister()) {
      swState = 'unsupported';
      emitChange();
      resolveReady(null);
      return readyPromise;
    }

    swState = 'registering';
    emitChange();
    try {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (registration && registration.active) {
          swState = 'ready';
          offlineReady = true;
        }
        emitChange();
      });
    } catch (_) {}

    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then((reg) => {
        registration = reg;
        if (reg.active) {
          swState = 'ready';
          offlineReady = true;
          emitChange();
        }
        if (reg.installing) trackWorker(reg.installing);
        else if (reg.waiting) trackWorker(reg.waiting);
        reg.addEventListener('updatefound', () => trackWorker(reg.installing));
        return navigator.serviceWorker.ready;
      })
      .then((readyReg) => {
        if (readyReg) registration = readyReg;
        swState = 'ready';
        offlineReady = true;
        emitChange();
        resolveReady(registration);
      })
      .catch(() => {
        if (!offlineReady) swState = 'error';
        emitChange();
        resolveReady(null);
      });

    return readyPromise;
  }

  function init() {
    if (initialized) return readyPromise;
    initialized = true;
    installed = isStandalone();

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        emitChange();
      });
      window.addEventListener('appinstalled', () => {
        installed = true;
        deferredPrompt = null;
        emitChange();
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast(T('pwa.installedToast'), { icon: 'check', kind: 'ok' });
        }
      });
      window.addEventListener('online', () => { online = true; emitChange(); });
      window.addEventListener('offline', () => { online = false; emitChange(); });
      try {
        const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)');
        if (mq && mq.addEventListener) {
          mq.addEventListener('change', () => { installed = isStandalone(); emitChange(); });
        }
      } catch (_) {}
    }

    if (!canRegister()) {
      swState = 'unsupported';
      emitChange();
      resolveReady(null);
    }
    return readyPromise;
  }

  function guideDialog() {
    const body = h('div', { id: 'pwa-guide-dlg', style: { display: 'grid', gap: '10px', maxWidth: '460px', lineHeight: 1.5 } },
      h('p', { style: { margin: 0, color: 'var(--muted)' } }, T('pwa.guideIntro')),
      h('ul', { class: 'pwa-guide-list' },
        h('li', null, T('pwa.guideChrome')),
        h('li', null, T('pwa.guideSafariMac')),
        h('li', null, T('pwa.guideSafariIos')),
      ),
      h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '12.5px' } }, T('pwa.guideOffline')),
    );
    UI.modal({
      title: T('pwa.guideTitle'),
      body,
      actions: [{ label: T('common.close'), primary: true }],
    });
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      guideDialog();
      return { outcome: 'manual' };
    }
    const evPrompt = deferredPrompt;
    deferredPrompt = null;
    emitChange();
    try {
      await evPrompt.prompt();
      const choice = await evPrompt.userChoice;
      const outcome = choice && choice.outcome ? choice.outcome : 'dismissed';
      if (outcome === 'accepted') installed = true;
      emitChange();
      return { outcome };
    } catch (_) {
      emitChange();
      return { outcome: 'dismissed' };
    }
  }

  function status() {
    const controlled = typeof navigator !== 'undefined' && navigator.serviceWorker ? !!navigator.serviceWorker.controller : false;
    return {
      swState,
      offlineReady,
      installed,
      canPrompt: !!deferredPrompt,
      online,
      scope: registration ? registration.scope : null,
      active: !!(registration && registration.active),
      controlled,
    };
  }

  return {
    init,
    register,
    status,
    promptInstall,
    guideDialog,
    get ready() { return readyPromise; },
    get canPrompt() { return !!deferredPrompt; },
    get offlineReady() { return offlineReady; },
    get installed() { return installed; },
    on: ev.on,
  };
})();

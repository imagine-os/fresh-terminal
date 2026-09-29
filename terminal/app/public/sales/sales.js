/*
 * Fresh Terminal sales pages: language toggle, "not wired yet" toasts, the
 * pay-as-you-go fee and the page's actions. No trackers, no network calls.
 *
 * English lives in the HTML. Spanish lives in i18n-es.js (window.FT_ES), keyed
 * by data-i18n. data-i18n-attr="aria-label:key;data-tip:key" does attributes.
 * The language choice is shared with the app (localStorage fresh-terminal.prefs).
 */
(function () {
  'use strict';

  /**
   * Pricing numbers the copy depends on, in one place. The fee over model cost
   * is undecided (margin 0 in the route table), so the pages say "at cost for
   * now" and show no percentage; set percent and add a [data-fee] element to show one.
   * Storage matches STORAGE_PRICING in shared/src/credits/storage.ts (not final, not billed).
   */
  var PAYG_FEE = { percent: null, final: false };
  var STORAGE = { freeMb: 100, usdPerGbMonth: 0.05, final: false };

  var PREFS = 'fresh-terminal.prefs';
  var root = document.documentElement;
  var originals = new Map();
  var originalAttrs = new Map();

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeLang(lang) {
    try {
      var prefs = readPrefs();
      prefs.lang = lang;
      localStorage.setItem(PREFS, JSON.stringify(prefs));
    } catch (e) { /* storage blocked: the toggle still works for this page */ }
  }

  function fill() {
    if (PAYG_FEE.percent !== null) document.querySelectorAll('[data-fee]').forEach(function (el) { el.textContent = PAYG_FEE.percent + '%'; });
    document.querySelectorAll('[data-storage-free]').forEach(function (el) { el.textContent = STORAGE.freeMb + ' MB'; });
    document.querySelectorAll('[data-storage-price]').forEach(function (el) { el.textContent = '$' + STORAGE.usdPerGbMonth.toFixed(2); });
  }

  function setLang(lang) {
    var es = window.FT_ES || {};
    lang = lang === 'es' ? 'es' : 'en';
    root.setAttribute('lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      var key = el.getAttribute('data-i18n');
      el.innerHTML = lang === 'es' && es[key] ? es[key] : originals.get(el);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        var attr = parts[0] && parts[0].trim();
        var key = parts[1] && parts[1].trim();
        if (!attr || !key) return;
        var id = attr + '|' + key;
        if (!originalAttrs.has(el)) originalAttrs.set(el, {});
        var saved = originalAttrs.get(el);
        if (!(id in saved)) saved[id] = el.getAttribute(attr);
        el.setAttribute(attr, lang === 'es' && es[key] ? es[key] : saved[id]);
      });
    });
    var title = document.querySelector('title[data-i18n-title]');
    if (title) {
      if (!originals.has(title)) originals.set(title, document.title);
      document.title = lang === 'es' && es[title.getAttribute('data-i18n-title')] ? es[title.getAttribute('data-i18n-title')] : originals.get(title);
    }
    document.querySelectorAll('.lang button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-lang') === lang));
    });
    fill();
  }

  var toastEl = null;
  var toastTimer = 0;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      toastEl.hidden = true;
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 5000);
  }

  function run(id) {
    if (id === 'sales.lang.toggle') setLang(root.getAttribute('lang') === 'es' ? 'en' : 'es');
    else if (id === 'sales.lang.en') { setLang('en'); writeLang('en'); }
    else if (id === 'sales.lang.es') { setLang('es'); writeLang('es'); }
  }

  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var langButton = target.closest('.lang button');
    if (langButton) {
      var lang = langButton.getAttribute('data-lang');
      setLang(lang);
      writeLang(lang);
      return;
    }
    var notWired = target.closest('[data-not-wired]');
    if (notWired) {
      event.preventDefault();
      toast(notWired.getAttribute('data-toast') || notWired.getAttribute('data-tip') || 'Not wired yet.');
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toastEl) toastEl.hidden = true;
  });

  // Actions this page declares (#page-actions), readable by agents and the voice controller.
  var declared = { actions: [] };
  try { declared = JSON.parse((document.getElementById('page-actions') || {}).textContent || '{}'); } catch (e) { /* keep empty */ }
  window.__actions = {
    page: declared.page,
    version: declared.version,
    list: function () { return (declared.actions || []).slice(); },
    run: run,
  };
  window.addEventListener('ft:action', function (event) { run(event.detail && event.detail.id); });

  // /faq#privacy opens that answer.
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  var fromUrl = new URLSearchParams(location.search).get('lang');
  var start = fromUrl === 'es' || fromUrl === 'en' ? fromUrl : readPrefs().lang === 'es' ? 'es' : 'en';
  if (fromUrl) writeLang(start);
  setLang(start);
})();

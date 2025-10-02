// UI Utilities Module
// Common DOM helpers and modal helpers extracted from app.js
const UIUtils = {
  qs(sel, scope=document) { return scope.querySelector(sel); },
  qsa(sel, scope=document) { return Array.from(scope.querySelectorAll(sel)); },
  on(el, event, handler, opts) { el && el.addEventListener(event, handler, opts); return () => el && el.removeEventListener(event, handler, opts); },
  toggle(el, show) { if (!el) return; el.style.display = show ? '' : 'none'; },
  setHTML(el, html) { if (el) el.innerHTML = html; },
  create(tag, cls, html) { const el = document.createElement(tag); if (cls) el.className = cls; if (html) el.innerHTML = html; return el; },
  // Simple feedback flash for buttons
  flashButton(btn, success=true, duration=1500) {
    if (!btn) return;
    const original = btn.innerHTML;
    const icon = success ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6L9 17l-5-5"/></svg>' : '';
    btn.innerHTML = icon + (success ? ' Done' : ' Error');
    btn.classList.add(success ? 'btn-primary' : 'btn-danger');
    setTimeout(()=>{ btn.innerHTML = original; btn.classList.remove('btn-primary','btn-danger'); }, duration);
  }
};

window.UIUtils = UIUtils;
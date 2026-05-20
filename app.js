/* ============================================================
   Calculator — mobile web app
   v0.3 — calculator + history + settings + theme switching
   Layout matches the desktop "Dark Orange" app
   ============================================================ */

(() => {
  'use strict';

  // ============================================================
  // Storage
  // ============================================================
  const KEYS = {
    history: 'calc.history.v1',
    theme: 'calc.theme.v1',
  };
  const get = (k, fb) => { try { const r = localStorage.getItem(k); return r === null ? fb : JSON.parse(r); } catch { return fb; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ============================================================
  // State
  // ============================================================
  const state = {
    current: '',
    expression: '',
    result: '0',
    justEvaluated: false,
  };
  let history = get(KEYS.history, []);
  const HISTORY_MAX = 100;

  // ============================================================
  // DOM
  // ============================================================
  const $expr = document.getElementById('expression');
  const $result = document.getElementById('result');
  const $words = document.getElementById('words');
  const $wordsRow = document.getElementById('words-row');
  const $wordsCopy = document.getElementById('words-copy');
  const $historyList = document.getElementById('history-list');
  const $historyEmpty = document.getElementById('history-empty');
  const $themeMeta = document.getElementById('theme-color-meta');

  // ============================================================
  // Display formatting (commas for thousands)
  // ============================================================
  // Adds thousands separators to a numeric string while preserving:
  //  - leading minus sign
  //  - decimal portion (no separators after the dot)
  //  - exponential notation (e.g. 1.234e+30)
  //  - trailing "." while user is typing
  function formatDisplayNumber(numStr) {
    if (numStr === '' || numStr === '-' || numStr === 'Error') return numStr;
    const s = String(numStr);

    // Exponential notation — pass through (rare, but happens for huge results)
    if (/e/i.test(s)) return s;

    const negative = s.startsWith('-');
    const body = negative ? s.slice(1) : s;

    const dotIndex = body.indexOf('.');
    let intPart, decPart;
    if (dotIndex === -1) {
      intPart = body;
      decPart = '';
    } else {
      intPart = body.slice(0, dotIndex);
      decPart = body.slice(dotIndex); // keeps the dot
    }

    // Only digits in intPart should be formatted
    if (!/^\d+$/.test(intPart)) return s;

    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-' : '') + withCommas + decPart;
  }

  // Walk a full expression string and apply formatDisplayNumber to each
  // numeric token, leaving operators / spaces / "=" alone.
  function formatDisplayExpression(exprStr) {
    if (!exprStr) return '';
    // Split on any operator or "=" while keeping the separators
    return exprStr.replace(/-?\d+\.?\d*/g, (match, offset, full) => {
      // A leading "-" should only be treated as a sign if it's at the very
      // start of the expression or preceded by another operator/space.
      // The default behavior already handles that because our expression
      // is built with explicit spacing around operators.
      const prev = offset > 0 ? full[offset - 1] : '';
      if (match.startsWith('-') && /[\d.]/.test(prev)) {
        // It's actually the "−" operator followed by a number; format only the digits
        return '-' + formatDisplayNumber(match.slice(1));
      }
      return formatDisplayNumber(match);
    });
  }

  // ============================================================
  // Indian number-to-words (lakh / crore / arab)
  // Ported from the desktop calculator
  // ============================================================
  const _ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                 'seventeen', 'eighteen', 'nineteen'];
  const _TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function twoDigits(n) {
    if (n < 20) return _ONES[n];
    const t = Math.floor(n / 10), o = n % 10;
    return _TENS[t] + (o ? ' ' + _ONES[o] : '');
  }

  function threeDigits(n) {
    const h = Math.floor(n / 100), r = n % 100;
    let out = '';
    if (h) out = _ONES[h] + ' hundred';
    if (h && r) out += ' and ';
    if (r) out += twoDigits(r);
    return out;
  }

  function intToIndianWords(n) {
    if (n === 0) return 'zero';
    const last3 = n % 1000; n = Math.floor(n / 1000);
    const th = n % 100; n = Math.floor(n / 100);
    const la = n % 100; n = Math.floor(n / 100);
    const cr = n % 100; n = Math.floor(n / 100);
    const ar = n;
    const parts = [];
    if (ar) parts.push(intToIndianWords(ar) + ' arab');
    if (cr) parts.push(twoDigits(cr) + ' crore');
    if (la) parts.push(twoDigits(la) + ' lakh');
    if (th) parts.push(twoDigits(th) + ' thousand');
    if (last3) parts.push(threeDigits(last3));
    return parts.length ? parts.join(' ') : 'zero';
  }

  // Title-case a string (capitalize first letter of every word)
  function titleCase(s) {
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }

  // Spell out a numeric result string (handles negatives, decimals)
  function numberToWords(numStr) {
    if (!numStr || numStr === 'Error') return '';
    const s = String(numStr);
    if (/e/i.test(s)) return ''; // too big, skip
    const negative = s.startsWith('-');
    const body = negative ? s.slice(1) : s;
    const [intPart, decPart] = body.split('.');
    const intNum = parseInt(intPart || '0', 10);
    if (!isFinite(intNum)) return '';

    let words = intToIndianWords(intNum);

    // Append decimal portion as "point one two three" if present
    if (decPart && decPart.length > 0) {
      const digitNames = decPart.split('').map(d => _ONES[parseInt(d, 10)] || 'zero');
      words += ' point ' + digitNames.join(' ');
    }

    if (negative) words = 'negative ' + words;
    return titleCase(words);
  }

  // Auto-shrink the result line so the longest number still fits
  function fitResultText() {
    const el = $result;
    // Reset to the CSS-defined max first
    el.style.fontSize = '';
    // Read computed font-size
    const cs = window.getComputedStyle(el);
    let size = parseFloat(cs.fontSize);
    const minSize = 18; // never shrink below ~18px
    // The display has horizontal padding; compare scrollWidth vs clientWidth
    let safety = 30;
    while (el.scrollWidth > el.clientWidth && size > minSize && safety-- > 0) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
  }

  // ============================================================
  // Render
  // ============================================================
  function render() {
    const exprRaw = (state.expression + (state.current ? ' ' + state.current : '')).trim();
    $expr.textContent = formatDisplayExpression(exprRaw);

    const rawResult = state.current !== '' ? state.current : state.result;
    $result.textContent = formatDisplayNumber(rawResult);

    fitResultText();

    // Words appear only after =, and only when result is a valid number
    if (state.justEvaluated && state.result !== 'Error' && state.result !== '') {
      const words = numberToWords(state.result);
      $words.textContent = words;
      const hasWords = !!words;
      $wordsCopy.hidden = !hasWords;
      $wordsRow.classList.toggle('is-visible', hasWords);
    } else {
      $words.textContent = '';
      $wordsCopy.hidden = true;
      $wordsRow.classList.remove('is-visible');
    }
  }

  function renderHistory() {
    $historyList.innerHTML = '';
    if (history.length === 0) { $historyList.appendChild($historyEmpty); return; }
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      const btn = document.createElement('button');
      btn.className = 'history-item';
      btn.innerHTML = `<div class="history-item__expr">${escapeHtml(formatDisplayExpression(e.expr))}</div>
                       <div class="history-item__result">${escapeHtml(formatDisplayNumber(e.result))}</div>`;
      btn.addEventListener('click', () => { loadFromHistory(e); closeSheet('history'); });
      $historyList.appendChild(btn);
    }
  }

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ============================================================
  // Calculator helpers
  // ============================================================
  const OPS = new Set(['+', '−', '×', '÷']);
  const isOp = ch => OPS.has(ch);
  const exprEndsWithOp = () => { const t = state.expression.trim(); return t && isOp(t.slice(-1)); };

  function formatNumber(n) {
    if (!isFinite(n)) return 'Error';
    return Number(n.toPrecision(12)).toString();
  }

  function evaluate(exprStr) {
    const normalized = exprStr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
    if (!normalized) return null;
    if (!/^[-+*/().0-9]+$/.test(normalized)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict"; return (' + normalized + ')')();
      return (typeof v === 'number' && isFinite(v)) ? v : null;
    } catch { return null; }
  }

  // ============================================================
  // Actions
  // ============================================================
  function inputDigit(d) {
    if (state.justEvaluated) { state.expression = ''; state.current = ''; state.justEvaluated = false; }
    if (state.current === '0') state.current = '';
    state.current += d;
    render();
  }

  function inputDecimal() {
    if (state.justEvaluated) { state.expression = ''; state.current = ''; state.justEvaluated = false; }
    if (state.current === '') state.current = '0.';
    else if (!state.current.includes('.')) state.current += '.';
    render();
  }

  function inputOperator(op) {
    if (state.justEvaluated) { state.expression = state.result; state.current = ''; state.justEvaluated = false; }
    if (state.current === '' && state.expression === '') {
      if (op === '−') { state.current = '-'; render(); }
      return;
    }
    if (state.current !== '') {
      state.expression = (state.expression + ' ' + state.current + ' ' + op).trim();
      state.current = '';
    } else if (exprEndsWithOp()) {
      state.expression = state.expression.trim().slice(0, -1) + op;
    } else {
      state.expression = (state.expression + ' ' + op).trim();
    }
    render();
  }

  function equals() {
    let exprToEval = state.expression;
    if (state.current !== '') exprToEval += ' ' + state.current;
    exprToEval = exprToEval.trim();
    if (!exprToEval) return;
    while (exprToEval && isOp(exprToEval.slice(-1))) exprToEval = exprToEval.slice(0, -1).trim();

    const v = evaluate(exprToEval);
    if (v === null) {
      state.result = 'Error'; state.expression = ''; state.current = ''; state.justEvaluated = true;
      render(); return;
    }
    const formatted = formatNumber(v);
    const finalExpr = exprToEval.replace(/\s+/g, ' ');

    if (/[-+×÷]/.test(finalExpr.replace(/^-/, ''))) {
      history.push({ expr: finalExpr, result: formatted, ts: Date.now() });
      if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
      set(KEYS.history, history);
      renderHistory();
    }

    state.expression = finalExpr + ' =';
    state.current = '';
    state.result = formatted;
    state.justEvaluated = true;
    render();
  }

  // Clear: wipes everything
  function clearAll() {
    state.current = ''; state.expression = ''; state.result = '0'; state.justEvaluated = false;
    render();
  }

  // CE (Clear Entry): wipes only the current number, keeps the expression so far
  function clearEntry() {
    if (state.justEvaluated) { clearAll(); return; }
    state.current = '';
    render();
  }

  // DEL: removes the last character
  function del() {
    if (state.justEvaluated) { clearAll(); return; }
    if (state.current !== '') {
      state.current = state.current.slice(0, -1);
    } else if (state.expression !== '') {
      state.expression = state.expression.trim().slice(0, -1).trim();
    }
    render();
  }

  function percent() {
    if (state.current === '') return;
    const n = parseFloat(state.current);
    if (isNaN(n)) return;
    state.current = formatNumber(n / 100);
    render();
  }

  function loadFromHistory(e) {
    state.expression = ''; state.current = e.result; state.result = e.result; state.justEvaluated = false;
    render();
  }

  function clearHistory() {
    history = []; set(KEYS.history, history); renderHistory();
  }

  // ============================================================
  // Theme
  // ============================================================
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    set(KEYS.theme, theme);
    document.querySelectorAll('.seg').forEach(s => s.classList.toggle('is-active', s.dataset.theme === theme));
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $themeMeta.setAttribute('content', isDark ? '#0d0d0d' : '#e8ecf1');
  }
  function initTheme() {
    applyTheme(get(KEYS.theme, 'auto'));
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get(KEYS.theme, 'auto') === 'auto') applyTheme('auto');
      });
    }
  }

  // ============================================================
  // Sheets
  // ============================================================
  const sheets = {
    history: { sheet: document.getElementById('history-sheet'), backdrop: document.getElementById('history-backdrop') },
    settings: { sheet: document.getElementById('settings-sheet'), backdrop: document.getElementById('settings-backdrop') },
  };
  function openSheet(n) {
    const { sheet, backdrop } = sheets[n];
    sheet.classList.add('is-open'); backdrop.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    if (n === 'history') renderHistory();
  }
  function closeSheet(n) {
    const { sheet, backdrop } = sheets[n];
    sheet.classList.remove('is-open'); backdrop.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  function attachSwipeDown(sheetEl, onClose) {
    let startY = null, currentY = null, dragging = false;
    sheetEl.addEventListener('touchstart', e => {
      const head = sheetEl.querySelector('.sheet__head');
      if (!head.contains(e.target) && e.target !== sheetEl) return;
      startY = e.touches[0].clientY; dragging = true;
    }, { passive: true });
    sheetEl.addEventListener('touchmove', e => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      sheetEl.style.transform = `translateY(${Math.max(0, currentY - startY)}px)`;
    }, { passive: true });
    sheetEl.addEventListener('touchend', () => {
      if (!dragging) return;
      const dy = (currentY || 0) - (startY || 0);
      sheetEl.style.transform = '';
      if (dy > 80) onClose();
      dragging = false; startY = currentY = null;
    });
  }

  // ============================================================
  // Event wiring
  // ============================================================
  const haptic = () => { if (navigator.vibrate) navigator.vibrate(8); };

  document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic();
      const d = btn.dataset.digit, op = btn.dataset.op, a = btn.dataset.action;
      if (d !== undefined) inputDigit(d);
      else if (op !== undefined) inputOperator(op);
      else if (a === 'decimal') inputDecimal();
      else if (a === 'equals') equals();
      else if (a === 'clear') clearAll();
      else if (a === 'ce') clearEntry();
      else if (a === 'backspace') del();
      else if (a === 'percent') percent();
    });
  });

  document.addEventListener('keydown', e => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) return inputDigit(k);
    if (k === '.') return inputDecimal();
    if (k === '+') return inputOperator('+');
    if (k === '-') return inputOperator('−');
    if (k === '*') return inputOperator('×');
    if (k === '/') { e.preventDefault(); return inputOperator('÷'); }
    if (k === 'Enter' || k === '=') { e.preventDefault(); return equals(); }
    if (k === 'Backspace') return del();
    if (k === 'Escape') { closeSheet('history'); closeSheet('settings'); return; }
    if (k === '%') return percent();
  });

  document.getElementById('open-history').addEventListener('click', () => { haptic(); openSheet('history'); });
  document.getElementById('open-settings').addEventListener('click', () => { haptic(); openSheet('settings'); });
  document.getElementById('close-settings').addEventListener('click', () => closeSheet('settings'));
  document.getElementById('history-backdrop').addEventListener('click', () => closeSheet('history'));
  document.getElementById('settings-backdrop').addEventListener('click', () => closeSheet('settings'));
  document.getElementById('clear-history').addEventListener('click', () => {
    if (history.length === 0) return;
    if (confirm('Clear all calculation history?')) clearHistory();
  });
  document.getElementById('clear-history-2').addEventListener('click', () => {
    if (history.length === 0) { alert('History is already empty.'); return; }
    if (confirm('Clear all calculation history?')) clearHistory();
  });
  document.querySelectorAll('.seg').forEach(s => s.addEventListener('click', () => { haptic(); applyTheme(s.dataset.theme); }));

  // Copy-words button
  function flashCopy(state) {
    // state: 'ok' | 'fail'
    const isOk = state === 'ok';
    $wordsCopy.classList.toggle('is-copied', isOk);
    $wordsCopy.classList.toggle('is-failed', !isOk);
    $wordsCopy.innerHTML = isOk ? `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>` : `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>`;
    setTimeout(() => {
      $wordsCopy.classList.remove('is-copied', 'is-failed');
      $wordsCopy.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;
    }, 1400);
  }

  async function copyWords() {
    const text = $words.textContent;
    if (!text) return;
    haptic();

    let ok = false;

    // 1) Modern Clipboard API — preferred path
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        ok = false;
      }
    }

    // 2) Fallback: visible textarea + execCommand
    // (must be visible enough to be focusable on mobile; opacity 0 still focusable)
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.width = '1px';
        ta.style.height = '1px';
        ta.style.padding = '0';
        ta.style.border = 'none';
        ta.style.outline = 'none';
        ta.style.boxShadow = 'none';
        ta.style.background = 'transparent';
        ta.style.opacity = '0';
        document.body.appendChild(ta);

        // iOS requires this dance; Android Chrome tolerates it.
        ta.focus();
        ta.setSelectionRange(0, ta.value.length);
        ta.select();

        ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    flashCopy(ok ? 'ok' : 'fail');

    // 3) If both methods fail, show a prompt so the user can manually copy.
    // This guarantees they can always get the text out, even on a file:// page.
    if (!ok) {
      setTimeout(() => {
        window.prompt('Long-press to select, then copy:', text);
      }, 200);
    }
  }
  $wordsCopy.addEventListener('click', copyWords);

  attachSwipeDown(sheets.history.sheet, () => closeSheet('history'));
  attachSwipeDown(sheets.settings.sheet, () => closeSheet('settings'));

  // Re-fit result on size changes (rotation, keyboard show/hide, etc.)
  window.addEventListener('resize', () => fitResultText());
  window.addEventListener('orientationchange', () => setTimeout(fitResultText, 100));

  initTheme();
  renderHistory();
  render();
})();

// ============================================================
// Service worker registration (PWA / offline support)
// Skipped when loading from file:// since SW requires http(s)
// ============================================================
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}

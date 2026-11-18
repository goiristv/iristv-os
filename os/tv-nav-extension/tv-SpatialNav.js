(function () {
  'use strict';

  // Não executa dentro da própria Home do irisTV (que já tem navegação nativa própria)
  if (
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    location.port === '3000'
  ) {
    return;
  }
  if (window.__irisTvSpatialNavLoaded) return;
  window.__irisTvSpatialNavLoaded = true;

  const state = {
    mode: 'dpad', // 'dpad' | 'cursor'
    focusedEl: null,
    cursorX: Math.round(window.innerWidth * 0.5),
    cursorY: Math.round(window.innerHeight * 0.5),
    cursorStep: 26,
    lastMoveTs: 0,
    oskOpen: false,
    oskTarget: null,
    oskRow: 1,
    oskCol: 0,
    hudTimer: null
  };

  // Criamos um Shadow DOM isolado para que o CSS da Netflix/Prime/YouTube nunca quebre o HUD/Foco/Teclado
  const host = document.createElement('div');
  host.id = 'iris-tv-remote-host';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .hud-pill {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%) translateY(0);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(10, 14, 24, 0.86);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
      color: #f8fafc;
      font-size: 12.5px;
      font-weight: 600;
      pointer-events: auto;
      transition: opacity 0.28s ease, transform 0.28s ease;
      opacity: 1;
    }
    .hud-pill.is-hidden {
      opacity: 0;
      transform: translateX(-50%) translateY(-18px);
      pointer-events: none;
    }
    .hud-btn {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.08);
      color: #f8fafc;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .hud-btn:hover, .hud-btn.is-active {
      background: rgba(56, 189, 248, 0.24);
      border-color: rgba(56, 189, 248, 0.75);
    }
    .hud-btn.back-btn {
      background: rgba(239, 68, 68, 0.22);
      border-color: rgba(239, 68, 68, 0.55);
    }
    .hud-btn.back-btn:hover {
      background: rgba(239, 68, 68, 0.38);
    }
    .focus-ring {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      border-radius: 10px;
      border: 3px solid #38bdf8;
      box-shadow: 0 0 0 3px rgba(10, 14, 24, 0.75), 0 0 24px rgba(56, 189, 248, 0.75);
      pointer-events: none;
      transition: top 0.14s cubic-bezier(0.22, 1, 0.36, 1),
                  left 0.14s cubic-bezier(0.22, 1, 0.36, 1),
                  width 0.14s cubic-bezier(0.22, 1, 0.36, 1),
                  height 0.14s cubic-bezier(0.22, 1, 0.36, 1),
                  opacity 0.15s ease;
      opacity: 0;
    }
    .focus-ring.is-visible {
      opacity: 1;
    }
    .virtual-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 26px;
      height: 26px;
      margin-left: -4px;
      margin-top: -4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease, transform 0.06s linear;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.75));
    }
    .virtual-cursor.is-visible {
      opacity: 1;
    }
    .osk-backdrop {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      width: min(760px, 94vw);
      background: rgba(10, 14, 24, 0.95);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 20px;
      padding: 14px 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.75);
      pointer-events: auto;
      display: none;
      flex-direction: column;
      gap: 8px;
    }
    .osk-backdrop.is-open {
      display: flex;
    }
    .osk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      color: #94a3b8;
      padding: 0 4px 4px;
    }
    .osk-preview {
      color: #f8fafc;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.07);
      padding: 4px 10px;
      border-radius: 8px;
      max-width: 65%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .osk-row {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    .osk-key {
      flex: 1;
      min-width: 36px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.07);
      color: #f8fafc;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    }
    .osk-key.wide { flex: 2.2; font-size: 12.5px; }
    .osk-key.space { flex: 4.5; font-size: 12.5px; }
    .osk-key.is-focused {
      background: #38bdf8;
      color: #090d16;
      border-color: #bae6fd;
      transform: scale(1.06);
      box-shadow: 0 0 16px rgba(56, 189, 248, 0.65);
    }
  `;

  const hud = document.createElement('div');
  hud.className = 'hud-pill';
  hud.innerHTML = `
    <button type="button" class="hud-btn back-btn" id="hud-back">← Voltar ao irisTV (ESC)</button>
    <button type="button" class="hud-btn is-active" id="hud-mode">Modo Controle (Setas)</button>
    <button type="button" class="hud-btn" id="hud-osk">Teclado</button>
  `;

  const focusRing = document.createElement('div');
  focusRing.className = 'focus-ring';

  const cursorEl = document.createElement('div');
  cursorEl.className = 'virtual-cursor';
  cursorEl.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3L22 11.5L13.5 14.5L10.5 23L4 3Z" fill="#38bdf8" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;

  const oskRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '@', '.'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '-', '_'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '.com', '⌫'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ESPAÇO', 'LIMPAR', 'OK ✓']
  ];

  const oskEl = document.createElement('div');
  oskEl.className = 'osk-backdrop';
  oskEl.innerHTML = `
    <div class="osk-header">
      <span>Teclado Virtual irisTV (Use as Setas + Enter)</span>
      <span class="osk-preview" id="osk-preview"></span>
    </div>
    <div id="osk-grid"></div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(focusRing);
  shadow.appendChild(cursorEl);
  shadow.appendChild(hud);
  shadow.appendChild(oskEl);

  function mountHost() {
    if (!document.body) {
      requestAnimationFrame(mountHost);
      return;
    }
    if (!document.getElementById('iris-tv-remote-host')) {
      document.documentElement.appendChild(host);
    }
  }
  mountHost();

  const hudBackBtn = hud.querySelector('#hud-back');
  const hudModeBtn = hud.querySelector('#hud-mode');
  const hudOskBtn = hud.querySelector('#hud-osk');
  const oskGrid = oskEl.querySelector('#osk-grid');
  const oskPreview = oskEl.querySelector('#osk-preview');

  function wakeHud() {
    hud.classList.remove('is-hidden');
    clearTimeout(state.hudTimer);
    state.hudTimer = setTimeout(() => {
      if (!state.oskOpen) hud.classList.add('is-hidden');
    }, 3800);
  }
  wakeHud();

  function exitToIrisTv() {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.irisWebView) {
      window.webkit.messageHandlers.irisWebView.postMessage({ action: 'closeApp' });
      return;
    }
    if (document.referrer && (document.referrer.includes('localhost:3000') || document.referrer.includes('127.0.0.1:3000'))) {
      history.back();
      return;
    }
    location.href = 'http://localhost:3000';
  }

  function setMode(nextMode) {
    state.mode = nextMode;
    if (nextMode === 'cursor') {
      hudModeBtn.textContent = 'Cursor Virtual (Ctrl+R)';
      focusRing.classList.remove('is-visible');
      cursorEl.classList.add('is-visible');
      updateCursorTransform();
    } else {
      hudModeBtn.textContent = 'Modo Controle (Setas)';
      cursorEl.classList.remove('is-visible');
      if (!state.focusedEl || !isElementValid(state.focusedEl)) {
        focusFirstAvailable();
      } else {
        updateFocusRing();
      }
    }
    wakeHud();
  }

  hudBackBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exitToIrisTv();
  });

  hudModeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMode(state.mode === 'dpad' ? 'cursor' : 'dpad');
  });

  hudOskBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const input = state.focusedEl && isTextInput(state.focusedEl)
      ? state.focusedEl
      : document.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
    openOsk(input);
  });

  function isTextInput(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(t);
    }
    return el.isContentEditable === true;
  }

  function setNativeInputValue(el, val) {
    if (!el) return;
    const proto = el.tagName.toLowerCase() === 'textarea'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderOsk() {
    oskGrid.innerHTML = '';
    if (state.oskTarget) {
      const isPass = (state.oskTarget.getAttribute?.('type') || '').toLowerCase() === 'password';
      const val = state.oskTarget.value || '';
      oskPreview.textContent = isPass ? '•'.repeat(val.length) : (val || 'Digite com o controle...');
    } else {
      oskPreview.textContent = 'Selecione um campo de texto';
    }

    oskRows.forEach((row, rIdx) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'osk-row';
      row.forEach((keyLabel, cIdx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'osk-key';
        if (keyLabel === 'ESPAÇO') btn.classList.add('space');
        else if (keyLabel.length > 1) btn.classList.add('wide');
        if (rIdx === state.oskRow && cIdx === state.oskCol) {
          btn.classList.add('is-focused');
        }
        btn.textContent = keyLabel;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.oskRow = rIdx;
          state.oskCol = cIdx;
          triggerOskKey(keyLabel);
        });
        rowDiv.appendChild(btn);
      });
      oskGrid.appendChild(rowDiv);
    });
  }

  function openOsk(targetEl) {
    state.oskTarget = targetEl || state.focusedEl;
    if (state.oskTarget && typeof state.oskTarget.focus === 'function') {
      state.oskTarget.focus();
    }
    state.oskOpen = true;
    oskEl.classList.add('is-open');
    renderOsk();
    wakeHud();
  }

  function closeOsk() {
    state.oskOpen = false;
    oskEl.classList.remove('is-open');
    if (state.oskTarget) {
      state.oskTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
  }

  function triggerOskKey(keyLabel) {
    if (keyLabel === 'OK ✓') {
      closeOsk();
      return;
    }
    const target = state.oskTarget;
    if (!target) return;
    const cur = target.value || '';
    if (keyLabel === '⌫') {
      setNativeInputValue(target, cur.slice(0, -1));
    } else if (keyLabel === 'LIMPAR') {
      setNativeInputValue(target, '');
    } else if (keyLabel === 'ESPAÇO') {
      setNativeInputValue(target, cur + ' ');
    } else {
      setNativeInputValue(target, cur + keyLabel);
    }
    renderOsk();
  }

  function isElementValid(el) {
    if (!el || !el.isConnected || el === document.body || el === document.documentElement) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 22 || rect.height < 18) return false;
    if (rect.width > window.innerWidth * 0.96 && rect.height > window.innerHeight * 0.85) return false;
    // Ignora elementos completamente fora da área próximo à tela
    if (rect.bottom < -300 || rect.top > window.innerHeight + 500) return false;
    if (rect.right < -200 || rect.left > window.innerWidth + 200) return false;
    return true;
  }

  function collectCandidates() {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([type="hidden"]):not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[tabindex]:not([tabindex="-1"])',
      'video'
    ].join(',');

    const rawSet = new Set(document.querySelectorAll(selector));

    // Adiciona cards clicáveis de catálogos (Netflix, Prime Video, Disney+, Globoplay, etc.)
    const cardEls = document.querySelectorAll('div, li, article, span');
    for (let i = 0; i < cardEls.length; i++) {
      const el = cardEls[i];
      if (rawSet.has(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 32 || rect.width > 550 || rect.height > 480) continue;
      if (rect.bottom < -100 || rect.top > window.innerHeight + 250) continue;
      const cs = window.getComputedStyle(el);
      if (cs.cursor === 'pointer') {
        rawSet.add(el);
      }
    }

    const valid = [];
    rawSet.forEach((el) => {
      if (isElementValid(el)) valid.push(el);
    });

    // Filtra containers pai que apenas englobam outro candidato menor já na lista
    return valid.filter((el) => {
      for (let i = 0; i < valid.length; i++) {
        const other = valid[i];
        if (other !== el && el.contains(other)) {
          return false;
        }
      }
      return true;
    });
  }

  function dispatchSyntheticHover(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    ['mouseenter', 'mouseover', 'mousemove'].forEach((type) => {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        view: window
      }));
    });
  }

  function dispatchSyntheticClick(el, x, y) {
    if (!el) return;
    if (isTextInput(el)) {
      openOsk(el);
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = typeof x === 'number' ? x : rect.left + rect.width / 2;
    const cy = typeof y === 'number' ? y : rect.top + rect.height / 2;
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach((type) => {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        button: 0,
        buttons: 1,
        view: window
      }));
    });
    if (typeof el.click === 'function') {
      try { el.click(); } catch (_) {}
    }
  }

  function updateFocusRing() {
    if (state.mode !== 'dpad' || !state.focusedEl || !isElementValid(state.focusedEl)) {
      focusRing.classList.remove('is-visible');
      return;
    }
    const r = state.focusedEl.getBoundingClientRect();
    const pad = 4;
    focusRing.style.top = `${Math.round(r.top - pad)}px`;
    focusRing.style.left = `${Math.round(r.left - pad)}px`;
    focusRing.style.width = `${Math.round(r.width + pad * 2)}px`;
    focusRing.style.height = `${Math.round(r.height + pad * 2)}px`;
    focusRing.classList.add('is-visible');
  }

  function setSpatialFocus(el) {
    if (!el) return;
    state.focusedEl = el;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch (_) {}
    if (typeof el.focus === 'function' && !isTextInput(el)) {
      try { el.focus({ preventScroll: true }); } catch (_) {}
    }
    dispatchSyntheticHover(el);
    updateFocusRing();
    setTimeout(updateFocusRing, 180);
  }

  function focusFirstAvailable() {
    const candidates = collectCandidates();
    if (!candidates.length) return false;
    // Prioriza elementos visíveis mais próximos do centro/topo da tela
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const sa = Math.max(0, ra.top) + Math.abs(ra.left - window.innerWidth * 0.25) * 0.4;
      const sb = Math.max(0, rb.top) + Math.abs(rb.left - window.innerWidth * 0.25) * 0.4;
      return sa - sb;
    });
    setSpatialFocus(candidates[0]);
    return true;
  }

  function moveSpatial(dir) {
    const candidates = collectCandidates();
    if (!candidates.length) return;
    if (!state.focusedEl || !isElementValid(state.focusedEl)) {
      focusFirstAvailable();
      return;
    }

    const curRect = state.focusedEl.getBoundingClientRect();
    const cx = curRect.left + curRect.width / 2;
    const cy = curRect.top + curRect.height / 2;

    let bestEl = null;
    let bestScore = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el === state.focusedEl) continue;
      const r = el.getBoundingClientRect();
      const nx = r.left + r.width / 2;
      const ny = r.top + r.height / 2;
      const dx = nx - cx;
      const dy = ny - cy;

      let primary = 0;
      let secondary = 0;

      if (dir === 'right') {
        if (dx <= 6) continue;
        primary = dx;
        secondary = Math.abs(dy);
      } else if (dir === 'left') {
        if (dx >= -6) continue;
        primary = -dx;
        secondary = Math.abs(dy);
      } else if (dir === 'down') {
        if (dy <= 6) continue;
        primary = dy;
        secondary = Math.abs(dx);
      } else if (dir === 'up') {
        if (dy >= -6) continue;
        primary = -dy;
        secondary = Math.abs(dx);
      }

      // Penaliza candidatos muito fora do eixo da seta pressionada
      const score = primary + secondary * 2.35;
      if (score < bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    if (bestEl) {
      setSpatialFocus(bestEl);
    } else {
      // Se não houver elemento naquela direção visível agora, rola suavemente a página para revelar mais itens
      const scrollStep = 280;
      if (dir === 'down') window.scrollBy({ top: scrollStep, behavior: 'smooth' });
      else if (dir === 'up') window.scrollBy({ top: -scrollStep, behavior: 'smooth' });
      else if (dir === 'right') window.scrollBy({ left: scrollStep, behavior: 'smooth' });
      else if (dir === 'left') window.scrollBy({ left: -scrollStep, behavior: 'smooth' });
      setTimeout(() => {
        updateFocusRing();
      }, 240);
    }
  }

  function updateCursorTransform() {
    cursorEl.style.transform = `translate3d(${state.cursorX}px, ${state.cursorY}px, 0)`;
  }

  function moveVirtualCursor(dir) {
    const now = Date.now();
    if (now - state.lastMoveTs < 120) {
      state.cursorStep = Math.min(54, state.cursorStep + 5);
    } else {
      state.cursorStep = 24;
    }
    state.lastMoveTs = now;

    if (dir === 'left') state.cursorX = Math.max(8, state.cursorX - state.cursorStep);
    if (dir === 'right') state.cursorX = Math.min(window.innerWidth - 8, state.cursorX + state.cursorStep);
    if (dir === 'up') {
      if (state.cursorY <= 36) window.scrollBy({ top: -180, behavior: 'smooth' });
      state.cursorY = Math.max(8, state.cursorY - state.cursorStep);
    }
    if (dir === 'down') {
      if (state.cursorY >= window.innerHeight - 36) window.scrollBy({ top: 180, behavior: 'smooth' });
      state.cursorY = Math.min(window.innerHeight - 8, state.cursorY + state.cursorStep);
    }

    updateCursorTransform();
    const target = document.elementFromPoint(state.cursorX, state.cursorY);
    if (target) {
      ['mousemove', 'mouseover', 'mouseenter'].forEach((type) => {
        target.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: state.cursorX,
          clientY: state.cursorY,
          view: window
        }));
      });
    }
  }

  function handleNavAction(action) {
    wakeHud();

    if (state.oskOpen) {
      const rowLen = oskRows[state.oskRow].length;
      if (action === 'left') state.oskCol = (state.oskCol - 1 + rowLen) % rowLen;
      else if (action === 'right') state.oskCol = (state.oskCol + 1) % rowLen;
      else if (action === 'up') {
        state.oskRow = (state.oskRow - 1 + oskRows.length) % oskRows.length;
        state.oskCol = Math.min(state.oskCol, oskRows[state.oskRow].length - 1);
      } else if (action === 'down') {
        state.oskRow = (state.oskRow + 1) % oskRows.length;
        state.oskCol = Math.min(state.oskCol, oskRows[state.oskRow].length - 1);
      } else if (action === 'ok') {
        triggerOskKey(oskRows[state.oskRow][state.oskCol]);
        return;
      } else if (action === 'back') {
        closeOsk();
        return;
      }
      renderOsk();
      return;
    }

    if (action === 'toggleMode' || action === 'keyboard') {
      setMode(state.mode === 'dpad' ? 'cursor' : 'dpad');
      return;
    }

    if (action === 'playPause') {
      const video = document.querySelector('video');
      if (video) {
        if (video.paused) video.play();
        else video.pause();
      }
      return;
    }

    if (action === 'back') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }
      exitToIrisTv();
      return;
    }

    if (['up', 'down', 'left', 'right'].includes(action)) {
      if (state.mode === 'cursor') {
        moveVirtualCursor(action);
      } else {
        moveSpatial(action);
      }
      return;
    }

    if (action === 'ok') {
      if (state.mode === 'cursor') {
        const target = document.elementFromPoint(state.cursorX, state.cursorY);
        if (target) dispatchSyntheticClick(target, state.cursorX, state.cursorY);
      } else {
        if (!state.focusedEl || !isElementValid(state.focusedEl)) {
          focusFirstAvailable();
        } else {
          dispatchSyntheticClick(state.focusedEl);
        }
      }
    }
  }

  // Ponte para controles físicos / GameController / HDMI-CEC enviados pelo webview.swift
  const prevHwHandler = window.__irisHwEvent;
  window.__irisHwEvent = function (action) {
    if (typeof prevHwHandler === 'function') prevHwHandler(action);
    handleNavAction(action);
  };

  window.addEventListener('keydown', (e) => {
    if (/^F([1-9]|1[0-2])$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ['t', 'n', 'w', 'h', 'j', 'p', 'u', 'g', 'd', 'l', 'o'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const textActive = isTextInput(document.activeElement);
    if ((e.ctrlKey || (!textActive && e.shiftKey)) && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      e.stopPropagation();
      handleNavAction('toggleMode');
      return;
    }
    if ((e.ctrlKey || (!textActive && e.shiftKey)) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      if (state.oskOpen) closeOsk();
      else hudOskBtn.click();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleNavAction('back');
      return;
    }
    // Se o usuário estiver digitando com um teclado físico num input e o teclado virtual estiver fechado, deixa digitar
    if (!state.oskOpen && textActive && !['ArrowUp', 'ArrowDown'].includes(e.key)) {
      return;
    }

    const map = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Enter: 'ok'
    };
    const action = map[e.key];
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      handleNavAction(action);
    }
  }, true);

  window.addEventListener('scroll', () => {
    if (state.mode === 'dpad') updateFocusRing();
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (state.mode === 'dpad') updateFocusRing();
  });

  setTimeout(() => {
    focusFirstAvailable();
  }, 900);
})();


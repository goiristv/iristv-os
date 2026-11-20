(() => {
  'use strict';

  const STORAGE_WEATHER_CITY = 'iristv_weather_city';
  const STORAGE_NOTES = 'iristv_notes_v1';

  let activeNativeCleanup = null;

  function cleanupActiveNative() {
    if (typeof activeNativeCleanup === 'function') {
      try { activeNativeCleanup(); } catch (_) {}
    }
    activeNativeCleanup = null;
  }

  /* =========================================================
     1. Clima Vivo (Native Weather App + Refined SVG Icons)
     ========================================================= */
  function wmoLabel(code) {
    if (code === 0) return 'Céu limpo';
    if (code === 1) return 'Predomínio de sol';
    if (code === 2) return 'Parcialmente nublado';
    if (code === 3) return 'Nublado';
    if (code === 45 || code === 48) return 'Neblina';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Chuvisco';
    if ([61, 63, 80, 81].includes(code)) return 'Chuva';
    if ([65, 66, 67, 82].includes(code)) return 'Chuva forte';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neve';
    if ([95, 96, 99].includes(code)) return 'Tempestade';
    return 'Tempo variável';
  }

  function weatherIconUrl(code, isDay = 1) {
    // 0 = Ensolarado / Noite limpa
    if (code === 0) {
      return isDay ? '/icons/weather/sol.svg' : '/icons/weather/lua.svg';
    }
    // 1, 2 = Parcialmente nublado
    if (code === 1 || code === 2) {
      return isDay ? '/icons/weather/parcialmente-nublado.svg' : '/icons/weather/parcialmente-nublado-noite.svg';
    }
    // 3 = Nublado / Encoberto
    if (code === 3) {
      return isDay ? '/icons/weather/nublado.svg' : '/icons/weather/encoberto.svg';
    }
    // 45, 48 = Neblina
    if (code === 45 || code === 48) {
      return '/icons/weather/neblina.svg';
    }
    // 51, 53, 55, 56, 57 = Garoa
    if ([51, 53, 55, 56, 57].includes(code)) {
      return '/icons/weather/garoa.svg';
    }
    // 61, 63, 80 = Chuva
    if ([61, 63, 80].includes(code)) {
      return isDay ? '/icons/weather/chuva.svg' : '/icons/weather/chuva-noite.svg';
    }
    // 65, 66, 67, 81, 82 = Chuva forte
    if ([65, 66, 67, 81, 82].includes(code)) {
      return '/icons/weather/chuva-forte.svg';
    }
    // 71, 73, 75, 77, 85, 86 = Neve
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return '/icons/weather/neve.svg';
    }
    // 95 = Trovoada
    if (code === 95) {
      return '/icons/weather/trovoada.svg';
    }
    // 96, 99 = Tempestade / Granizo
    if ([96, 99].includes(code)) {
      return '/icons/weather/tempestade.svg';
    }
    return isDay ? '/icons/weather/parcialmente-nublado.svg' : '/icons/weather/parcialmente-nublado-noite.svg';
  }

  function weatherSvg(code, isDay = 1, size = 64) {
    const iconUrl = weatherIconUrl(code, isDay);
    return `<img src="${iconUrl}" width="${size}" height="${size}" alt="" class="weather-vector-icon" loading="lazy" decoding="async" />`;
  }

  function renderWeatherApp({ app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound }) {
    cleanupActiveNative();
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow);
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc}" alt="${escHtml(app.name)}" /></div>
      <div class="app-stage-brand-title">Clima</div>
    `;

    let currentCity = localStorage.getItem(STORAGE_WEATHER_CITY) || 'São Paulo';
    const quickCities = ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Curitiba', 'Belo Horizonte', 'Salvador', 'Florianópolis', 'Lisboa', 'Nova York', 'Tóquio'];

    const renderLoading = () => {
      appStageBody.innerHTML = `
        <div class="native-weather-shell">
          <div class="native-weather-bar">
            <form id="weather-city-form" class="weather-search-form">
              <input id="weather-city-input" class="shows-search-input" type="search" value="${escHtml(currentCity)}" placeholder="Buscar cidade (ex: Curitiba, Porto Alegre, Lisboa)..." />
              <button class="btn-prism" type="submit" style="height:40px;padding:0 18px;">Buscar</button>
            </form>
            <div class="weather-city-chips">
              ${quickCities.map((c) => `<button class="cat-chip ${c.toLowerCase() === currentCity.toLowerCase() ? 'active' : ''}" type="button" data-wcity="${escHtml(c)}">${escHtml(c)}</button>`).join('')}
            </div>
          </div>
          <div class="shows-loading-state">Carregando previsão meteorológica de <strong>${escHtml(currentCity)}</strong>...</div>
        </div>
      `;
      bindSearchControls();
    };

    const bindSearchControls = () => {
      appStageBody.querySelector('#weather-city-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = document.getElementById('weather-city-input')?.value?.trim();
        if (!val) return;
        playUiSound('select');
        loadCity(val);
      });
      appStageBody.querySelectorAll('[data-wcity]').forEach((btn) => {
        btn.addEventListener('click', () => {
          playUiSound('move');
          loadCity(btn.dataset.wcity);
        });
      });
    };

    const loadCity = async (city) => {
      currentCity = city;
      localStorage.setItem(STORAGE_WEATHER_CITY, city);
      renderLoading();
      try {
        const res = await fetch(`/api/weather?q=${encodeURIComponent(city)}&lang=pt`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar clima');
        renderForecast(data);
      } catch (err) {
        appStageBody.innerHTML = `
          <div class="native-weather-shell">
            <div class="native-weather-bar">
              <form id="weather-city-form" class="weather-search-form">
                <input id="weather-city-input" class="shows-search-input" type="search" value="${escHtml(currentCity)}" placeholder="Buscar cidade..." />
                <button class="btn-prism" type="submit" style="height:40px;padding:0 18px;">Buscar</button>
              </form>
            </div>
            <div class="shows-empty-state">${escHtml(err.message)}</div>
          </div>
        `;
        bindSearchControls();
      }
    };

    const renderForecast = (w) => {
      const cur = w.current || {};
      const tempNow = Math.round(cur.temperature_2m ?? 0);
      const feels = Math.round(cur.apparent_temperature ?? tempNow);
      const code = Number(cur.weather_code ?? 0);
      const isDay = Number(cur.is_day ?? 1);
      const isRain = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code);

      const heroGrad = !isDay
        ? 'linear-gradient(135deg, #0b142b 0%, #17274d 55%, #0a1022 100%)'
        : isRain
          ? 'linear-gradient(135deg, #1d3557 0%, #2c4c70 55%, #16263a 100%)'
          : 'linear-gradient(135deg, #1560d4 0%, #2b90ea 55%, #103d8c 100%)';

      const hourly = w.hourly || {};
      const nowIso = cur.time || '';
      let startIdx = Math.max(0, (hourly.time || []).findIndex((t) => t >= nowIso));
      const hourCards = (hourly.time || []).slice(startIdx, startIdx + 12).map((tStr, i) => {
        const idx = startIdx + i;
        const hLabel = i === 0 ? 'Agora' : tStr.slice(11, 16);
        const hTemp = Math.round(hourly.temperature_2m?.[idx] ?? tempNow);
        const hCode = Number(hourly.weather_code?.[idx] ?? code);
        const hDay = Number(hourly.is_day?.[idx] ?? isDay);
        return `
          <div class="weather-hour-card">
            <span>${hLabel}</span>
            ${weatherSvg(hCode, hDay, 38)}
            <strong>${hTemp}°</strong>
          </div>
        `;
      }).join('');

      const daily = w.daily || {};
      const allMin = Math.min(...(daily.temperature_2m_min || [10]));
      const allMax = Math.max(...(daily.temperature_2m_max || [30]));
      const span = Math.max(1, allMax - allMin);

      const dayRows = (daily.time || []).map((dStr, i) => {
        const dt = new Date(`${dStr}T12:00:00`);
        const dayName = i === 0 ? 'Hoje' : dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const dMin = Math.round(daily.temperature_2m_min?.[i] ?? 0);
        const dMax = Math.round(daily.temperature_2m_max?.[i] ?? 0);
        const dCode = Number(daily.weather_code?.[i] ?? 0);
        const rainProb = daily.precipitation_probability_max?.[i] ?? 0;
        const leftPct = Math.round(((dMin - allMin) / span) * 100);
        const widthPct = Math.max(12, Math.round(((dMax - dMin) / span) * 100));
        return `
          <div class="weather-day-row">
            <span class="wd-name">${escHtml(dayName)}</span>
            <div class="wd-ico">${weatherSvg(dCode, 1, 32)} ${rainProb > 15 ? `<small>${rainProb}%</small>` : ''}</div>
            <span class="wd-min">${dMin}°</span>
            <div class="wd-bar-track"><div class="wd-bar-fill" style="left:${leftPct}%;width:${widthPct}%"></div></div>
            <span class="wd-max">${dMax}°</span>
          </div>
        `;
      }).join('');

      const todayMin = Math.round(daily.temperature_2m_min?.[0] ?? tempNow);
      const todayMax = Math.round(daily.temperature_2m_max?.[0] ?? tempNow);

      appStageBody.innerHTML = `
        <div class="native-weather-shell">
          <div class="native-weather-bar">
            <form id="weather-city-form" class="weather-search-form">
              <input id="weather-city-input" class="shows-search-input" type="search" value="${escHtml(currentCity)}" placeholder="Buscar cidade..." />
              <button class="btn-prism" type="submit" style="height:40px;padding:0 18px;">Buscar</button>
            </form>
            <div class="weather-city-chips">
              ${quickCities.map((c) => `<button class="cat-chip ${c.toLowerCase() === w.location.city.toLowerCase() ? 'active' : ''}" type="button" data-wcity="${escHtml(c)}">${escHtml(c)}</button>`).join('')}
            </div>
          </div>

          <div class="weather-hero-card" style="background:${heroGrad}">
            <div class="weather-hero-main">
              <div class="weather-loc-meta">
                <h2>${escHtml(w.location.city)}</h2>
                <span>${escHtml(w.location.country)}</span>
              </div>
              <div class="weather-temp-row">
                <span class="weather-big-temp">${tempNow}°</span>
                <div class="weather-cond-stack">
                  <strong>${escHtml(wmoLabel(code))}</strong>
                  <span>Máx ${todayMax}° • Mín ${todayMin}°</span>
                </div>
              </div>
            </div>
            <div class="weather-hero-icon-big">
              ${weatherSvg(code, isDay, 128)}
            </div>
          </div>

          <div class="weather-stats-grid">
            <div class="weather-stat-tile">
              <div class="wstat-header">
                <img src="/icons/weather/termometro.svg" width="20" height="20" class="wstat-icon" alt="" />
                <small>SENSAÇÃO</small>
              </div>
              <strong class="wstat-val">${feels}°C</strong>
              <span class="wstat-sub">${feels === tempNow ? 'Igual à temperatura' : (feels > tempNow ? 'Sensação mais quente' : 'Sensação mais fresca')}</span>
            </div>
            <div class="weather-stat-tile">
              <div class="wstat-header">
                <img src="/icons/weather/umidade.svg" width="20" height="20" class="wstat-icon" alt="" />
                <small>UMIDADE</small>
              </div>
              <strong class="wstat-val">${cur.relative_humidity_2m ?? '--'}%</strong>
              <span class="wstat-sub">Ponto de orvalho favorável</span>
            </div>
            <div class="weather-stat-tile">
              <div class="wstat-header">
                <img src="/icons/weather/vento.svg" width="20" height="20" class="wstat-icon" alt="" />
                <small>VENTO</small>
              </div>
              <strong class="wstat-val">${Math.round(cur.wind_speed_10m ?? 0)} <span style="font-size:0.75em;font-weight:600;">km/h</span></strong>
              <span class="wstat-sub">Brisa regular</span>
            </div>
            <div class="weather-stat-tile">
              <div class="wstat-header">
                <img src="/icons/weather/sol.svg" width="20" height="20" class="wstat-icon" alt="" />
                <small>ÍNDICE UV</small>
              </div>
              <strong class="wstat-val">${Math.round(cur.uv_index ?? 0)}</strong>
              <span class="wstat-sub">${(cur.uv_index ?? 0) <= 2 ? 'Baixo' : ((cur.uv_index ?? 0) <= 5 ? 'Moderado' : 'Alto')}</span>
            </div>
            <div class="weather-stat-tile">
              <div class="wstat-header">
                <img src="/icons/weather/nascer-do-sol.svg" width="20" height="20" class="wstat-icon" alt="" />
                <small>NASCER DO SOL</small>
              </div>
              <strong class="wstat-val">${String(daily.sunrise?.[0] || '').slice(11, 16) || '--:--'}</strong>
              <span class="wstat-sub">Alvorada</span>
            </div>
            <div class="weather-stat-tile">
              <div class="wstat-header">
                <img src="/icons/weather/por-do-sol.svg" width="20" height="20" class="wstat-icon" alt="" />
                <small>PÔR DO SOL</small>
              </div>
              <strong class="wstat-val">${String(daily.sunset?.[0] || '').slice(11, 16) || '--:--'}</strong>
              <span class="wstat-sub">Crepúsculo</span>
            </div>
          </div>

          <div class="weather-section-box">
            <h4>Previsão nas próximas horas</h4>
            <div class="weather-hourly-strip">${hourCards}</div>
          </div>

          <div class="weather-section-box">
            <h4>Próximos 7 dias</h4>
            <div class="weather-daily-list">${dayRows}</div>
          </div>
        </div>
      `;
      bindSearchControls();
    };

    appStageOverlay.classList.remove('hidden');
    loadCity(currentCity);
  }

  /* =========================================================
     2. Calculadora (Native IrisOS App)
     ========================================================= */
  function renderCalculatorApp({ app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound }) {
    cleanupActiveNative();
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow);
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc}" alt="Calculadora" /></div>
      <div class="app-stage-brand-title">Calculadora</div>
    `;

    let display = '0';
    let stored = null;
    let pendingOp = null;
    let resetOnNextDigit = false;
    let expressionLine = '';
    const history = [];

    const fmtNum = (valStr) => {
      if (valStr === 'Erro') return 'Erro';
      const n = Number(valStr);
      if (!Number.isFinite(n)) return 'Erro';
      if (valStr.endsWith('.')) return `${n.toLocaleString('pt-BR')},`;
      const parts = valStr.split('.');
      const intFmt = Number(parts[0]).toLocaleString('pt-BR');
      return parts[1] !== undefined ? `${intFmt},${parts[1]}` : intFmt;
    };

    const compute = (a, op, b) => {
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (op === '/') return b === 0 ? NaN : a / b;
      return b;
    };

    const opSymbol = (op) => ({ '+': '+', '-': '−', '*': '×', '/': '÷' }[op] || op);

    const updateDom = () => {
      const dispEl = document.getElementById('calc-display-val');
      const exprEl = document.getElementById('calc-expr-val');
      const histEl = document.getElementById('calc-history-list');
      if (dispEl) dispEl.textContent = fmtNum(display);
      if (exprEl) exprEl.textContent = expressionLine || '\u00a0';
      if (histEl) {
        histEl.innerHTML = history.length
          ? history.map((h, i) => `<button class="calc-hist-item" type="button" data-hist-idx="${i}"><span>${escHtml(h.expr)}</span><strong>${escHtml(h.resFmt)}</strong></button>`).join('')
          : '<div class="calc-hist-empty">Seu histórico de cálculos aparece aqui</div>';
        histEl.querySelectorAll('[data-hist-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const item = history[Number(btn.dataset.histIdx)];
            if (item) {
              display = String(item.raw);
              resetOnNextDigit = true;
              playUiSound('select');
              updateDom();
            }
          });
        });
      }
      document.querySelectorAll('.calc-op-btn').forEach((b) => {
        b.classList.toggle('is-active', pendingOp === b.dataset.op && resetOnNextDigit);
      });
    };

    const pressDigit = (d) => {
      playUiSound('move');
      if (display === 'Erro' || resetOnNextDigit) {
        display = d === '.' ? '0.' : d;
        resetOnNextDigit = false;
      } else if (d === '.') {
        if (!display.includes('.')) display += '.';
      } else {
        display = display === '0' ? d : (display.length < 14 ? display + d : display);
      }
      updateDom();
    };

    const pressOp = (op) => {
      playUiSound('select');
      const cur = Number(display);
      if (stored !== null && pendingOp && !resetOnNextDigit) {
        const res = compute(stored, pendingOp, cur);
        if (!Number.isFinite(res)) {
          display = 'Erro';
          stored = null;
          pendingOp = null;
          expressionLine = '';
          updateDom();
          return;
        }
        stored = Number(res.toPrecision(12));
        display = String(stored);
      } else {
        stored = Number.isFinite(cur) ? cur : 0;
      }
      pendingOp = op;
      resetOnNextDigit = true;
      expressionLine = `${fmtNum(String(stored))} ${opSymbol(op)}`;
      updateDom();
    };

    const pressEquals = () => {
      if (pendingOp === null || stored === null) return;
      playUiSound('chime');
      const cur = Number(display);
      const res = compute(stored, pendingOp, cur);
      const expr = `${fmtNum(String(stored))} ${opSymbol(pendingOp)} ${fmtNum(display)} =`;
      if (!Number.isFinite(res)) {
        display = 'Erro';
      } else {
        const clean = Number(res.toPrecision(12));
        display = String(clean);
        history.unshift({ expr, resFmt: fmtNum(display), raw: clean });
        if (history.length > 20) history.pop();
      }
      expressionLine = expr;
      stored = null;
      pendingOp = null;
      resetOnNextDigit = true;
      updateDom();
    };

    const pressAction = (act) => {
      if (act === 'clear') {
        playUiSound('back');
        display = '0';
        stored = null;
        pendingOp = null;
        resetOnNextDigit = false;
        expressionLine = '';
      } else if (act === 'sign') {
        playUiSound('move');
        if (display !== '0' && display !== 'Erro') {
          display = display.startsWith('-') ? display.slice(1) : `-${display}`;
        }
      } else if (act === 'pct') {
        playUiSound('move');
        const cur = Number(display);
        if (Number.isFinite(cur)) display = String(Number((cur / 100).toPrecision(12)));
      } else if (act === 'back') {
        playUiSound('move');
        if (resetOnNextDigit || display.length <= 1 || display === 'Erro') display = '0';
        else display = display.slice(0, -1);
      }
      updateDom();
    };

    appStageBody.innerHTML = `
      <div class="native-calc-layout">
        <div class="native-calc-body">
          <div class="calc-screen">
            <div id="calc-expr-val" class="calc-expr-line">&nbsp;</div>
            <div id="calc-display-val" class="calc-display-val">0</div>
          </div>
          <div class="calc-keypad">
            <button class="calc-key calc-fn" type="button" data-act="clear">AC</button>
            <button class="calc-key calc-fn" type="button" data-act="sign">±</button>
            <button class="calc-key calc-fn" type="button" data-act="pct">%</button>
            <button class="calc-key calc-op calc-op-btn" type="button" data-op="/">÷</button>

            <button class="calc-key" type="button" data-digit="7">7</button>
            <button class="calc-key" type="button" data-digit="8">8</button>
            <button class="calc-key" type="button" data-digit="9">9</button>
            <button class="calc-key calc-op calc-op-btn" type="button" data-op="*">×</button>

            <button class="calc-key" type="button" data-digit="4">4</button>
            <button class="calc-key" type="button" data-digit="5">5</button>
            <button class="calc-key" type="button" data-digit="6">6</button>
            <button class="calc-key calc-op calc-op-btn" type="button" data-op="-">−</button>

            <button class="calc-key" type="button" data-digit="1">1</button>
            <button class="calc-key" type="button" data-digit="2">2</button>
            <button class="calc-key" type="button" data-digit="3">3</button>
            <button class="calc-key calc-op calc-op-btn" type="button" data-op="+">+</button>

            <button class="calc-key calc-zero" type="button" data-digit="0">0</button>
            <button class="calc-key" type="button" data-digit=".">,</button>
            <button class="calc-key calc-op" type="button" id="calc-eq-btn">=</button>
          </div>
        </div>
        <aside class="native-calc-history">
          <div class="calc-hist-head">
            <span>Histórico</span>
            <button id="calc-back-key" class="btn-glass" type="button" style="height:28px;font-size:0.74rem;padding:0 10px;">DEL Apagar</button>
          </div>
          <div id="calc-history-list" class="calc-hist-list"></div>
        </aside>
      </div>
    `;

    appStageBody.querySelectorAll('[data-digit]').forEach((b) => b.addEventListener('click', () => pressDigit(b.dataset.digit)));
    appStageBody.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => pressOp(b.dataset.op)));
    appStageBody.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => pressAction(b.dataset.act)));
    appStageBody.querySelector('#calc-eq-btn')?.addEventListener('click', pressEquals);
    appStageBody.querySelector('#calc-back-key')?.addEventListener('click', () => pressAction('back'));

    const onKeyDown = (e) => {
      if (
        appStageOverlay.classList.contains('hidden') ||
        (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) ||
        !document.getElementById('wifi-popover')?.classList.contains('hidden') ||
        !document.getElementById('iris-osk')?.classList.contains('hidden')
      ) {
        return;
      }
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pressDigit(e.key); }
      else if (e.key === '.' || e.key === ',') { e.preventDefault(); pressDigit('.'); }
      else if (['+', '-', '*', '/'].includes(e.key)) { e.preventDefault(); pressOp(e.key); }
      else if (e.key === '%') { e.preventDefault(); pressAction('pct'); }
      else if (e.key === '=') { e.preventDefault(); pressEquals(); }
      else if (e.key === 'Enter') {
        const focusedEl = appStageOverlay.querySelector('.is-focused');
        if (!focusedEl || focusedEl.id === 'calc-eq-btn') {
          e.preventDefault();
          pressEquals();
        }
      }
      else if (e.key === 'Backspace') { e.preventDefault(); pressAction('back'); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); pressAction('clear'); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    activeNativeCleanup = () => window.removeEventListener('keydown', onKeyDown, true);

    updateDom();
    appStageOverlay.classList.remove('hidden');
  }

  /* =========================================================
     3. Relógio & Foco (World Clock + Stopwatch + Timer)
     ========================================================= */
  function renderClockApp({ app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, playUiSound }) {
    cleanupActiveNative();
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow);
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc}" alt="Relógio" /></div>
      <div class="app-stage-brand-title">Relógio</div>
    `;

    let swRunning = false;
    let swElapsedMs = 0;
    let swLastTick = 0;
    const zones = [
      { name: 'Brasília', tz: 'America/Sao_Paulo' },
      { name: 'Nova York', tz: 'America/New_York' },
      { name: 'Londres', tz: 'Europe/London' },
      { name: 'Tóquio', tz: 'Asia/Tokyo' }
    ];

    appStageBody.innerHTML = `
      <div class="native-clock-grid">
        <div class="clock-main-panel">
          <span class="hero-badge prism-tag">HORA LOCAL</span>
          <div id="nclk-big" class="nclk-big">--:--:--</div>
          <div id="nclk-date" class="nclk-date">---</div>
          <div class="clock-zones-row" id="nclk-zones"></div>
        </div>
        <div class="clock-sw-panel">
          <h4>Cronômetro</h4>
          <div id="nclk-sw-val" class="nclk-sw-val">00:00.0</div>
          <div class="clock-sw-btns">
            <button id="nclk-sw-toggle" class="btn-prism" type="button" style="height:40px;padding:0 20px;">Iniciar</button>
            <button id="nclk-sw-reset" class="btn-glass" type="button" style="height:40px;padding:0 18px;">Zerar</button>
          </div>
        </div>
      </div>
    `;

    const fmtSw = (ms) => {
      const tenths = Math.floor((ms % 1000) / 100);
      const totalSec = Math.floor(ms / 1000);
      const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const secs = String(totalSec % 60).padStart(2, '0');
      return `${mins}:${secs}.${tenths}`;
    };

    const tick = () => {
      const now = new Date();
      const bigEl = document.getElementById('nclk-big');
      const dateEl = document.getElementById('nclk-date');
      const zEl = document.getElementById('nclk-zones');
      if (bigEl) bigEl.textContent = now.toLocaleTimeString('pt-BR', { hour12: false });
      if (dateEl) dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      if (zEl) {
        zEl.innerHTML = zones.map((z) => {
          const t = now.toLocaleTimeString('pt-BR', { timeZone: z.tz, hour: '2-digit', minute: '2-digit' });
          return `<div class="clock-zone-chip"><small>${z.name}</small><strong>${t}</strong></div>`;
        }).join('');
      }
      if (swRunning) {
        const curT = performance.now();
        swElapsedMs += curT - swLastTick;
        swLastTick = curT;
        const swEl = document.getElementById('nclk-sw-val');
        if (swEl) swEl.textContent = fmtSw(swElapsedMs);
      }
    };

    document.getElementById('nclk-sw-toggle')?.addEventListener('click', (e) => {
      playUiSound('select');
      swRunning = !swRunning;
      if (swRunning) swLastTick = performance.now();
      e.target.textContent = swRunning ? 'Pausar' : 'Continuar';
    });
    document.getElementById('nclk-sw-reset')?.addEventListener('click', () => {
      playUiSound('back');
      swRunning = false;
      swElapsedMs = 0;
      const tBtn = document.getElementById('nclk-sw-toggle');
      const swEl = document.getElementById('nclk-sw-val');
      if (tBtn) tBtn.textContent = 'Iniciar';
      if (swEl) swEl.textContent = '00:00.0';
    });

    tick();
    const timer = setInterval(tick, 100);
    activeNativeCleanup = () => clearInterval(timer);
    appStageOverlay.classList.remove('hidden');
  }

  /* =========================================================
     4. Notas da TV (Native IrisOS Notes)
     ========================================================= */
  function renderNotesApp({ app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound }) {
    cleanupActiveNative();
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow);
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc}" alt="Notas" /></div>
      <div class="app-stage-brand-title">Notas</div>
    `;

    let notes = [];
    try {
      notes = JSON.parse(localStorage.getItem(STORAGE_NOTES) || '[]');
      if (!Array.isArray(notes)) notes = [];
    } catch (_) { notes = []; }

    const save = () => localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes));

    const renderList = () => {
      appStageBody.innerHTML = `
        <div class="native-notes-shell">
          <form id="notes-add-form" class="notes-add-form">
            <input id="notes-input" class="shows-search-input" type="text" placeholder="Escreva uma nota ou lembrete rápido..." required />
            <button class="btn-prism" type="submit" style="height:42px;padding:0 20px;">+ Adicionar Nota</button>
          </form>
          ${notes.length ? `
            <div class="notes-grid">
              ${notes.map((n) => `
                <article class="note-card">
                  <p>${escHtml(n.text)}</p>
                  <div class="note-foot">
                    <small>${new Date(n.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</small>
                    <button type="button" class="note-del-btn" data-del-note="${escHtml(n.id)}">Excluir</button>
                  </div>
                </article>
              `).join('')}
            </div>
          ` : `
            <div class="stg-empty-state" style="padding:48px 20px;text-align:center;color:var(--text-muted);border:1px dashed rgba(255,255,255,0.12);border-radius:18px;">
              Nenhuma nota adicionada ainda.
            </div>
          `}
        </div>
      `;

      appStageBody.querySelector('#notes-add-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = document.getElementById('notes-input')?.value?.trim();
        if (!val) return;
        notes.unshift({ id: `n_${Date.now().toString(36)}`, text: val, ts: Date.now() });
        save();
        playUiSound('select');
        renderList();
      });

      appStageBody.querySelectorAll('[data-del-note]').forEach((btn) => {
        btn.addEventListener('click', () => {
          notes = notes.filter((n) => n.id !== btn.dataset.delNote);
          save();
          playUiSound('back');
          renderList();
        });
      });
    };

    renderList();
    appStageOverlay.classList.remove('hidden');
  }

  /* =========================================================
     5. irisWeb (Navegador Completo com Abas, Omnibox, Histórico & Favoritos)
     ========================================================= */
  function renderBrowserApp({ app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound, openWebUrl }) {
    cleanupActiveNative();
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow || 'rgba(0, 240, 255, 0.45)');
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc || 'icons/browser.svg'}" alt="Iris Browser" /></div>
      <div class="app-stage-brand-title">Iris Browser</div>
    `;

    // Speed Dial Categories
    const speedDialCategories = [
      {
        cat: 'Pesquisa & IA',
        sites: [
          { name: 'Google', url: 'https://www.google.com', icon: 'icons/gemini.jpg' },
          { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: 'icons/browser.svg' },
          { name: 'ChatGPT', url: 'https://chatgpt.com', icon: 'icons/chatgpt.jpg' },
          { name: 'Wikipédia', url: 'https://pt.wikipedia.org', icon: 'icons/wikipedia.jpg' }
        ]
      },
      {
        cat: 'Notícias & Esportes',
        sites: [
          { name: 'G1 Notícias', url: 'https://g1.globo.com', icon: 'icons/globoplay.jpg' },
          { name: 'Canal UOL', url: 'https://www.uol.com.br', icon: 'icons/canaluol.png' },
          { name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br', icon: 'icons/cnnbrasil.jpg' },
          { name: 'ge Globo Esporte', url: 'https://ge.globo.com', icon: 'icons/globoplay.jpg' }
        ]
      },
      {
        cat: 'Entretenimento & Mídia',
        sites: [
          { name: 'YouTube', url: 'https://www.youtube.com', icon: 'icons/youtube.jpg' },
          { name: 'Twitch', url: 'https://www.twitch.tv', icon: 'icons/twitch.jpg' },
          { name: 'IMDb', url: 'https://www.imdb.com', icon: 'icons/imdb.jpg' }
        ]
      },
      {
        cat: 'Ferramentas & Produtividade',
        sites: [
          { name: 'GitHub', url: 'https://github.com', icon: 'icons/github.jpg' },
          { name: 'Google Maps', url: 'https://maps.google.com', icon: 'icons/googlemaps.jpg' },
          { name: 'TradingView', url: 'https://www.tradingview.com', icon: 'icons/tradingview.jpg' },
          { name: 'Canva', url: 'https://www.canva.com', icon: 'icons/canva.jpg' }
        ]
      }
    ];

    // Local Storage Helpers
    const getBookmarks = () => {
      try { return JSON.parse(localStorage.getItem('iris_browser_bookmarks_v1') || '[]'); } catch (_) { return []; }
    };
    const saveBookmarks = (bms) => {
      try { localStorage.setItem('iris_browser_bookmarks_v1', JSON.stringify(bms)); } catch (_) {}
    };
    const getHistory = () => {
      try { return JSON.parse(localStorage.getItem('iris_browser_history_v1') || '[]'); } catch (_) { return []; }
    };
    const pushHistory = (item) => {
      try {
        const hist = getHistory().filter((h) => h.url !== item.url);
        hist.unshift({ ...item, time: Date.now() });
        if (hist.length > 25) hist.length = 25;
        localStorage.setItem('iris_browser_history_v1', JSON.stringify(hist));
      } catch (_) {}
    };

    // Browser Internal State
    let zoomLevel = 1.0;
    let searchEngine = 'duckduckgo'; // duckduckgo embeds nicely in iframes!
    let nextTabId = 1;
    let tabs = [
      { id: nextTabId++, title: 'Início', url: 'about:home', history: ['about:home'], historyIdx: 0, isLoading: false }
    ];
    let activeTabId = tabs[0].id;
    const prefetchedUrls = new Set();
    const tabIframeMap = new Map(); // tabId -> { wrapEl, iframeEl, loadedUrl }
    let shellMounted = false;

    function prefetchUrl(url) {
      if (!url || !url.startsWith('http') || prefetchedUrls.has(url)) return;
      prefetchedUrls.add(url);
      fetch(`/api/browser-proxy?url=${encodeURIComponent(url)}&prefetch=1`, { priority: 'low' }).catch(() => {});
    }

    function toProxyUrl(url, noCache = false) {
      if (!url || !url.startsWith('http')) return url || '';
      return `/api/browser-proxy?url=${encodeURIComponent(url)}${noCache ? '&nocache=1' : ''}`;
    }

    function getActiveTab() {
      return tabs.find((t) => t.id === activeTabId) || tabs[0];
    }

    function ensureShellMounted() {
      if (shellMounted && appStageBody.querySelector('.iris-browser-container')) return;
      shellMounted = true;
      appStageBody.innerHTML = `
        <div class="iris-browser-container">
          <div class="browser-tabs-bar" role="tablist">
            <div class="browser-tabs-scroll" id="browser-tabs-scroll"></div>
            <button id="browser-new-tab-btn" class="browser-new-tab-btn focusable" type="button" title="Abrir nova guia">＋</button>
          </div>
          <div class="browser-toolbar">
            <div class="browser-nav-group">
              <button id="br-btn-back" class="br-tool-btn focusable" type="button" title="Voltar">←</button>
              <button id="br-btn-forward" class="br-tool-btn focusable" type="button" title="Avançar">→</button>
              <button id="br-btn-reload" class="br-tool-btn focusable" type="button" title="Recarregar">↻</button>
              <button id="br-btn-home" class="br-tool-btn focusable" type="button" title="Página Inicial"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></button>
            </div>
            <form id="browser-omnibox-form" class="browser-omnibox-wrap">
              <span class="br-security-badge" title="Conexão Segura"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
              <input id="browser-omnibox-input" class="browser-omnibox-input focusable" type="text"
                placeholder="Pesquise ou digite uma URL (ex: wikipedia.org, duckduckgo.com)..."
                spellcheck="false" autocomplete="off" />
              <button class="br-omnibox-go-btn" type="submit" title="Ir para a página">Ir</button>
            </form>
            <div class="browser-actions-group">
              <button id="br-btn-fav" class="br-tool-btn focusable" type="button" title="Salvar nos Favoritos"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
              <div class="browser-zoom-pill">
                <button id="br-zoom-out" class="br-zoom-btn" type="button" title="Diminuir Zoom">A-</button>
                <span class="br-zoom-label" id="br-zoom-label">${Math.round(zoomLevel * 100)}%</span>
                <button id="br-zoom-in" class="br-zoom-btn" type="button" title="Aumentar Zoom">A+</button>
              </div>
              <button id="br-btn-popout" class="br-tool-btn focusable" type="button" title="Abrir em Nova Janela / WKWebView">↗</button>
            </div>
          </div>
          <div id="browser-loading-bar" class="browser-loading-bar"></div>
          <div class="browser-viewport-wrapper" id="browser-viewport-wrapper">
            <div id="browser-start-page-slot"></div>
            <div id="browser-iframe-pool" style="width:100%;height:100%;position:relative;"></div>
          </div>
        </div>
      `;
      bindStaticToolbarEvents();
    }

    function applyZoomToAllFrames() {
      const label = document.getElementById('br-zoom-label');
      if (label) label.textContent = `${Math.round(zoomLevel * 100)}%`;
      tabIframeMap.forEach(({ wrapEl }) => {
        wrapEl.style.transform = `scale(${zoomLevel})`;
        wrapEl.style.transformOrigin = 'top left';
        wrapEl.style.width = `calc(100% / ${zoomLevel})`;
        wrapEl.style.height = `calc(100% / ${zoomLevel})`;
      });
    }

    function renderBrowserFrame() {
      ensureShellMounted();
      const curTab = getActiveTab();
      const isHome = !curTab.url || curTab.url === 'about:home';
      const userBms = getBookmarks();
      const recentHist = getHistory();

      // Update tabs strip
      const tabsScroll = document.getElementById('browser-tabs-scroll');
      if (tabsScroll) {
        tabsScroll.innerHTML = tabs.map((tab) => `
          <div class="browser-tab ${tab.id === activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
            <span class="browser-tab-fav">${tab.url === 'about:home' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>'}</span>
            <span class="browser-tab-title" title="${escHtml(tab.title)}">${escHtml(tab.title || 'Guia')}</span>
            ${tabs.length > 1 ? `<button class="browser-tab-close" type="button" data-close-tab="${tab.id}" title="Fechar guia">&times;</button>` : ''}
          </div>
        `).join('');
        bindTabStripEvents();
      }

      // Update toolbar controls
      const backBtn = document.getElementById('br-btn-back');
      const fwdBtn = document.getElementById('br-btn-forward');
      const omniInput = document.getElementById('browser-omnibox-input');
      const loadBar = document.getElementById('browser-loading-bar');
      if (backBtn) backBtn.disabled = curTab.historyIdx <= 0;
      if (fwdBtn) fwdBtn.disabled = curTab.historyIdx >= curTab.history.length - 1;
      if (omniInput) omniInput.value = isHome ? '' : curTab.url;
      if (loadBar) loadBar.classList.toggle('loading', Boolean(curTab.isLoading));

      // Prune closed tab iframes
      const aliveIds = new Set(tabs.map((t) => t.id));
      tabIframeMap.forEach((entry, tid) => {
        if (!aliveIds.has(tid)) {
          entry.wrapEl.remove();
          tabIframeMap.delete(tid);
        }
      });

      const startSlot = document.getElementById('browser-start-page-slot');
      const iframePool = document.getElementById('browser-iframe-pool');

      if (isHome) {
        if (iframePool) iframePool.style.display = 'none';
        if (startSlot) {
          startSlot.style.display = 'block';
          startSlot.innerHTML = `
              <!-- START PAGE / SPEED DIAL -->
              <div class="browser-start-page">
                <div class="browser-brand-hero">
                  <div class="browser-hero-glow"></div>
                  <img class="browser-hero-logo" src="icons/browser.svg" alt="Iris Browser" />
                  <h2>Iris Browser</h2>
                  <p class="browser-hero-sub">Navegação moderna, rápida e integrada para Smart TV</p>

                  <form id="startpage-search-form" class="browser-big-search">
                    <select id="startpage-engine-select" class="browser-engine-select">
                      <option value="duckduckgo" ${searchEngine === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo</option>
                      <option value="google" ${searchEngine === 'google' ? 'selected' : ''}>Google</option>
                      <option value="wikipedia" ${searchEngine === 'wikipedia' ? 'selected' : ''}>Wikipédia</option>
                      <option value="bing" ${searchEngine === 'bing' ? 'selected' : ''}>Bing</option>
                    </select>
                    <input id="startpage-search-input" class="browser-big-input focusable" type="text" placeholder="O que você deseja buscar na web hoje?" autofocus />
                    <button class="btn-prism browser-big-btn" type="submit">Buscar</button>
                  </form>
                </div>

                <!-- Custom User Bookmarks Row -->
                <div class="browser-section">
                  <div class="browser-section-header">
                    <h4>Favoritos</h4>
                    <button id="browser-add-bookmark-btn" class="browser-mini-btn focusable" type="button">＋ Adicionar Site</button>
                  </div>
                  <div class="browser-chips-grid">
                    ${userBms.length === 0 ? `
                      <div class="browser-empty-state">Nenhum favorito salvo ainda. Clique em "Adicionar Site" ou na ícone de estrela para fixar sites.</div>
                    ` : userBms.map((b, idx) => `
                      <div class="browser-bm-tile" data-nav-url="${escHtml(b.url)}">
                        <span class="bm-tile-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></span>
                        <div class="bm-tile-info">
                          <span class="bm-tile-title">${escHtml(b.name || b.url)}</span>
                          <span class="bm-tile-url">${escHtml(b.url)}</span>
                        </div>
                        <button class="bm-tile-del" type="button" data-del-bm="${idx}" title="Excluir">&times;</button>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Curated Speed Dial Categories -->
                ${speedDialCategories.map((c) => `
                  <div class="browser-section">
                    <div class="browser-section-header">
                      <h4>${escHtml(c.cat)}</h4>
                    </div>
                    <div class="browser-speed-grid">
                      ${c.sites.map((s) => `
                        <button class="browser-speed-card focusable" type="button" data-nav-url="${escHtml(s.url)}" data-nav-name="${escHtml(s.name)}">
                          <div class="browser-speed-icon-box">
                            <img src="${escHtml(s.icon)}" alt="${escHtml(s.name)}" loading="lazy" />
                          </div>
                          <span class="browser-speed-name">${escHtml(s.name)}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                `).join('')}

                <!-- Recent Browsing History -->
                ${recentHist.length > 0 ? `
                  <div class="browser-section">
                    <div class="browser-section-header">
                      <h4>Histórico Recente</h4>
                      <button id="browser-clear-history-btn" class="browser-mini-btn focusable" type="button">Limpar Histórico</button>
                    </div>
                    <div class="browser-history-list">
                      ${recentHist.slice(0, 8).map((h) => `
                        <button class="browser-history-item focusable" type="button" data-nav-url="${escHtml(h.url)}">
                          <span class="br-hist-url">${escHtml(h.title || h.url)}</span>
                          <span class="br-hist-date">${new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
          `;
          bindStartPageEvents();
        }
      } else {
        if (startSlot) startSlot.style.display = 'none';
        if (iframePool) {
          iframePool.style.display = 'block';
          tabIframeMap.forEach((entry, tid) => {
            entry.wrapEl.style.display = tid === curTab.id ? 'block' : 'none';
          });
          let entry = tabIframeMap.get(curTab.id);
          if (!entry) {
            const wrapEl = document.createElement('div');
            wrapEl.className = 'browser-iframe-container';
            wrapEl.style.transform = `scale(${zoomLevel})`;
            wrapEl.style.transformOrigin = 'top left';
            wrapEl.style.width = `calc(100% / ${zoomLevel})`;
            wrapEl.style.height = `calc(100% / ${zoomLevel})`;
            const iframeEl = document.createElement('iframe');
            iframeEl.className = 'browser-active-iframe';
            iframeEl.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads');
            iframeEl.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            iframeEl.allowFullscreen = true;
            iframeEl.onload = () => {
              curTab.isLoading = false;
              if (getActiveTab().id === curTab.id) {
                document.getElementById('browser-loading-bar')?.classList.remove('loading');
              }
            };
            wrapEl.appendChild(iframeEl);
            iframePool.appendChild(wrapEl);
            entry = { wrapEl, iframeEl, loadedUrl: '' };
            tabIframeMap.set(curTab.id, entry);
          }
          entry.wrapEl.style.display = 'block';
          if (entry.loadedUrl !== curTab.url) {
            entry.loadedUrl = curTab.url;
            curTab.isLoading = true;
            if (loadBar) loadBar.classList.add('loading');
            entry.iframeEl.src = toProxyUrl(curTab.url);
          }
        }
      }
    }

    function navigateTab(targetUrl, title = null) {
      if (!targetUrl) return;
      let finalUrl = targetUrl.trim();
      if (finalUrl === 'about:home' || finalUrl === '') {
        finalUrl = 'about:home';
      } else if (!/^https?:\/\//i.test(finalUrl)) {
        if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
          finalUrl = `https://${finalUrl}`;
        } else {
          // Search Engine URL
          if (searchEngine === 'google') finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
          else if (searchEngine === 'wikipedia') finalUrl = `https://pt.wikipedia.org/w/index.php?search=${encodeURIComponent(finalUrl)}`;
          else if (searchEngine === 'bing') finalUrl = `https://www.bing.com/search?q=${encodeURIComponent(finalUrl)}`;
          else finalUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(finalUrl)}`;
        }
      }

      const curTab = getActiveTab();
      curTab.url = finalUrl;
      curTab.title = title || (finalUrl === 'about:home' ? 'Início' : finalUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]);
      curTab.isLoading = finalUrl !== 'about:home';

      // Truncate forward history and push
      if (curTab.history[curTab.historyIdx] !== finalUrl) {
        curTab.history = curTab.history.slice(0, curTab.historyIdx + 1);
        curTab.history.push(finalUrl);
        curTab.historyIdx = curTab.history.length - 1;
      }

      if (finalUrl !== 'about:home') {
        pushHistory({ title: curTab.title, url: finalUrl });
      }

      playUiSound('move');
      renderBrowserFrame();
    }

    function bindTabStripEvents() {
      appStageBody.querySelectorAll('.browser-tab').forEach((tabEl) => {
        tabEl.addEventListener('click', (e) => {
          if (e.target.closest('.browser-tab-close')) return;
          const tid = Number(tabEl.dataset.tabId);
          if (tid !== activeTabId) {
            activeTabId = tid;
            playUiSound('select');
            renderBrowserFrame();
          }
        });
      });

      appStageBody.querySelectorAll('[data-close-tab]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tid = Number(btn.dataset.closeTab);
          tabs = tabs.filter((t) => t.id !== tid);
          if (tabs.length === 0) {
            tabs = [{ id: nextTabId++, title: 'Início', url: 'about:home', history: ['about:home'], historyIdx: 0, isLoading: false }];
          }
          if (activeTabId === tid) activeTabId = tabs[0].id;
          playUiSound('back');
          renderBrowserFrame();
        });
      });
    }

    function bindStaticToolbarEvents() {
      appStageBody.querySelector('#browser-new-tab-btn')?.addEventListener('click', () => {
        const newTab = { id: nextTabId++, title: 'Nova Guia', url: 'about:home', history: ['about:home'], historyIdx: 0, isLoading: false };
        tabs.push(newTab);
        activeTabId = newTab.id;
        playUiSound('open');
        renderBrowserFrame();
      });

      appStageBody.querySelector('#br-btn-back')?.addEventListener('click', () => {
        const curTab = getActiveTab();
        if (curTab.historyIdx > 0) {
          curTab.historyIdx--;
          curTab.url = curTab.history[curTab.historyIdx];
          curTab.title = curTab.url === 'about:home' ? 'Início' : curTab.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
          playUiSound('back');
          renderBrowserFrame();
        }
      });

      appStageBody.querySelector('#br-btn-forward')?.addEventListener('click', () => {
        const curTab = getActiveTab();
        if (curTab.historyIdx < curTab.history.length - 1) {
          curTab.historyIdx++;
          curTab.url = curTab.history[curTab.historyIdx];
          curTab.title = curTab.url === 'about:home' ? 'Início' : curTab.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
          playUiSound('move');
          renderBrowserFrame();
        }
      });

      appStageBody.querySelector('#br-btn-reload')?.addEventListener('click', () => {
        const curTab = getActiveTab();
        playUiSound('select');
        const entry = tabIframeMap.get(curTab.id);
        if (entry && curTab.url && curTab.url !== 'about:home') {
          const bar = document.getElementById('browser-loading-bar');
          bar?.classList.add('loading');
          curTab.isLoading = true;
          entry.iframeEl.src = toProxyUrl(curTab.url, true);
        } else {
          renderBrowserFrame();
        }
      });

      appStageBody.querySelector('#br-btn-home')?.addEventListener('click', () => {
        navigateTab('about:home');
      });

      appStageBody.querySelector('#browser-omnibox-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = (document.getElementById('browser-omnibox-input')?.value || '').trim();
        if (raw) navigateTab(raw);
      });

      appStageBody.querySelector('#br-btn-fav')?.addEventListener('click', () => {
        const curTab = getActiveTab();
        const u = curTab.url;
        if (!u || u === 'about:home') return;
        const bms = getBookmarks();
        if (bms.some((b) => b.url === u)) {
          saveBookmarks(bms.filter((b) => b.url !== u));
          playUiSound('back');
          alert('Site removido dos seus favoritos.');
        } else {
          bms.push({ name: curTab.title, url: u });
          saveBookmarks(bms);
          playUiSound('select');
          alert(`"${curTab.title}" foi adicionado aos seus favoritos!`);
        }
      });

      appStageBody.querySelector('#br-zoom-out')?.addEventListener('click', () => {
        zoomLevel = Math.max(0.65, +(zoomLevel - 0.1).toFixed(2));
        playUiSound('move');
        applyZoomToAllFrames();
      });
      appStageBody.querySelector('#br-zoom-in')?.addEventListener('click', () => {
        zoomLevel = Math.min(1.5, +(zoomLevel + 0.1).toFixed(2));
        playUiSound('move');
        applyZoomToAllFrames();
      });

      appStageBody.querySelector('#br-btn-popout')?.addEventListener('click', () => {
        const curTab = getActiveTab();
        if (curTab.url && curTab.url !== 'about:home') {
          playUiSound('open');
          openWebUrl(curTab.url, curTab.title);
        }
      });
    }

    function bindStartPageEvents() {
      appStageBody.querySelector('#startpage-search-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const eng = document.getElementById('startpage-engine-select')?.value || 'duckduckgo';
        searchEngine = eng;
        const q = (document.getElementById('startpage-search-input')?.value || '').trim();
        if (q) navigateTab(q);
      });

      appStageBody.querySelectorAll('[data-nav-url]').forEach((btn) => {
        btn.addEventListener('mouseenter', () => prefetchUrl(btn.dataset.navUrl));
        btn.addEventListener('focus', () => prefetchUrl(btn.dataset.navUrl));
        btn.addEventListener('click', (e) => {
          if (e.target.closest('.bm-tile-del')) return;
          const url = btn.dataset.navUrl;
          const name = btn.dataset.navName;
          if (url) navigateTab(url, name);
        });
      });

      appStageBody.querySelectorAll('[data-del-bm]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number(btn.dataset.delBm);
          const bms = getBookmarks();
          bms.splice(idx, 1);
          saveBookmarks(bms);
          playUiSound('back');
          renderBrowserFrame();
        });
      });

      appStageBody.querySelector('#browser-add-bookmark-btn')?.addEventListener('click', () => {
        const u = prompt('Digite a URL do site (ex: https://notion.so):');
        if (!u) return;
        const n = prompt('Nome do favorito (opcional):') || u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        const bms = getBookmarks();
        bms.push({ name: n, url: /^https?:\/\//i.test(u) ? u : `https://${u}` });
        saveBookmarks(bms);
        playUiSound('select');
        renderBrowserFrame();
      });

      appStageBody.querySelector('#browser-clear-history-btn')?.addEventListener('click', () => {
        try { localStorage.removeItem('iris_browser_history_v1'); } catch (_) {}
        playUiSound('back');
        renderBrowserFrame();
      });
    }

    renderBrowserFrame();
    appStageOverlay.classList.remove('hidden');
  }

  window.IrisNativeApps = {
    cleanupActiveNative,
    renderWeatherApp,
    renderCalculatorApp,
    renderClockApp,
    renderNotesApp,
    renderBrowserApp
  };
})();


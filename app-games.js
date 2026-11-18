(() => {
  'use strict';

  let activeCleanup = null;

  function cleanup() {
    if (typeof activeCleanup === 'function') {
      try { activeCleanup(); } catch (_) {}
    }
    activeCleanup = null;
  }

  function setupFrame(ctx, subtitle) {
    cleanup();
    if (window.IrisNativeApps) window.IrisNativeApps.cleanupActiveNative();
    const { app, appStageWindow, appStageBrand, appStageOverlay, escHtml } = ctx;
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow || 'rgba(0, 194, 255, 0.5)');
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc}" alt="${escHtml(app.name)}" /></div>
      <div class="app-stage-brand-title">${escHtml(app.name)} <span class="store-brand-sub">${escHtml(subtitle)}</span></div>
    `;
    appStageOverlay.classList.remove('hidden');
  }

  /* =========================================================
     1. Cobrinha (Snake)
     ========================================================= */
  function renderSnake(ctx) {
    setupFrame(ctx, 'Use as setas para mover • Espaço/Enter para reiniciar');
    const { appStageBody, appStageOverlay, playUiSound } = ctx;
    const BEST_KEY = 'iristv_best_snake';
    let best = Number(localStorage.getItem(BEST_KEY) || 0);

    appStageBody.innerHTML = `
      <div class="native-game-shell">
        <div class="game-hud">
          <div class="game-stat"><small>Pontos</small><strong id="snk-score">0</strong></div>
          <div class="game-stat"><small>Recorde</small><strong id="snk-best">${best}</strong></div>
          <button id="snk-restart" class="btn-prism" type="button" style="height:38px;padding:0 18px;">Reiniciar</button>
        </div>
        <div class="game-board-wrap">
          <canvas id="snk-canvas" width="480" height="480"></canvas>
          <div id="snk-over" class="game-over-banner hidden">
            <h3>Fim de jogo!</h3>
            <p>Pressione Enter, Espaço ou clique em Reiniciar</p>
          </div>
        </div>
      </div>
    `;

    const canvas = document.getElementById('snk-canvas');
    const g = canvas.getContext('2d');
    const cols = 20;
    const cell = canvas.width / cols;
    let snake = [];
    let dir = { x: 1, y: 0 };
    let nextDir = { x: 1, y: 0 };
    let food = { x: 12, y: 10 };
    let score = 0;
    let dead = false;
    let timer = null;

    const placeFood = () => {
      do {
        food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * cols) };
      } while (snake.some((s) => s.x === food.x && s.y === food.y));
    };

    const draw = () => {
      g.fillStyle = '#090e1a';
      g.fillRect(0, 0, canvas.width, canvas.height);

      g.strokeStyle = 'rgba(255,255,255,0.035)';
      g.lineWidth = 1;
      for (let i = 1; i < cols; i++) {
        g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, canvas.height); g.stroke();
        g.beginPath(); g.moveTo(0, i * cell); g.lineTo(canvas.width, i * cell); g.stroke();
      }

      // Food
      g.fillStyle = '#ff3b5c';
      g.beginPath();
      g.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.36, 0, Math.PI * 2);
      g.fill();

      // Snake
      snake.forEach((seg, idx) => {
        g.fillStyle = idx === 0 ? '#34f59b' : '#00b86b';
        g.beginPath();
        g.roundRect(seg.x * cell + 2, seg.y * cell + 2, cell - 4, cell - 4, 6);
        g.fill();
      });
    };

    const step = () => {
      if (dead) return;
      dir = nextDir;
      const head = { x: (snake[0].x + dir.x + cols) % cols, y: (snake[0].y + dir.y + cols) % cols };
      if (snake.some((s) => s.x === head.x && s.y === head.y)) {
        dead = true;
        playUiSound('back');
        document.getElementById('snk-over')?.classList.remove('hidden');
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        playUiSound('select');
        if (score > best) {
          best = score;
          localStorage.setItem(BEST_KEY, String(best));
          const bEl = document.getElementById('snk-best');
          if (bEl) bEl.textContent = String(best);
        }
        const sEl = document.getElementById('snk-score');
        if (sEl) sEl.textContent = String(score);
        placeFood();
      } else {
        snake.pop();
      }
      draw();
    };

    const reset = () => {
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      score = 0;
      dead = false;
      document.getElementById('snk-score').textContent = '0';
      document.getElementById('snk-over')?.classList.add('hidden');
      placeFood();
      draw();
    };

    const onKey = (e) => {
      if (appStageOverlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') return;
      if ((e.key === 'ArrowUp' || e.key === 'w') && dir.y === 0) { e.preventDefault(); e.stopPropagation(); nextDir = { x: 0, y: -1 }; }
      else if ((e.key === 'ArrowDown' || e.key === 's') && dir.y === 0) { e.preventDefault(); e.stopPropagation(); nextDir = { x: 0, y: 1 }; }
      else if ((e.key === 'ArrowLeft' || e.key === 'a') && dir.x === 0) { e.preventDefault(); e.stopPropagation(); nextDir = { x: -1, y: 0 }; }
      else if ((e.key === 'ArrowRight' || e.key === 'd') && dir.x === 0) { e.preventDefault(); e.stopPropagation(); nextDir = { x: 1, y: 0 }; }
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      else if (dead && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); reset(); }
    };

    document.getElementById('snk-restart')?.addEventListener('click', () => { playUiSound('select'); reset(); });
    window.addEventListener('keydown', onKey, true);
    reset();
    timer = setInterval(step, 115);

    activeCleanup = () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
    };
  }

  /* =========================================================
     2. 2048
     ========================================================= */
  function render2048(ctx) {
    setupFrame(ctx, 'Use as setas para deslizar e somar blocos');
    const { appStageBody, appStageOverlay, playUiSound } = ctx;
    const BEST_KEY = 'iristv_best_2048';
    let best = Number(localStorage.getItem(BEST_KEY) || 0);
    let score = 0;
    let nextId = 1;
    let tiles = [];
    let moveQueue = [];
    let isAnimating = false;
    let cleanupTimers = [];

    appStageBody.innerHTML = `
      <div class="native-game-shell">
        <div class="game-hud">
          <div class="game-stat"><small>Pontos</small><strong id="g2-score">0</strong></div>
          <div class="game-stat"><small>Recorde</small><strong id="g2-best">${best}</strong></div>
          <button id="g2-restart" class="btn-prism" type="button" style="height:38px;padding:0 18px;">Novo Jogo</button>
        </div>
        <div class="g2048-board">
          <div class="g2048-grid">
            ${Array.from({ length: 16 }, () => '<div class="g2048-cell g2048-slot"></div>').join('')}
          </div>
          <div id="g2-tiles" class="g2048-tiles-layer"></div>
          <div id="g2-over" class="game-over-banner hidden">
            <h3>Sem movimentos!</h3>
            <p id="g2-over-text">Pontuação: 0</p>
            <button id="g2-over-btn" class="btn-prism" type="button" style="height:38px;padding:0 20px;margin-top:8px;">Jogar Novamente</button>
          </div>
        </div>
      </div>
    `;

    const tileColors = {
      2: ['#eee4da', '#1f232c'],
      4: ['#ede0c8', '#1f232c'],
      8: ['#f2b179', '#ffffff'],
      16: ['#f59563', '#ffffff'],
      32: ['#f67c5f', '#ffffff'],
      64: ['#f65e3b', '#ffffff'],
      128: ['#edcf72', '#ffffff'],
      256: ['#edcc61', '#ffffff'],
      512: ['#edc850', '#ffffff'],
      1024: ['#edc53f', '#ffffff'],
      2048: ['#edc22e', '#ffffff']
    };

    const STEP_PX = 108; // 96px tile + 12px gap

    const createTileEl = (t, extraClass = '') => {
      const [bg, fg] = tileColors[t.val] || ['#00c2ff', '#ffffff'];
      const el = document.createElement('div');
      el.className = `g2048-tile${t.val >= 1024 ? ' is-big' : ''}`;
      el.dataset.id = String(t.id);
      el.style.transform = `translate3d(${t.c * STEP_PX}px, ${t.r * STEP_PX}px, 0)`;
      if (extraClass === 'is-merged') el.style.zIndex = '4';
      const inner = document.createElement('div');
      inner.className = `g2048-tile-inner${extraClass ? ` ${extraClass}` : ''}`;
      inner.style.background = bg;
      inner.style.color = fg;
      inner.textContent = String(t.val);
      el.appendChild(inner);
      return el;
    };

    const syncHud = () => {
      const sEl = document.getElementById('g2-score');
      const bEl = document.getElementById('g2-best');
      if (sEl) sEl.textContent = String(score);
      if (bEl) bEl.textContent = String(best);
    };

    const renderTiles = (ghostMerges = []) => {
      const layer = document.getElementById('g2-tiles');
      if (!layer) return;

      const existing = new Map();
      layer.querySelectorAll('.g2048-tile[data-id]').forEach((el) => {
        existing.set(el.dataset.id, el);
      });

      const activeIds = new Set();

      // Slide dying source tiles smoothly to their merge destination
      ghostMerges.forEach((g) => {
        activeIds.add(String(g.id));
        const el = existing.get(String(g.id));
        if (el) {
          el.style.zIndex = '2';
          el.style.transform = `translate3d(${g.toC * STEP_PX}px, ${g.toR * STEP_PX}px, 0)`;
          const tid = setTimeout(() => {
            if (el.parentNode) el.remove();
          }, 145);
          cleanupTimers.push(tid);
        }
      });

      // Slide surviving tiles & spawn new/merged tiles
      tiles.forEach((t) => {
        activeIds.add(String(t.id));
        let el = existing.get(String(t.id));
        if (el) {
          el.style.zIndex = '3';
          el.style.transform = `translate3d(${t.c * STEP_PX}px, ${t.r * STEP_PX}px, 0)`;
        } else {
          const cls = t.isMerged ? 'is-merged' : (t.isNew ? 'is-new' : '');
          el = createTileEl(t, cls);
          layer.appendChild(el);
        }
        t.isNew = false;
        t.isMerged = false;
      });

      // Remove stale elements not in activeIds
      existing.forEach((el, id) => {
        if (!activeIds.has(id)) el.remove();
      });

      syncHud();
    };

    const getBoard = () => {
      const grid = Array.from({ length: 4 }, () => [null, null, null, null]);
      tiles.forEach((t) => { grid[t.r][t.c] = t; });
      return grid;
    };

    const canMove = () => {
      const g = getBoard();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (!g[r][c]) return true;
          const v = g[r][c].val;
          if (r < 3 && g[r + 1][c]?.val === v) return true;
          if (c < 3 && g[r][c + 1]?.val === v) return true;
        }
      }
      return false;
    };

    const spawn = () => {
      const g = getBoard();
      const empty = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!g[r][c]) empty.push([r, c]);
      if (!empty.length) return null;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      const tile = { id: nextId++, val: Math.random() < 0.9 ? 2 : 4, r, c, isNew: true, isMerged: false };
      tiles.push(tile);
      return tile;
    };

    const move = (dir) => {
      const vectors = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
      const vec = vectors[dir];
      if (!vec) return;

      const rows = dir === 'down' ? [3, 2, 1, 0] : [0, 1, 2, 3];
      const cols = dir === 'right' ? [3, 2, 1, 0] : [0, 1, 2, 3];
      const grid = getBoard();
      const mergedAt = Array.from({ length: 4 }, () => [false, false, false, false]);
      const ghostMerges = [];
      const consumedIds = new Set();
      let moved = false;

      for (const r of rows) {
        for (const c of cols) {
          const tile = grid[r][c];
          if (!tile) continue;

          let nr = r;
          let nc = c;
          while (true) {
            const tr = nr + vec[0];
            const tc = nc + vec[1];
            if (tr < 0 || tr >= 4 || tc < 0 || tc >= 4 || grid[tr][tc]) break;
            nr = tr;
            nc = tc;
          }

          const mr = nr + vec[0];
          const mc = nc + vec[1];
          const target = (mr >= 0 && mr < 4 && mc >= 0 && mc < 4) ? grid[mr][mc] : null;

          if (target && target.val === tile.val && !mergedAt[mr][mc]) {
            mergedAt[mr][mc] = true;
            grid[r][c] = null;
            consumedIds.add(tile.id);
            consumedIds.add(target.id);
            ghostMerges.push({ id: tile.id, toR: mr, toC: mc }, { id: target.id, toR: mr, toC: mc });
            const mergedVal = tile.val * 2;
            const mergedTile = { id: nextId++, val: mergedVal, r: mr, c: mc, isNew: false, isMerged: true };
            grid[mr][mc] = mergedTile;
            tiles.push(mergedTile);
            score += mergedVal;
            moved = true;
          } else if (nr !== r || nc !== c) {
            grid[r][c] = null;
            grid[nr][nc] = tile;
            tile.r = nr;
            tile.c = nc;
            moved = true;
          }
        }
      }

      if (!moved) return;
      tiles = tiles.filter((t) => !consumedIds.has(t.id));
      if (score > best) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
      spawn();
      renderTiles(ghostMerges);
      playUiSound('move');

      if (!canMove()) {
        const overEl = document.getElementById('g2-over');
        const txtEl = document.getElementById('g2-over-text');
        if (txtEl) txtEl.textContent = `Pontuação final: ${score}`;
        if (overEl) overEl.classList.remove('hidden');
        playUiSound('back');
      }
    };

    const reset = () => {
      cleanupTimers.forEach(clearTimeout);
      cleanupTimers = [];
      const layer = document.getElementById('g2-tiles');
      if (layer) layer.innerHTML = '';
      document.getElementById('g2-over')?.classList.add('hidden');
      tiles = [];
      score = 0;
      moveQueue = [];
      isAnimating = false;
      spawn();
      spawn();
      renderTiles();
    };

    const pumpQueue = () => {
      if (isAnimating || !moveQueue.length) return;
      isAnimating = true;
      const dir = moveQueue.shift();
      move(dir);
      const tid = setTimeout(() => {
        isAnimating = false;
        pumpQueue();
      }, 95);
      cleanupTimers.push(tid);
    };

    const enqueueMove = (dir) => {
      if (moveQueue.length < 2) moveQueue.push(dir);
      pumpQueue();
    };

    const onKey = (e) => {
      if (appStageOverlay.classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); enqueueMove('left'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); enqueueMove('right'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); enqueueMove('up'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); enqueueMove('down'); }
    };

    document.getElementById('g2-restart')?.addEventListener('click', () => { playUiSound('select'); reset(); });
    document.getElementById('g2-over-btn')?.addEventListener('click', () => { playUiSound('select'); reset(); });
    window.addEventListener('keydown', onKey, true);
    reset();

    activeCleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      cleanupTimers.forEach(clearTimeout);
      cleanupTimers = [];
    };
  }

  /* =========================================================
     3. Blocos (Tetris)
     ========================================================= */
  function renderTetris(ctx) {
    setupFrame(ctx, '←/→ mover • ↑ girar • ↓ acelerar • Espaço descer tudo');
    const { appStageBody, appStageOverlay, playUiSound } = ctx;
    const BEST_KEY = 'iristv_best_tetris';
    let best = Number(localStorage.getItem(BEST_KEY) || 0);

    appStageBody.innerHTML = `
      <div class="native-game-shell">
        <div class="game-hud">
          <div class="game-stat"><small>Pontos</small><strong id="tet-score">0</strong></div>
          <div class="game-stat"><small>Linhas</small><strong id="tet-lines">0</strong></div>
          <div class="game-stat"><small>Recorde</small><strong id="tet-best">${best}</strong></div>
          <button id="tet-restart" class="btn-prism" type="button" style="height:38px;padding:0 18px;">Reiniciar</button>
        </div>
        <div class="game-board-wrap">
          <canvas id="tet-canvas" width="280" height="520"></canvas>
          <div id="tet-over" class="game-over-banner hidden">
            <h3>Fim de jogo!</h3>
            <p>Pressione Enter ou clique em Reiniciar</p>
          </div>
        </div>
      </div>
    `;

    const canvas = document.getElementById('tet-canvas');
    const g = canvas.getContext('2d');
    const W = 10; const H = 20;
    const SZ = canvas.width / W;
    const SHAPES = [
      [[1, 1, 1, 1]],
      [[1, 1], [1, 1]],
      [[0, 1, 0], [1, 1, 1]],
      [[1, 0, 0], [1, 1, 1]],
      [[0, 0, 1], [1, 1, 1]],
      [[0, 1, 1], [1, 1, 0]],
      [[1, 1, 0], [0, 1, 1]]
    ];
    const COLORS = ['#00d2ff', '#ffd426', '#9b4dff', '#ff9500', '#2f7dff', '#00e589', '#ff2d6f'];

    let grid = [];
    let piece = null;
    let score = 0;
    let lines = 0;
    let dead = false;
    let timer = null;

    const newPiece = () => {
      const idx = Math.floor(Math.random() * SHAPES.length);
      const m = SHAPES[idx].map((r) => [...r]);
      return { m, color: COLORS[idx], x: Math.floor((W - m[0].length) / 2), y: 0 };
    };

    const collides = (px, py, mat) => {
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (!mat[r][c]) continue;
          const gx = px + c; const gy = py + r;
          if (gx < 0 || gx >= W || gy >= H) return true;
          if (gy >= 0 && grid[gy][gx]) return true;
        }
      }
      return false;
    };

    const draw = () => {
      g.fillStyle = '#090d18';
      g.fillRect(0, 0, canvas.width, canvas.height);
      const drawBlock = (gx, gy, col) => {
        g.fillStyle = col;
        g.fillRect(gx * SZ + 1, gy * SZ + 1, SZ - 2, SZ - 2);
      };
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (grid[r][c]) drawBlock(c, r, grid[r][c]);
      if (piece) {
        for (let r = 0; r < piece.m.length; r++) {
          for (let c = 0; c < piece.m[r].length; c++) {
            if (piece.m[r][c]) drawBlock(piece.x + c, piece.y + r, piece.color);
          }
        }
      }
    };

    const lockPiece = () => {
      for (let r = 0; r < piece.m.length; r++) {
        for (let c = 0; c < piece.m[r].length; c++) {
          if (piece.m[r][c] && piece.y + r >= 0) grid[piece.y + r][piece.x + c] = piece.color;
        }
      }
      let cleared = 0;
      for (let r = H - 1; r >= 0; r--) {
        if (grid[r].every(Boolean)) {
          grid.splice(r, 1);
          grid.unshift(Array(W).fill(null));
          cleared++;
          r++;
        }
      }
      if (cleared) {
        lines += cleared;
        score += cleared * cleared * 100;
        playUiSound('select');
        if (score > best) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
        document.getElementById('tet-score').textContent = String(score);
        document.getElementById('tet-lines').textContent = String(lines);
        document.getElementById('tet-best').textContent = String(best);
      }
      piece = newPiece();
      if (collides(piece.x, piece.y, piece.m)) {
        dead = true;
        playUiSound('back');
        document.getElementById('tet-over')?.classList.remove('hidden');
      }
    };

    const tick = () => {
      if (dead) return;
      if (!collides(piece.x, piece.y + 1, piece.m)) piece.y++;
      else lockPiece();
      draw();
    };

    const rotate = () => {
      const m = piece.m;
      const rot = m[0].map((_, c) => m.map((r) => r[c]).reverse());
      if (!collides(piece.x, piece.y, rot)) piece.m = rot;
    };

    const reset = () => {
      grid = Array.from({ length: H }, () => Array(W).fill(null));
      score = 0; lines = 0; dead = false;
      piece = newPiece();
      document.getElementById('tet-score').textContent = '0';
      document.getElementById('tet-lines').textContent = '0';
      document.getElementById('tet-over')?.classList.add('hidden');
      draw();
    };

    const onKey = (e) => {
      if (appStageOverlay.classList.contains('hidden') || e.key === 'Escape') return;
      if (dead && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); reset(); return; }
      if (dead) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (!collides(piece.x - 1, piece.y, piece.m)) piece.x--; draw(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (!collides(piece.x + 1, piece.y, piece.m)) piece.x++; draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); rotate(); draw(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); tick(); }
      else if (e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        while (!collides(piece.x, piece.y + 1, piece.m)) piece.y++;
        lockPiece(); draw();
      }
    };

    document.getElementById('tet-restart')?.addEventListener('click', () => { playUiSound('select'); reset(); });
    window.addEventListener('keydown', onKey, true);
    reset();
    timer = setInterval(tick, 420);

    activeCleanup = () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
    };
  }

  /* =========================================================
     4. Raquete (Pong)
     ========================================================= */
  function renderPong(ctx) {
    setupFrame(ctx, 'Setas ↑ / ↓ movem sua raquete • Primeiro a 7 vence');
    const { appStageBody, appStageOverlay, playUiSound } = ctx;

    appStageBody.innerHTML = `
      <div class="native-game-shell">
        <div class="game-hud">
          <div class="game-stat"><small>Você</small><strong id="png-p1">0</strong></div>
          <div class="game-stat"><small>Computador</small><strong id="png-p2">0</strong></div>
          <button id="png-restart" class="btn-prism" type="button" style="height:38px;padding:0 18px;">Reiniciar</button>
        </div>
        <div class="game-board-wrap">
          <canvas id="png-canvas" width="680" height="420"></canvas>
          <div id="png-over" class="game-over-banner hidden">
            <h3 id="png-win-txt">Fim de jogo!</h3>
            <p>Pressione Enter ou clique em Reiniciar</p>
          </div>
        </div>
      </div>
    `;

    const canvas = document.getElementById('png-canvas');
    const g = canvas.getContext('2d');
    const W = canvas.width; const H = canvas.height;
    let p1y = H / 2 - 45;
    let p2y = H / 2 - 45;
    let bx = W / 2; let by = H / 2;
    let vx = 4.6; let vy = 3.2;
    let s1 = 0; let s2 = 0;
    let over = false;
    let raf = 0;
    const keys = { up: false, down: false };

    const resetBall = (dirX) => {
      bx = W / 2; by = H / 2;
      vx = dirX * 4.8;
      vy = (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random() * 1.8);
    };

    const resetGame = () => {
      s1 = 0; s2 = 0; over = false;
      p1y = H / 2 - 45; p2y = H / 2 - 45;
      document.getElementById('png-p1').textContent = '0';
      document.getElementById('png-p2').textContent = '0';
      document.getElementById('png-over')?.classList.add('hidden');
      resetBall(1);
    };

    const loop = () => {
      if (!over) {
        if (keys.up) p1y = Math.max(8, p1y - 6.5);
        if (keys.down) p1y = Math.min(H - 98, p1y + 6.5);
        const aiTarget = by - 45;
        p2y += Math.sign(aiTarget - p2y) * Math.min(4.8, Math.abs(aiTarget - p2y));
        p2y = Math.max(8, Math.min(H - 98, p2y));

        bx += vx; by += vy;
        if (by < 10 || by > H - 10) vy *= -1;
        if (bx < 34 && bx > 14 && by > p1y && by < p1y + 90) {
          vx = Math.abs(vx) * 1.05;
          vy += ((by - (p1y + 45)) / 45) * 2;
          playUiSound('move');
        } else if (bx > W - 34 && bx < W - 14 && by > p2y && by < p2y + 90) {
          vx = -Math.abs(vx) * 1.05;
          vy += ((by - (p2y + 45)) / 45) * 2;
          playUiSound('move');
        }
        if (bx < 0) {
          s2++; document.getElementById('png-p2').textContent = String(s2);
          if (s2 >= 7) { over = true; document.getElementById('png-win-txt').textContent = 'Computador venceu!'; document.getElementById('png-over').classList.remove('hidden'); }
          else resetBall(1);
        } else if (bx > W) {
          s1++; document.getElementById('png-p1').textContent = String(s1);
          playUiSound('select');
          if (s1 >= 7) { over = true; document.getElementById('png-win-txt').textContent = 'Você venceu!'; document.getElementById('png-over').classList.remove('hidden'); }
          else resetBall(-1);
        }
      }

      g.fillStyle = '#090d18';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.setLineDash([8, 8]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#00e5ff'; g.fillRect(16, p1y, 14, 90);
      g.fillStyle = '#ff2d6f'; g.fillRect(W - 30, p2y, 14, 90);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fill();
      raf = requestAnimationFrame(loop);
    };

    const onKeyDown = (e) => {
      if (appStageOverlay.classList.contains('hidden') || e.key === 'Escape') return;
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); e.stopPropagation(); keys.up = true; }
      if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); e.stopPropagation(); keys.down = true; }
      if (over && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); resetGame(); }
    };
    const onKeyUp = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
      if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
    };

    document.getElementById('png-restart')?.addEventListener('click', () => { playUiSound('select'); resetGame(); });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    resetGame();
    raf = requestAnimationFrame(loop);

    activeCleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }

  /* =========================================================
     5. Memória (4x4 Pairs)
     ========================================================= */
  function renderMemory(ctx) {
    setupFrame(ctx, 'Encontre todos os pares com setas + Enter ou cliques');
    const { appStageBody, playUiSound } = ctx;
    const SYMBOLS = ['★', '☀', '☾', '♪', '♦', '♣', '✿', '⚡'];
    const BEST_KEY = 'iristv_best_memory';
    let best = Number(localStorage.getItem(BEST_KEY) || 0);
    let deck = [];
    let openIdxs = [];
    let matched = new Set();
    let moves = 0;
    let locked = false;

    const renderBoard = () => {
      appStageBody.innerHTML = `
        <div class="native-game-shell">
          <div class="game-hud">
            <div class="game-stat"><small>Jogadas</small><strong id="mem-moves">${moves}</strong></div>
            <div class="game-stat"><small>Pares</small><strong>${matched.size / 2}/8</strong></div>
            <div class="game-stat"><small>Melhor</small><strong>${best ? `${best} jog.` : '--'}</strong></div>
            <button id="mem-restart" class="btn-prism" type="button" style="height:38px;padding:0 18px;">Embaralhar</button>
          </div>
          <div class="mem-grid">
            ${deck.map((sym, idx) => {
              const up = openIdxs.includes(idx) || matched.has(idx);
              return `<button class="mem-card ${up ? 'is-up' : ''} ${matched.has(idx) ? 'is-matched' : ''}" type="button" data-mem-idx="${idx}">${up ? sym : '?'}</button>`;
            }).join('')}
          </div>
        </div>
      `;

      appStageBody.querySelector('#mem-restart')?.addEventListener('click', () => { playUiSound('select'); reset(); });
      appStageBody.querySelectorAll('[data-mem-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = Number(btn.dataset.memIdx);
          if (locked || openIdxs.includes(i) || matched.has(i)) return;
          playUiSound('move');
          openIdxs.push(i);
          if (openIdxs.length === 2) {
            moves += 1;
            const [a, b] = openIdxs;
            if (deck[a] === deck[b]) {
              matched.add(a);
              matched.add(b);
              openIdxs = [];
              playUiSound('chime');
              if (matched.size === 16 && (!best || moves < best)) {
                best = moves;
                localStorage.setItem(BEST_KEY, String(best));
              }
              renderBoard();
            } else {
              locked = true;
              renderBoard();
              setTimeout(() => {
                openIdxs = [];
                locked = false;
                renderBoard();
              }, 520);
            }
          } else {
            renderBoard();
          }
        });
      });
    };

    const reset = () => {
      deck = [...SYMBOLS, ...SYMBOLS].sort(() => Math.random() - 0.5);
      openIdxs = [];
      matched = new Set();
      moves = 0;
      locked = false;
      renderBoard();
    };

    reset();
    activeCleanup = () => {};
  }

  window.IrisNativeGames = {
    cleanup,
    renderSnake,
    render2048,
    renderTetris,
    renderPong,
    renderMemory
  };
})();


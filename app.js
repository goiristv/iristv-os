(() => {
  'use strict';

  /* =========================================================
     Adaptive Frame Rate Controller & RAM Tier Governor
     ========================================================= */
  (function initPerformanceGovernor() {
    function applyTier(fps) {
      document.documentElement.classList.remove('tier-30fps', 'tier-45fps', 'tier-60fps');
      if (fps === 45) {
        document.documentElement.classList.add('tier-45fps');
        const frameInterval = 1000 / 45; // 22.22 ms
        let lastFrameTime = performance.now();
        const nativeRaf = window.requestAnimationFrame.bind(window);

        window.requestAnimationFrame = function(callback) {
          return nativeRaf(function(currentTime) {
            const delta = currentTime - lastFrameTime;
            if (delta >= frameInterval - 1.5) {
              lastFrameTime = currentTime - (delta % frameInterval);
              callback(currentTime);
            } else {
              window.requestAnimationFrame(callback);
            }
          });
        };
      } else if (fps === 30) {
        document.documentElement.classList.add('tier-30fps');
      } else {
        document.documentElement.classList.add('tier-60fps');
      }
    }

    const injectedFps = window.IRIS_TARGET_FPS;
    if (injectedFps) {
      applyTier(Number(injectedFps));
    } else {
      fetch('/api/os/status')
        .then(res => res.json())
        .then(data => {
          if (data && data.targetFps) {
            window.IRIS_TARGET_FPS = data.targetFps;
            applyTier(data.targetFps);
          } else {
            applyTier(60);
          }
        })
        .catch(() => applyTier(60));
    }

    // Dynamic will-change lifecycle manager: previne alocação de texturas permanentes na VRAM/RAM
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (el && el.nodeType === 1) {
        el.classList.add('is-animating');
        const onDone = () => {
          el.classList.remove('is-animating');
          el.removeEventListener('transitionend', onDone);
        };
        el.addEventListener('transitionend', onDone, { once: true });
        setTimeout(onDone, 350);
      }
    }, true);
  })();

  /* =========================================================
     High-Performance Dedicated GPU Governor & Hardware Interceptor
     ========================================================= */
  const IrisGpuManager = (function() {
    let activeGpuInfo = {
      name: 'Detectando GPU...',
      renderer: '',
      vendor: '',
      isDedicated: true,
      isWebGl2: false,
      hardwareAccelerated: true,
      systemGpus: []
    };
    let keepAliveCanvas = null;
    let keepAliveGl = null;

    // Intercept canvas getContext to enforce powerPreference: 'high-performance' (dedicated GPU)
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        let pref = 'dedicated';
        try {
          if (typeof state !== 'undefined' && state?.settings?.gpuPreference) {
            pref = state.settings.gpuPreference;
          } else {
            const raw = JSON.parse(localStorage.getItem('iristv-settings-v1') || '{}');
            pref = raw.gpuPreference || 'dedicated';
          }
        } catch (_) {}
        const powerPreference = pref === 'integrated' ? 'low-power' : 'high-performance';
        attributes = Object.assign({
          powerPreference,
          desynchronized: true
        }, attributes || {});
        attributes.powerPreference = powerPreference;
      }
      return origGetContext.call(this, type, attributes);
    };

    // Intercept WebGPU requestAdapter if available
    if (typeof navigator !== 'undefined' && navigator.gpu && typeof navigator.gpu.requestAdapter === 'function') {
      const origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
      navigator.gpu.requestAdapter = function(options) {
        let pref = 'dedicated';
        try {
          if (typeof state !== 'undefined' && state?.settings?.gpuPreference) {
            pref = state.settings.gpuPreference;
          } else {
            const raw = JSON.parse(localStorage.getItem('iristv-settings-v1') || '{}');
            pref = raw.gpuPreference || 'dedicated';
          }
        } catch (_) {}
        const powerPreference = pref === 'integrated' ? 'low-power' : 'high-performance';
        return origRequestAdapter(Object.assign({ powerPreference }, options || {}));
      };
    }

    function applyPreference(pref = 'dedicated') {
      try {
        if (keepAliveGl) {
          try {
            const ext = keepAliveGl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          } catch (_) {}
          keepAliveGl = null;
        }
        if (keepAliveCanvas && keepAliveCanvas.parentNode) {
          keepAliveCanvas.parentNode.removeChild(keepAliveCanvas);
          keepAliveCanvas = null;
        }

        keepAliveCanvas = document.createElement('canvas');
        keepAliveCanvas.width = 2;
        keepAliveCanvas.height = 2;
        keepAliveCanvas.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;opacity:0.0001;pointer-events:none;z-index:-9999;';
        document.documentElement.appendChild(keepAliveCanvas);

        const powerPreference = pref === 'integrated' ? 'low-power' : 'high-performance';
        const gl = keepAliveCanvas.getContext('webgl2', {
          powerPreference,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false
        }) || keepAliveCanvas.getContext('webgl', {
          powerPreference,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false
        });

        if (gl) {
          keepAliveGl = gl;
          let renderer = '';
          let vendor = '';
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
            vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '';
          }
          if (!renderer) {
            renderer = gl.getParameter(gl.RENDERER) || 'WebGL Renderer';
          }
          const isDedicated = /radeon|amd|geforce|nvidia|rtx|gtx|discrete/i.test(renderer)
            || (/apple/i.test(renderer) && !/simulator/i.test(renderer));

          activeGpuInfo.renderer = renderer;
          activeGpuInfo.vendor = vendor || (/intel/i.test(renderer) ? 'Intel' : (/amd|radeon/i.test(renderer) ? 'AMD' : (/nvidia/i.test(renderer) ? 'NVIDIA' : 'Apple')));
          activeGpuInfo.name = renderer.replace(/^ANGLE\s*\([^,]+,\s*/i, '').replace(/,\s*[^\)]+\)$/i, '').trim() || renderer;
          activeGpuInfo.isDedicated = isDedicated;
          activeGpuInfo.isWebGl2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
          activeGpuInfo.hardwareAccelerated = !/llvmpipe|software|swiftshader/i.test(renderer);
        }

        // Bridge to native macOS WKWebView
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.irisWebView) {
          try {
            window.webkit.messageHandlers.irisWebView.postMessage({
              action: 'setGpuPreference',
              preference: pref
            });
          } catch (_) {}
        }

        // Inform backend server
        fetch('/api/os/gpu-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preference: pref })
        }).catch(() => {});
      } catch (err) {
        console.warn('[IrisGpuManager] Erro ao aplicar preferência de GPU:', err);
      }
    }

    let initPref = 'dedicated';
    try {
      const raw = JSON.parse(localStorage.getItem('iristv-settings-v1') || '{}');
      if (raw.gpuPreference) initPref = raw.gpuPreference;
    } catch (_) {}
    applyPreference(initPref);

    return {
      getGpuInfo: () => activeGpuInfo,
      setSystemGpus: (gpus) => { if (Array.isArray(gpus)) activeGpuInfo.systemGpus = gpus; },
      applyPreference
    };
  })();

  /* =========================================================
     OS State & Theme Configuration
     ========================================================= */
  const THEMES = {
    prism: {
      label: 'Padrão',
      orbs: ['rgba(56, 108, 210, 0.55)', 'rgba(95, 130, 95, 0.48)', 'rgba(90, 75, 185, 0.4)']
    },
    light: {
      label: 'Claro',
      orbs: ['rgba(120, 175, 255, 0.42)', 'rgba(255, 165, 210, 0.36)', 'rgba(130, 235, 200, 0.35)']
    },
    oled: {
      label: 'Preto Puro',
      orbs: ['rgba(60, 80, 140, 0.25)', 'rgba(0, 120, 180, 0.2)', 'rgba(90, 40, 130, 0.2)']
    },
    aurora: {
      label: 'Verde Escuro',
      orbs: ['rgba(0, 229, 137, 0.52)', 'rgba(0, 194, 255, 0.48)', 'rgba(124, 77, 255, 0.38)']
    }
  };

  const ACCENT_COLORS = {
    cyan: { label: 'Ciano', hex: '#00c2ff', glow: 'rgba(0, 194, 255, 0.38)' },
    blue: { label: 'Azul', hex: '#2f7dff', glow: 'rgba(47, 125, 255, 0.4)' },
    purple: { label: 'Roxo', hex: '#9b4dff', glow: 'rgba(155, 77, 255, 0.4)' },
    pink: { label: 'Rosa', hex: '#ff2d6f', glow: 'rgba(255, 45, 111, 0.4)' },
    green: { label: 'Verde', hex: '#00e589', glow: 'rgba(0, 229, 137, 0.38)' },
    orange: { label: 'Laranja', hex: '#ff9500', glow: 'rgba(255, 149, 0, 0.38)' },
    white: { label: 'Branco', hex: '#ffffff', glow: 'rgba(255, 255, 255, 0.32)' }
  };

  const FONT_STYLES = {
    modern: { label: 'Moderna', stack: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif' },
    system: { label: 'Sistema', stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' },
    classic: { label: 'Arredondada', stack: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif' }
  };

  const DEFAULT_4K_WALLPAPERS = [
    {
      id: "patagonia-fitzroy",
      file: "patagonia-fitzroy-sunset.jpg",
      title: "Monte Fitz Roy ao Entardecer",
      location: "Patagônia, Argentina",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/patagonia-fitzroy-sunset.jpg",
      accent: "#ff7a45",
      glow: "rgba(255, 122, 69, 0.42)"
    },
    {
      id: "nordic-aurora",
      file: "nordic-aurora-borealis.jpg",
      title: "Aurora Boreal sobre os Fjords",
      location: "Tromsø, Noruega",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/nordic-aurora-borealis.jpg",
      accent: "#00e5a3",
      glow: "rgba(0, 229, 163, 0.42)"
    },
    {
      id: "dolomites-alpine",
      file: "dolomites-alpine-lake.jpg",
      title: "Picos Alpinos e Lago Esmeralda",
      location: "Dolomitas, Itália",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/dolomites-alpine-lake.jpg",
      accent: "#14b8a6",
      glow: "rgba(20, 184, 166, 0.42)"
    },
    {
      id: "cyberpunk-tokyo",
      file: "cyberpunk-tokyo-rain.jpg",
      title: "Tóquio Neon na Chuva",
      location: "Shibuya, Tóquio, Japão",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/cyberpunk-tokyo-rain.jpg",
      accent: "#ff2d87",
      glow: "rgba(255, 45, 135, 0.45)"
    },
    {
      id: "space-nebula",
      file: "deep-space-nebula-carina.jpg",
      title: "Nebulosa Cósmica e Campo Estelar",
      location: "Espaço Profundo",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/deep-space-nebula-carina.jpg",
      accent: "#a855f7",
      glow: "rgba(168, 85, 247, 0.45)"
    },
    {
      id: "fuji-spring",
      file: "fuji-sakura-spring.jpg",
      title: "Monte Fuji com Flores de Cerejeira",
      location: "Honshu, Japão",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/fuji-sakura-spring.jpg",
      accent: "#f472b6",
      glow: "rgba(244, 114, 182, 0.42)"
    },
    {
      id: "maldives-ocean",
      file: "maldives-aerial-atoll.jpg",
      title: "Águas Cristalinas e Barreira de Coral",
      location: "Ilhas Maldivas",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/maldives-aerial-atoll.jpg",
      accent: "#00c2ff",
      glow: "rgba(0, 194, 255, 0.42)"
    },
    {
      id: "iceland-landscape",
      file: "iceland-black-sand-beach.jpg",
      title: "Cânions Glaciais e Névoa Nórdica",
      location: "Costa Sul, Islândia",
      resolution: "3840x2160 • 4K Ultra HD",
      path: "/media/wallpapers/iceland-black-sand-beach.jpg",
      accent: "#67e8f9",
      glow: "rgba(103, 232, 249, 0.4)"
    },
    {
      id: "yosemite-twilight",
      file: "yosemite-twilight.jpg",
      title: "Vale Alpino ao Crepúsculo",
      location: "Serra Nevada, Califórnia",
      resolution: "4K Ultra HD",
      path: "/media/wallpapers/yosemite-twilight.jpg",
      accent: "#60a5fa",
      glow: "rgba(96, 165, 250, 0.35)"
    },
    {
      id: "yosemite-sunlit-valley",
      file: "yosemite-sunlit-valley.jpg",
      title: "Vale do Yosemite Ensolarado",
      location: "Serra Nevada, Califórnia",
      resolution: "HD Wallpaper",
      path: "/media/wallpapers/yosemite-sunlit-valley.jpg",
      accent: "#4ade80",
      glow: "rgba(74, 222, 128, 0.35)"
    },
    {
      id: "alpine-glacier-river",
      file: "alpine-glacier-river.jpg",
      title: "Rio Glacial e Picos Nevados",
      location: "Alpes Suíços",
      resolution: "HD Wallpaper",
      path: "/media/wallpapers/alpine-glacier-river.jpg",
      accent: "#38bdf8",
      glow: "rgba(56, 189, 248, 0.38)"
    },
    {
      id: "tropical-emerald-cove",
      file: "tropical-emerald-cove.jpg",
      title: "Enseada Tropical Esmeralda",
      location: "Litoral Brasileiro",
      resolution: "HD Wallpaper",
      path: "/media/wallpapers/tropical-emerald-cove.jpg",
      accent: "#2dd4bf",
      glow: "rgba(45, 212, 191, 0.38)"
    },
    {
      id: "winter-pine-river",
      file: "winter-pine-river.jpg",
      title: "Vale Nevado e Rio Cristalino",
      location: "Montanhas Rochosas",
      resolution: "4K Ultra HD",
      path: "/media/wallpapers/winter-pine-river.jpg",
      accent: "#93c5fd",
      glow: "rgba(147, 197, 253, 0.38)"
    },
    {
      id: "alpine-ridge-valley",
      file: "alpine-ridge-valley.jpg",
      title: "Cordilheira Alpina e Rio Sinuoso",
      location: "Alpes Canadenses",
      resolution: "4K Ultra HD",
      path: "/media/wallpapers/alpine-ridge-valley.jpg",
      accent: "#60a5fa",
      glow: "rgba(96, 165, 250, 0.38)"
    }
  ];

  let activeWallpapersList = [...DEFAULT_4K_WALLPAPERS];

  async function loadWallpapersManifest() {
    try {
      const res = await fetch('/api/wallpapers');
      if (res.ok) {
        const data = await res.json();
        if (data.wallpapers && data.wallpapers.length > 0) {
          activeWallpapersList = data.wallpapers.map((w) => {
            const def = DEFAULT_4K_WALLPAPERS.find((d) => d.id === w.id);
            return {
              ...w,
              accent: w.accent || def?.accent || '#00c2ff',
              glow: w.glow || def?.glow || 'rgba(0, 194, 255, 0.42)',
              path: `/media/wallpapers/${w.file}`
            };
          });
          if (typeof updateMainScreenWallpaper === 'function') {
            updateMainScreenWallpaper();
          }
        }
      }
    } catch (_) { }
  }
  loadWallpapersManifest();

  const DEFAULT_SETTINGS = {
    brightness: 100,
    pictureMode: 'standard',
    accentColor: 'cyan',
    fontStyle: 'modern',
    ambientIntensity: 90,
    silkWaves: true,
    glassTransparency: true,
    glassTransparencyLevel: 45,
    glassBrightness: 100,
    glassBlur: 12,
    uiScale: 1,
    cardRadius: 18,
    soundEnabled: true,
    soundVolume: 80,
    nightSound: false,
    defaultAudioTrack: 0,
    streamQuality: '4k',
    seekStep: 10,
    kenBurns: true,
    screensaverMinutes: 3,
    activeWallpaperId: 'patagonia-fitzroy',
    wallpaperAutoRotate: true,
    clock24h: true,
    showSeconds: false,
    showDate: true,
    reduceMotion: false,
    highContrastFocus: false,
    kidsMode: false,
    hideHeroBanner: false,
    showHomeWidgets: true,
    widgetWeather: true,
    widgetCalendar: true,
    widgetClock: true,
    widgetWeatherLiquidGlass: true,
    showHomeApps: true,
    showHomeLive: true,
    showHomeContinue: true,
    showHomeTrending: true,
    showHomeSettings: true,
    gridDensity: 'comfortable',
    focusStyle: 'neutral',
    autoHideTopbar: false,
    homeSectionOrder: ['widgets', 'settings', 'apps', 'live', 'continue', 'trending'],
    wallpaperDim: 'medium',
    hideAppLabels: false,
    lockClockStyle: 'corner',
    contrast: 100,
    saturation: 100,
    colorTemp: 'neutral',
    autoNightMode: false,
    autoSystemTheme: false,
    tvSafeMargin: 0,
    textSharpness: false,
    showBannersAsWallpaper: false,
    gpuPreference: 'dedicated',
    hardwareAcceleration: true
  };

  const DEFAULT_THEME_CONFIG = {
    theme: 'prism',
    smartHome: { livingRoomLight: true, ambilightSync: true, cinemaSoundbar: true, ecoMode: false },
    settings: { ...DEFAULT_SETTINGS }
  };

  async function loadDefaultThemeFromJson() {
    try {
      const res = await fetch('default-theme.json', { cache: 'no-store' });
      if (!res.ok) return;
      const rawText = await res.text();
      const data = JSON.parse(rawText);
      if (!data || typeof data !== 'object') return;

      if (data.theme && THEMES[data.theme]) {
        DEFAULT_THEME_CONFIG.theme = data.theme;
      }
      if (data.settings && typeof data.settings === 'object') {
        Object.assign(DEFAULT_SETTINGS, data.settings);
        DEFAULT_THEME_CONFIG.settings = { ...DEFAULT_SETTINGS };
      }
      if (data.smartHome && typeof data.smartHome === 'object') {
        DEFAULT_THEME_CONFIG.smartHome = {
          ...DEFAULT_THEME_CONFIG.smartHome,
          ...data.smartHome
        };
      }

      const prevSig = localStorage.getItem('iristv-default-theme-sig');
      const hasSaved = !!localStorage.getItem('iristv-settings-v1');
      if (!hasSaved || prevSig !== rawText) {
        state.settings = { ...DEFAULT_SETTINGS };
        state.smartHome = { ...DEFAULT_THEME_CONFIG.smartHome };
        localStorage.setItem('iristv-default-theme-sig', rawText);
        applyTheme(DEFAULT_THEME_CONFIG.theme, false);
        applyAllSettings();
        if (state.activeTab === 'home') renderTab('home');
        if (state.activeTab === 'settings') renderSettingsWorkspace(false);
      }
    } catch (_) { }
  }

  const PICTURE_MODES = {
    standard: { label: 'Padrão', contrast: 1, saturate: 1, warmth: 0 },
    cinema: { label: 'Filme', contrast: 1.07, saturate: 0.94, warmth: 0.06 },
    vivid: { label: 'Cores Fortes', contrast: 1.12, saturate: 1.28, warmth: 0 },
    night: { label: 'Noturno', contrast: 0.96, saturate: 0.88, warmth: 0.24 }
  };

  const QUALITY_META = {
    auto: { label: 'Automática' },
    '4k': { label: 'Alta' },
    '1080p': { label: 'HD' },
    '720p': { label: 'Econômica' }
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('iristv-settings-v1') || '{}');
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try { localStorage.setItem('iristv-settings-v1', JSON.stringify(state.settings)); } catch (_) { }
  }

  function loadSmartHome() {
    const base = { livingRoomLight: true, ambilightSync: true, cinemaSoundbar: true, ecoMode: false };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem('iristv-smarthome-v1') || '{}') };
    } catch (_) {
      return base;
    }
  }

  function saveSmartHome() {
    try { localStorage.setItem('iristv-smarthome-v1', JSON.stringify(state.smartHome)); } catch (_) { }
  }

  const loadedSettings = loadSettings();

  function loadMediaTracker() {
    try {
      const parsed = JSON.parse(localStorage.getItem('iristv-media-tracker-v1') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveMediaTracker() {
    try { localStorage.setItem('iristv-media-tracker-v1', JSON.stringify(state.mediaTracker)); } catch (_) { }
  }

  function loadFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem('iristv-favorites-v1') || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveFavorites() {
    try { localStorage.setItem('iristv-favorites-v1', JSON.stringify(Array.from(state.favorites))); } catch (_) { }
  }

  const state = {
    activeTab: 'home',
    activeSettingsSection: 'display',
    activeAppFilter: 'all',
    activeShowView: 'all',
    activeShowGenre: 'all',
    activeShowSearch: '',
    activeNewsScope: 'all',
    activeNewsCategory: 'all',
    activeNewsSearch: '',
    newsItems: [],
    newsUpdatedAt: null,
    newsLoading: false,
    catalogItems: [],
    catalogLoading: false,
    recommendedItems: [],
    mediaTracker: loadMediaTracker(),
    soundEnabled: loadedSettings.soundEnabled,
    theme: localStorage.getItem('irisos-theme') || 'prism',
    favorites: loadFavorites(),
    spotlightTarget: null,
    currentProfile: { id: 'main', name: 'Usuário', initial: 'U', gradient: 'linear-gradient(135deg, #ffd60a, #ff2d6f, #00c2ff)' },
    smartHome: loadSmartHome(),
    settings: loadedSettings,
    systemInfo: null,
    keepAwake: false,
    lastPingMs: null,
    appsGridDirty: false,
    focusEl: null,
    offlineChannels: new Set()
  };

  const PROFILES = [
    { id: 'main', name: 'Usuário', tag: 'Principal', initial: 'U', gradient: 'linear-gradient(135deg, #ffd60a, #ff2d6f, #00c2ff)' },
    { id: 'guest', name: 'Convidado', tag: 'Geral', initial: 'C', gradient: 'linear-gradient(135deg, #00c2ff, #9b4dff, #00e589)' },
    { id: 'kids', name: 'Infantil', tag: 'Modo Família', initial: 'I', gradient: 'linear-gradient(135deg, #ff7a00, #ffd60a, #00e589)' }
  ];

  /* =========================================================
     Apps instalados dinamicamente via irisStore
     ========================================================= */
  const APPS = window.IrisStore ? window.IrisStore.getInstalledAppsList() : [];

  function syncInstalledApps() {
    if (!window.IrisStore) return;
    const next = window.IrisStore.getInstalledAppsList();
    try {
      const pinned = JSON.parse(localStorage.getItem('iristv-pinned-apps') || '[]');
      if (Array.isArray(pinned) && pinned.length) {
        const pinSet = new Set(pinned);
        next.sort((a, b) => {
          const aScore = a.id === 'appstore' ? -1 : (pinSet.has(a.id) ? 0 : 1);
          const bScore = b.id === 'appstore' ? -1 : (pinSet.has(b.id) ? 0 : 1);
          return aScore - bScore;
        });
      }
    } catch (_) { }
    APPS.splice(0, APPS.length, ...next);
    state.appsGridDirty = true;
  }

  const VOD_STREAMS = {
    scifi: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    drama: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
    action: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    anime: 'https://media.w3.org/2010/05/bunny/trailer.mp4'
  };

  const TRENDING_SHOWS = [
    { id: 'severance', title: 'Severance', genre: 'scifi', streamUrl: VOD_STREAMS.scifi, appName: 'Apple TV+', appId: 'appletv', poster: 'media/poster-severance.jpg', bgImg: 'media/bg-severance.jpg', sub: 'Suspense Sci-Fi • 2 Temporadas', desc: 'Memórias cirurgicamente divididas entre a vida pessoal e o trabalho na Lumon.', glow: 'rgba(0, 194, 255, 0.55)', orbs: ['rgba(0, 150, 225, 0.56)', 'rgba(55, 100, 175, 0.48)', 'rgba(40, 75, 120, 0.42)'] },
    { id: 'the-last-of-us', title: 'The Last of Us', genre: 'drama', streamUrl: VOD_STREAMS.drama, appName: 'Max', appId: 'max', poster: 'media/poster-the-last-of-us.jpg', bgImg: 'media/bg-the-last-of-us.jpg', sub: 'Drama Pós-Apocalíptico • 4K HDR', desc: 'Joel e Ellie cruzam um Estados Unidos devastado em busca de sobrevivência.', glow: 'rgba(255, 130, 40, 0.55)', orbs: ['rgba(185, 105, 50, 0.55)', 'rgba(65, 115, 85, 0.46)', 'rgba(50, 55, 70, 0.42)'] },
    { id: 'stranger-things', title: 'Stranger Things', genre: 'scifi', kidsSafe: true, streamUrl: VOD_STREAMS.scifi, appName: 'Netflix', appId: 'netflix', poster: 'media/poster-stranger-things.jpg', bgImg: 'media/bg-stranger-things.jpg', sub: 'Mistério & Sci-Fi • 4K', desc: 'Mistérios sobrenaturais e experimentos secretos na pequena cidade de Hawkins.', glow: 'rgba(229, 9, 20, 0.58)', orbs: ['rgba(200, 35, 55, 0.56)', 'rgba(70, 85, 160, 0.48)', 'rgba(110, 40, 95, 0.42)'] },
    { id: 'arcane', title: 'Arcane', genre: 'anime', kidsSafe: true, streamUrl: VOD_STREAMS.anime, appName: 'Netflix', appId: 'netflix', poster: 'media/poster-arcane.jpg', bgImg: 'media/bg-arcane.jpg', sub: 'Animação • Vencedora do Emmy', desc: 'Duas irmãs em lados opostos de uma guerra entre Piltover e Zaun.', glow: 'rgba(255, 45, 111, 0.58)', orbs: ['rgba(210, 45, 115, 0.56)', 'rgba(40, 155, 215, 0.5)', 'rgba(110, 65, 185, 0.45)'] },
    { id: 'fallout', title: 'Fallout', genre: 'action', streamUrl: VOD_STREAMS.action, appName: 'Prime Video', appId: 'prime', poster: 'media/poster-fallout.jpg', bgImg: 'media/bg-fallout.jpg', sub: 'Ação Sci-Fi • 4K HDR10+', desc: 'Sobreviventes emergem dos abrigos nucleares para um mundo pós-apocalíptico.', glow: 'rgba(0, 168, 225, 0.55)', orbs: ['rgba(185, 145, 55, 0.52)', 'rgba(45, 125, 175, 0.48)', 'rgba(65, 75, 85, 0.42)'] },
    { id: 'shogun', title: 'Shōgun', genre: 'drama', streamUrl: VOD_STREAMS.drama, appName: 'Disney+', appId: 'disney', poster: 'media/poster-shogun.jpg', bgImg: 'media/bg-shogun.jpg', sub: 'Épico Histórico • Emmy Winner', desc: 'Conflitos políticos e honra no Japão feudal do século XVII.', glow: 'rgba(255, 190, 60, 0.52)', orbs: ['rgba(175, 130, 60, 0.52)', 'rgba(75, 95, 125, 0.46)', 'rgba(55, 65, 85, 0.42)'] },
    { id: 'breaking-bad', title: 'Breaking Bad', genre: 'drama', streamUrl: VOD_STREAMS.drama, appName: 'Netflix', appId: 'netflix', poster: 'media/poster-breaking-bad.jpg', bgImg: 'media/bg-breaking-bad.jpg', sub: 'Crime & Drama • Clássico 4K', desc: 'Um professor de química entra no submundo para garantir o futuro da família.', glow: 'rgba(0, 229, 137, 0.52)', orbs: ['rgba(55, 145, 95, 0.54)', 'rgba(175, 145, 65, 0.46)', 'rgba(45, 75, 85, 0.42)'] },
    { id: 'the-boys', title: 'The Boys', genre: 'action', streamUrl: VOD_STREAMS.action, appName: 'Prime Video', appId: 'prime', poster: 'media/poster-the-boys.jpg', bgImg: 'media/bg-the-boys.jpg', sub: 'Ação & Sátira • 4K HDR', desc: 'Um grupo de vigilantes enfrenta super-heróis corruptos e poderosos.', glow: 'rgba(255, 45, 111, 0.55)', orbs: ['rgba(195, 45, 75, 0.55)', 'rgba(55, 105, 185, 0.48)', 'rgba(65, 55, 95, 0.42)'] },
    { id: 'dark', title: 'Dark', genre: 'scifi', streamUrl: VOD_STREAMS.scifi, appName: 'Netflix', appId: 'netflix', poster: 'media/poster-dark.jpg', bgImg: 'media/bg-dark.jpg', sub: 'Ficção Científica • 3 Temporadas', desc: 'O desaparecimento de crianças revela uma conspiração através de gerações.', glow: 'rgba(255, 214, 10, 0.5)', orbs: ['rgba(185, 155, 55, 0.5)', 'rgba(55, 85, 115, 0.48)', 'rgba(40, 50, 70, 0.45)'] },
    { id: 'succession', title: 'Succession', genre: 'drama', streamUrl: VOD_STREAMS.drama, appName: 'Max', appId: 'max', poster: 'media/poster-succession.jpg', bgImg: 'media/bg-succession.jpg', sub: 'Drama • HBO Original', desc: 'A disputa pelo controle de um dos maiores impérios de mídia do mundo.', glow: 'rgba(180, 190, 255, 0.48)', orbs: ['rgba(85, 105, 165, 0.52)', 'rgba(65, 85, 115, 0.45)', 'rgba(50, 60, 80, 0.42)'] },
    { id: 'edgerunners', title: 'Cyberpunk: Edgerunners', genre: 'anime', streamUrl: VOD_STREAMS.anime, appName: 'Netflix', appId: 'netflix', poster: 'media/poster-edgerunners.jpg', bgImg: 'media/bg-edgerunners.jpg', sub: 'Anime Sci-Fi • Studio Trigger', desc: 'Um jovem tenta sobreviver nas ruas futuristas de Night City.', glow: 'rgba(255, 214, 10, 0.6)', orbs: ['rgba(215, 180, 25, 0.54)', 'rgba(215, 45, 115, 0.48)', 'rgba(0, 175, 225, 0.45)'] },
    { id: 'wednesday', title: 'Wandinha', genre: 'drama', kidsSafe: true, streamUrl: VOD_STREAMS.drama, appName: 'Netflix', appId: 'netflix', poster: 'media/poster-wednesday.jpg', bgImg: 'media/bg-wednesday.jpg', sub: 'Mistério & Fantasia • 4K', desc: 'Wandinha Addams investiga assassinatos na Academia Nunca Mais.', glow: 'rgba(155, 77, 255, 0.58)', orbs: ['rgba(120, 70, 200, 0.55)', 'rgba(65, 85, 140, 0.45)', 'rgba(40, 45, 75, 0.45)'] },
    { id: 'the-bear', title: 'The Bear', genre: 'drama', kidsSafe: true, streamUrl: VOD_STREAMS.drama, appName: 'Disney+', appId: 'disney', poster: 'media/poster-the-bear.jpg', bgImg: 'media/bg-the-bear.jpg', sub: 'Drama • 3 Temporadas', desc: 'Um chef premiado retorna a Chicago para transformar a lanchonete da família.', glow: 'rgba(0, 194, 255, 0.52)', orbs: ['rgba(55, 130, 195, 0.52)', 'rgba(85, 115, 125, 0.46)', 'rgba(50, 65, 85, 0.42)'] },
    { id: 'andor', title: 'Andor', genre: 'scifi', kidsSafe: true, streamUrl: VOD_STREAMS.scifi, appName: 'Disney+', appId: 'disney', poster: 'media/poster-andor.jpg', bgImg: 'media/bg-andor.jpg', sub: 'Star Wars • Dolby Vision', desc: 'As origens da Rebelião contra o Império Galáctico.', glow: 'rgba(255, 122, 0, 0.55)', orbs: ['rgba(205, 105, 40, 0.54)', 'rgba(55, 95, 150, 0.48)', 'rgba(45, 60, 85, 0.42)'] },
    { id: 'house-of-the-dragon', title: 'House of the Dragon', genre: 'action', streamUrl: VOD_STREAMS.action, appName: 'Max', appId: 'max', poster: 'media/poster-house-of-the-dragon.jpg', bgImg: 'media/bg-house-of-the-dragon.jpg', sub: 'Fantasia Épica • HBO', desc: 'A guerra civil da Casa Targaryen pelo Trono de Ferro.', glow: 'rgba(255, 80, 30, 0.55)', orbs: ['rgba(210, 75, 35, 0.56)', 'rgba(90, 50, 65, 0.46)', 'rgba(45, 55, 80, 0.42)'] },
    { id: 'jujutsu-kaisen', title: 'Jujutsu Kaisen', genre: 'anime', kidsSafe: true, streamUrl: VOD_STREAMS.anime, appName: 'Crunchyroll', appId: 'crunchyroll', poster: 'media/poster-jujutsu-kaisen.jpg', bgImg: 'media/bg-jujutsu-kaisen.jpg', sub: 'Anime • Dublado & Legendado', desc: 'Feiticeiros enfrentam maldições ocultas para proteger a humanidade.', glow: 'rgba(244, 117, 33, 0.58)', orbs: ['rgba(75, 125, 225, 0.54)', 'rgba(185, 65, 115, 0.46)', 'rgba(45, 55, 90, 0.45)'] }
  ];

  const DEFAULT_LIVE_CHANNELS = [
    { num: '1', name: 'TV Cultura', ccLang: 'pt', program: 'Programação Cultura • Ao Vivo', next: 'Sinal Aberto', meta: 'Sinal Aberto • Canal 1', streamUrl: 'https://player-tvcultura.stream.uol.com.br/live/tvcultura.m3u8', iconSrc: 'icons/tvcultura.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #1f6b38, #3ea860)', orbs: ['rgba(30, 150, 70, 0.55)', 'rgba(70, 190, 100, 0.45)', 'rgba(255, 215, 0, 0.35)'] },
    { num: '2', name: 'SBT', ccLang: 'pt', program: 'SBT • Programação Nacional', next: 'Ao Vivo', meta: 'Sinal Aberto • Canal 2', streamUrl: 'https://video09.logicahost.com.br/sbtmutum/sbtmutum/playlist.m3u8', iconSrc: 'icons/sbt.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #1e2430, #384255)', orbs: ['rgba(220, 50, 60, 0.55)', 'rgba(50, 140, 220, 0.45)', 'rgba(255, 210, 0, 0.4)'] },
    { num: '3', name: 'TV Globo', ccLang: 'pt', program: 'Rede Globo • Programação Ao Vivo', next: 'Sinal Aberto', meta: 'Sinal Aberto • Canal 3', streamUrl: 'http://hls1.sua.tv/live/globotvbahiafhdbr2/s.m3u8', iconSrc: 'icons/globoplay.jpg', appId: 'globoplay', bg: 'linear-gradient(135deg, #0f4c81, #2575fc)', orbs: ['rgba(37, 117, 252, 0.55)', 'rgba(240, 120, 40, 0.45)', 'rgba(255, 255, 255, 0.35)'] },
    { num: '4', name: 'Band', ccLang: 'pt', program: 'Band / RBATV • Ao Vivo', next: 'Ao Vivo', meta: 'Sinal Aberto • Canal 4', streamUrl: 'https://cdn.live.br1.jmvstream.com/w/LVW-15748/LVW15748_Yed7yzLuRC/playlist.m3u8', iconSrc: 'icons/band.jpg', appId: 'globoplay', bg: 'linear-gradient(135deg, #4c7ba8, #6d9ed0)', orbs: ['rgba(75, 125, 185, 0.55)', 'rgba(65, 165, 185, 0.45)', 'rgba(255, 214, 10, 0.35)'] },
    { num: '5', name: 'RedeTV!', ccLang: 'pt', program: 'RedeTV! • Ao Vivo', next: 'Ao Vivo', meta: 'Sinal Aberto • Canal 5', streamUrl: 'http://170.83.16.50/REDE_TV/tracks-v1a1/mono.m3u8', iconSrc: 'icons/redetv.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #1f2735, #344055)', orbs: ['rgba(50, 130, 220, 0.55)', 'rgba(220, 50, 60, 0.45)', 'rgba(255, 215, 0, 0.35)'] },
    { num: '6', name: 'Record News', ccLang: 'pt', program: 'Record News • Jornalismo 24h', next: 'Ao Vivo', meta: 'Ao Vivo • Canal 6', streamUrl: 'http://170.83.16.50/RECORD_NEWS/tracks-v1a1/mono.m3u8', iconSrc: 'icons/record.png', appId: 'plutotv', bg: 'linear-gradient(135deg, #1b2840, #2b3d60)', orbs: ['rgba(50, 110, 210, 0.55)', 'rgba(80, 150, 230, 0.45)', 'rgba(40, 60, 100, 0.4)'] },
    { num: '7', name: 'GloboNews', ccLang: 'pt', program: 'GloboNews • Nunca Desliga', next: 'Ao Vivo', meta: 'Notícias 24h • Canal 7', streamUrl: '/api/live/globonews.m3u8', iconSrc: 'icons/globonews.svg', appId: 'globoplay', bg: 'linear-gradient(135deg, #8b1319, #b51c24)', orbs: ['rgba(215, 30, 40, 0.58)', 'rgba(140, 15, 25, 0.45)', 'rgba(255, 200, 0, 0.35)'] },
    { num: '8', name: 'CNN Brasil', ccLang: 'pt', program: 'CNN Brasil • Ao Vivo', next: 'Ao Vivo', meta: 'Notícias • Canal 8', streamUrl: 'https://d25usgadhphvwi.cloudfront.net/hls/main.m3u8', iconSrc: 'icons/cnnbrasil.jpg', appId: 'youtube', bg: 'linear-gradient(135deg, #9b3545, #cb6573)', orbs: ['rgba(204, 0, 0, 0.5)', 'rgba(70, 85, 130, 0.45)', 'rgba(55, 65, 95, 0.4)'] },
    { num: '9', name: 'BandNews TV', ccLang: 'pt', program: 'BandNews • Em Cima da Hora', next: 'Ao Vivo', meta: 'Notícias 24h • Canal 9', streamUrl: 'http://170.83.16.50/BAND_NEWS/tracks-v1a1/mono.m3u8', iconSrc: 'icons/bandnews.png', appId: 'youtube', bg: 'linear-gradient(135deg, #7c1a24, #a32836)', orbs: ['rgba(215, 30, 45, 0.55)', 'rgba(150, 20, 30, 0.45)', 'rgba(255, 200, 0, 0.35)'] },
    { num: '10', name: 'Canal UOL', ccLang: 'pt', program: 'Canal UOL • Notícias & Opinião', next: 'Ao Vivo', meta: 'Notícias & Opinião • Canal 10', streamUrl: 'https://jmp2.uk/plu-64b9370b409629000802d32b.m3u8', iconSrc: 'icons/canaluol.png', appId: 'plutotv', bg: 'linear-gradient(135deg, #221a10, #3d2c16)', orbs: ['rgba(255, 130, 0, 0.55)', 'rgba(255, 200, 0, 0.45)', 'rgba(230, 40, 40, 0.4)'] },
    { num: '11', name: 'TNT', ccLang: 'pt', program: 'TNT • Grandes Filmes & Sucessos', next: 'Ao Vivo', meta: 'Filmes & Cinema • Canal 11', streamUrl: 'http://170.83.16.50/TNT/tracks-v1a1/mono.m3u8', iconSrc: 'icons/tnt.png', appId: 'max', bg: 'linear-gradient(135deg, #b31217, #d92027)', orbs: ['rgba(217, 32, 39, 0.55)', 'rgba(150, 15, 25, 0.45)', 'rgba(255, 200, 0, 0.35)'] },
    { num: '12', name: 'TNT Series', ccLang: 'pt', program: 'TNT Series • Séries e Suspense', next: 'Ao Vivo', meta: 'Séries & Cinema • Canal 12', streamUrl: 'http://170.83.16.50/TNT_SERIES/tracks-v1a1/mono.m3u8', iconSrc: 'icons/tntseries.png', appId: 'max', bg: 'linear-gradient(135deg, #8c1015, #bd181e)', orbs: ['rgba(210, 30, 40, 0.55)', 'rgba(120, 10, 20, 0.45)', 'rgba(255, 180, 0, 0.35)'] },
    { num: '13', name: 'TNT Novelas', ccLang: 'pt', program: 'TNT Novelas • Paixões e Emoções 24h', next: 'Ao Vivo', meta: 'Novelas & Dramas • Canal 13', streamUrl: 'http://170.83.16.50/TNT_NOVELAS/tracks-v1a1/mono.m3u8', iconSrc: 'icons/tntnovelas.svg', appId: 'max', bg: 'linear-gradient(135deg, #6b1432, #942048)', orbs: ['rgba(200, 35, 100, 0.55)', 'rgba(130, 20, 65, 0.45)', 'rgba(255, 200, 100, 0.35)'] },
    { num: '14', name: 'Space', ccLang: 'pt', program: 'Space • Adrenalina, Ficção & Ação', next: 'Ao Vivo', meta: 'Filmes de Ação • Canal 14', streamUrl: 'http://170.83.16.50/SPACE/tracks-v1a1/mono.m3u8', iconSrc: 'icons/space.png', appId: 'max', bg: 'linear-gradient(135deg, #0e1e38, #183562)', orbs: ['rgba(0, 170, 255, 0.55)', 'rgba(30, 80, 180, 0.45)', 'rgba(0, 240, 255, 0.35)'] },
    { num: '15', name: 'Telecine Premium', ccLang: 'pt', program: 'Telecine Premium • Grandes Estreias do Cinema', next: 'Ao Vivo', meta: 'Cinema • Canal 15', streamUrl: 'http://45.185.15.154:9080/stream/28/index.m3u8', iconSrc: 'icons/telecine.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #7c1a26, #b02535)', orbs: ['rgba(220, 35, 55, 0.58)', 'rgba(160, 20, 35, 0.45)', 'rgba(255, 215, 0, 0.35)'] },
    { num: '16', name: 'Telecine Action', ccLang: 'pt', program: 'Telecine Action • Tiro, Porrada & Bomba', next: 'Ao Vivo', meta: 'Ação & Adrenalina • Canal 16', streamUrl: 'http://46.151.196.223:14326', iconSrc: 'icons/telecine.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #1b202e, #2a344d)', orbs: ['rgba(230, 40, 50, 0.55)', 'rgba(60, 90, 160, 0.45)', 'rgba(255, 180, 0, 0.35)'] },
    { num: '17', name: 'Telecine Touch', ccLang: 'pt', program: 'Telecine Touch • Emoção, Drama & Romance', next: 'Ao Vivo', meta: 'Romance & Drama • Canal 17', streamUrl: 'http://45.185.15.154:9080/stream/29/index.m3u8', iconSrc: 'icons/telecine.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #4d152c, #782245)', orbs: ['rgba(215, 45, 110, 0.55)', 'rgba(140, 25, 75, 0.45)', 'rgba(255, 180, 200, 0.35)'] },
    { num: '18', name: 'Telecine Fun', ccLang: 'pt', program: 'Telecine Fun • Risadas & Diversão em Família', next: 'Ao Vivo', meta: 'Comédia • Canal 18', streamUrl: 'http://45.185.15.154:9080/stream/63/index.m3u8', iconSrc: 'icons/telecine.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #2b1f0c, #483412)', orbs: ['rgba(240, 140, 20, 0.55)', 'rgba(190, 80, 15, 0.45)', 'rgba(255, 220, 80, 0.35)'] },
    { num: '19', name: 'Telecine Cult', ccLang: 'pt', program: 'Telecine Cult • Obras-Primas do Cinema', next: 'Ao Vivo', meta: 'Clássicos • Canal 19', streamUrl: 'http://45.185.15.154:9080/stream/64/index.m3u8', iconSrc: 'icons/telecine.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #1c1d24, #2d2e3b)', orbs: ['rgba(180, 140, 60, 0.55)', 'rgba(70, 75, 95, 0.45)', 'rgba(240, 210, 120, 0.35)'] },
    { num: '20', name: 'Sony Movies', ccLang: 'pt', program: 'Sony Movies • Cinema Hollywood 24h', next: 'Ao Vivo', meta: 'Cinema 24h • Canal 20', streamUrl: 'http://170.83.16.50/SONY_MOVIES/tracks-v1a1/mono.m3u8', iconSrc: 'icons/sonymovies.png', appId: 'prime', bg: 'linear-gradient(135deg, #1b1712, #32281a)', orbs: ['rgba(225, 175, 45, 0.55)', 'rgba(180, 120, 25, 0.45)', 'rgba(255, 220, 100, 0.35)'] },
    { num: '21', name: 'Sony Channel', ccLang: 'pt', program: 'Sony Channel • As Melhores Séries', next: 'Ao Vivo', meta: 'Séries & Cinema • Canal 21', streamUrl: 'http://170.83.16.50/SONY_CHANNEL/tracks-v1a1/mono.m3u8', iconSrc: 'icons/sonychannel.png', appId: 'prime', bg: 'linear-gradient(135deg, #151d2e, #24314c)', orbs: ['rgba(220, 170, 30, 0.55)', 'rgba(40, 80, 160, 0.45)', 'rgba(255, 210, 80, 0.35)'] },
    { num: '22', name: 'AXN', ccLang: 'pt', program: 'AXN • Investigação & Casos Criminais', next: 'Ao Vivo', meta: 'Ação & Suspense • Canal 22', streamUrl: 'http://170.83.16.50/AXN/tracks-v1a1/mono.m3u8', iconSrc: 'icons/axn.svg', appId: 'prime', bg: 'linear-gradient(135deg, #1c1524, #322340)', orbs: ['rgba(175, 30, 50, 0.55)', 'rgba(60, 30, 90, 0.45)', 'rgba(255, 60, 80, 0.35)'] },
    { num: '23', name: 'A&E', ccLang: 'pt', program: 'A&E • Séries e Grandes Histórias', next: 'Ao Vivo', meta: 'Filmes & Séries • Canal 23', streamUrl: 'http://170.83.16.50/AeE/tracks-v1a1/mono.m3u8', iconSrc: 'icons/ae.svg', appId: 'prime', bg: 'linear-gradient(135deg, #1b1b22, #2e2e38)', orbs: ['rgba(220, 30, 40, 0.55)', 'rgba(80, 80, 95, 0.45)', 'rgba(255, 200, 50, 0.35)'] },
    { num: '24', name: 'Lifetime', ccLang: 'pt', program: 'Lifetime • Filmes e Histórias Inspiradoras', next: 'Ao Vivo', meta: 'Filmes & Séries • Canal 24', streamUrl: 'http://170.83.16.50/LIFETIME/tracks-v1a1/mono.m3u8', iconSrc: 'icons/lifetime.svg', appId: 'prime', bg: 'linear-gradient(135deg, #42111c, #631c2c)', orbs: ['rgba(215, 40, 70, 0.55)', 'rgba(140, 20, 45, 0.45)', 'rgba(255, 120, 150, 0.35)'] },
    { num: '25', name: 'History Channel', ccLang: 'pt', program: 'History • O Passado Explica o Futuro', next: 'Ao Vivo', meta: 'História & Documentários • Canal 25', streamUrl: 'http://170.83.16.50/HISTORY/tracks-v1a1/mono.m3u8', iconSrc: 'icons/history.svg', appId: 'prime', bg: 'linear-gradient(135deg, #241d13, #3d3120)', orbs: ['rgba(225, 160, 25, 0.55)', 'rgba(160, 110, 20, 0.45)', 'rgba(255, 215, 90, 0.35)'] },
    { num: '26', name: 'Discovery Channel', ccLang: 'pt', program: 'Discovery • Ciência, Exploração & Realidade', next: 'Ao Vivo', meta: 'Ciência & Natureza • Canal 26', streamUrl: 'http://170.83.16.50/DISCOVERY_CHANNEL/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoverychannel.svg', appId: 'max', bg: 'linear-gradient(135deg, #0f243c, #193a5e)', orbs: ['rgba(0, 150, 240, 0.55)', 'rgba(30, 90, 170, 0.45)', 'rgba(0, 210, 255, 0.35)'] },
    { num: '27', name: 'Discovery Turbo', ccLang: 'pt', program: 'Discovery Turbo • Motores & Velocidade Extrema', next: 'Ao Vivo', meta: 'Automobilismo • Canal 27', streamUrl: 'http://170.83.16.50/DISCOVERY_TURBO/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoveryturbo.svg', appId: 'max', bg: 'linear-gradient(135deg, #2a110d, #441c16)', orbs: ['rgba(230, 60, 20, 0.55)', 'rgba(160, 40, 15, 0.45)', 'rgba(255, 140, 20, 0.35)'] },
    { num: '28', name: 'Discovery Home & Health', ccLang: 'pt', program: 'Home & Health • Bem-Estar, Casa e Culinária', next: 'Ao Vivo', meta: 'Estilo de Vida • Canal 28', streamUrl: 'http://170.83.16.50/DISCOVERY_HOME_HEALTH/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoveryhomehealth.png', appId: 'max', bg: 'linear-gradient(135deg, #1b322a, #2b4c40)', orbs: ['rgba(35, 175, 120, 0.55)', 'rgba(20, 110, 75, 0.45)', 'rgba(100, 235, 180, 0.35)'] },
    { num: '29', name: 'Discovery Science', ccLang: 'pt', program: 'Discovery Science • Tecnologia e Inovação', next: 'Ao Vivo', meta: 'Tecnologia • Canal 29', streamUrl: 'http://170.83.16.50/DISCOVERY_SCIENCE/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoverychannel.svg', appId: 'max', bg: 'linear-gradient(135deg, #102636, #1d405b)', orbs: ['rgba(0, 190, 220, 0.55)', 'rgba(20, 100, 150, 0.45)', 'rgba(80, 230, 255, 0.35)'] },
    { num: '30', name: 'Discovery World', ccLang: 'pt', program: 'Discovery World • Cultura, Povos e Viagens', next: 'Ao Vivo', meta: 'Viagens & Cultura • Canal 30', streamUrl: 'http://170.83.16.50/DISCOVERY_WORLD/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoverychannel.svg', appId: 'max', bg: 'linear-gradient(135deg, #1c2b1e, #2e4431)', orbs: ['rgba(60, 160, 80, 0.55)', 'rgba(30, 95, 50, 0.45)', 'rgba(140, 225, 150, 0.35)'] },
    { num: '31', name: 'Discovery Theater', ccLang: 'pt', program: 'Discovery Theater • Vida Selvagem em Ultra HD', next: 'Ao Vivo', meta: 'Natureza 4K • Canal 31', streamUrl: 'http://170.83.16.50/DISCOVERY_THEATER/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoverychannel.svg', appId: 'max', bg: 'linear-gradient(135deg, #112833, #1e4153)', orbs: ['rgba(30, 160, 200, 0.55)', 'rgba(15, 80, 110, 0.45)', 'rgba(100, 220, 255, 0.35)'] },
    { num: '32', name: 'Animal Planet', ccLang: 'pt', program: 'Animal Planet • O Reino Selvagem e Pets', next: 'Ao Vivo', meta: 'Animais & Natureza • Canal 32', streamUrl: 'http://170.83.16.50/ANIMAL_PLANET/tracks-v1a1/mono.m3u8', iconSrc: 'icons/animalplanet.svg', appId: 'max', bg: 'linear-gradient(135deg, #132d38, #1f4757)', orbs: ['rgba(20, 150, 185, 0.55)', 'rgba(10, 90, 120, 0.45)', 'rgba(80, 215, 245, 0.35)'] },
    { num: '33', name: 'Food Network', ccLang: 'pt', program: 'Food Network • Canal 492 SKY • Culinária & Chefs', next: 'Ao Vivo', meta: 'Gastronomia • Canal 33', streamUrl: 'https://tastemade-tastemadefreetv16-tcl-mmaw8.amagi.tv/playlist/tastemade-tastemadefreetv16-tcl/playlist.m3u8', iconSrc: 'icons/foodnetwork.svg', appId: 'max', bg: 'linear-gradient(135deg, #b82b14, #d9421f)', orbs: ['rgba(225, 60, 30, 0.58)', 'rgba(255, 150, 20, 0.45)', 'rgba(255, 220, 100, 0.35)'] },
    { num: '34', name: 'TLC Brasil', ccLang: 'pt', program: 'TLC • Histórias Reais e Casamentos', next: 'Ao Vivo', meta: 'Realities • Canal 34', streamUrl: 'http://170.83.16.50/TLC/tracks-v1a1/mono.m3u8', iconSrc: 'icons/tlc.svg', appId: 'max', bg: 'linear-gradient(135deg, #381b14, #572a1f)', orbs: ['rgba(230, 90, 40, 0.55)', 'rgba(160, 50, 20, 0.45)', 'rgba(255, 170, 70, 0.35)'] },
    { num: '35', name: 'HGTV', ccLang: 'pt', program: 'HGTV • Casas Incríveis e Reformas', next: 'Ao Vivo', meta: 'Arquitetura & Décor • Canal 35', streamUrl: 'http://170.83.16.50/HGTV/tracks-v1a1/mono.m3u8', iconSrc: 'icons/hgtv.png', appId: 'max', bg: 'linear-gradient(135deg, #112d26, #1d463b)', orbs: ['rgba(30, 170, 130, 0.55)', 'rgba(15, 95, 75, 0.45)', 'rgba(90, 230, 190, 0.35)'] },
    { num: '36', name: 'Cartoon Network', ccLang: 'pt', program: 'Cartoon Network • Animações 24h', next: 'Ao Vivo', meta: 'Desenhos • Canal 36', streamUrl: 'http://170.83.16.50/CARTOON/tracks-v1a1/mono.m3u8', iconSrc: 'icons/cartoon.png', appId: 'max', bg: 'linear-gradient(135deg, #191b22, #292d38)', orbs: ['rgba(240, 240, 240, 0.55)', 'rgba(70, 75, 90, 0.45)', 'rgba(0, 194, 255, 0.35)'] },
    { num: '37', name: 'Discovery Kids', ccLang: 'pt', program: 'Discovery Kids • O Melhor para os Pequenos', next: 'Ao Vivo', meta: 'Infantil 24h • Canal 37', streamUrl: 'http://170.83.16.50/DISCOVERY_KIDS/tracks-v1a1/mono.m3u8', iconSrc: 'icons/discoverykids.svg', appId: 'max', bg: 'linear-gradient(135deg, #173820, #255732)', orbs: ['rgba(60, 190, 70, 0.55)', 'rgba(255, 200, 30, 0.45)', 'rgba(40, 120, 220, 0.35)'] },
    { num: '38', name: 'ESPN Brasil', ccLang: 'pt', program: 'ESPN Brasil • O Melhor do Futebol e Esportes', next: 'Ao Vivo', meta: 'Esportes Ao Vivo • Canal 38', streamUrl: 'http://170.83.16.50/ESPN/tracks-v1a1/mono.m3u8', iconSrc: 'icons/espn.jpg', appId: 'disney', bg: 'linear-gradient(135deg, #991c1d, #cc2829)', orbs: ['rgba(220, 40, 45, 0.55)', 'rgba(145, 25, 30, 0.45)', 'rgba(255, 200, 0, 0.35)'] },
    { num: '39', name: 'BandSports', ccLang: 'pt', program: 'BandSports • O Canal de Todos os Esportes', next: 'Ao Vivo', meta: 'Esportes Ao Vivo • Canal 39', streamUrl: 'http://170.83.16.50/BAND_SPORTS/tracks-v1a1/mono.m3u8', iconSrc: 'icons/bandsports.svg', appId: 'globoplay', bg: 'linear-gradient(135deg, #142a1b, #20412b)', orbs: ['rgba(35, 160, 65, 0.55)', 'rgba(200, 40, 30, 0.45)', 'rgba(255, 220, 0, 0.35)'] },
    { num: '40', name: 'WooHoo', ccLang: 'pt', program: 'WooHoo • Skate, Surf e Música Urbana', next: 'Ao Vivo', meta: 'Esportes Radicais • Canal 40', streamUrl: 'http://170.83.16.50/WOOHOO/tracks-v1a1/mono.m3u8', iconSrc: 'icons/woohoo.png', appId: 'youtube', bg: 'linear-gradient(135deg, #30172c, #4c2546)', orbs: ['rgba(210, 40, 160, 0.55)', 'rgba(120, 20, 100, 0.45)', 'rgba(0, 220, 255, 0.35)'] },
    { num: '41', name: 'Arte 1', ccLang: 'pt', program: 'Arte 1 • O Canal de Arte e Cinema', next: 'Ao Vivo', meta: 'Artes & Cinema • Canal 41', streamUrl: 'http://170.83.16.50/ARTE_1/tracks-v1a1/mono.m3u8', iconSrc: 'icons/arte1.svg', appId: 'globoplay', bg: 'linear-gradient(135deg, #1a1e28, #2a3140)', orbs: ['rgba(100, 130, 190, 0.55)', 'rgba(60, 75, 110, 0.45)', 'rgba(255, 215, 0, 0.35)'] },
    { num: '42', name: 'Canal Futura', ccLang: 'pt', program: 'Futura • Educação, Cidadania e Ciência', next: 'Ao Vivo', meta: 'Educação • Canal 42', streamUrl: 'http://170.83.16.50/FUTURA/tracks-v1a1/mono.m3u8', iconSrc: 'icons/futura.png', appId: 'globoplay', bg: 'linear-gradient(135deg, #1f2d3a, #304456)', orbs: ['rgba(0, 160, 220, 0.55)', 'rgba(220, 120, 20, 0.45)', 'rgba(80, 210, 120, 0.35)'] },
    { num: '43', name: 'Pluto Cine Ação', ccLang: 'pt', program: 'Pluto TV • Cine Ação 24h', next: 'Ao Vivo', meta: 'Filmes de Ação • Canal 43', streamUrl: 'https://jmp2.uk/plu-5f120f41b7d403000783a6d6.m3u8', iconSrc: 'icons/plutocineacao.png', appId: 'plutotv', bg: 'linear-gradient(135deg, #2a1420, #401c2c)', orbs: ['rgba(230, 30, 50, 0.55)', 'rgba(120, 40, 180, 0.45)', 'rgba(255, 222, 0, 0.32)'] },
    { num: '44', name: 'Pluto Cine Sucessos', ccLang: 'pt', program: 'Cine Sucessos • Filmes Aclamados 24h', next: 'Ao Vivo', meta: 'Filmes & Cinema • Canal 44', streamUrl: 'https://jmp2.uk/plu-5f120e94a5714d00074576a1.m3u8', iconSrc: 'icons/cinesucessos.png', appId: 'plutotv', bg: 'linear-gradient(135deg, #2b1f0c, #483412)', orbs: ['rgba(220, 160, 30, 0.55)', 'rgba(180, 110, 20, 0.45)', 'rgba(255, 230, 120, 0.32)'] },
    { num: '45', name: 'Pluto Cine Terror', ccLang: 'pt', program: 'Cine Terror • Noites de Arrepio 24h', next: 'Ao Vivo', meta: 'Filmes de Terror • Canal 45', streamUrl: 'https://jmp2.uk/plu-5f12111c9e6c2c00078ef3bb.m3u8', iconSrc: 'icons/cineterror.png', appId: 'plutotv', bg: 'linear-gradient(135deg, #280a12, #46111f)', orbs: ['rgba(200, 20, 40, 0.55)', 'rgba(130, 10, 25, 0.45)', 'rgba(60, 10, 20, 0.4)'] },
    { num: '46', name: 'Pluto Cine Comédia', ccLang: 'pt', program: 'Cine Comédia • O Melhor do Humor 24h', next: 'Ao Vivo', meta: 'Filmes & Comédia • Canal 46', streamUrl: 'https://jmp2.uk/plu-5f12101f0b12f00007844c7c.m3u8', iconSrc: 'icons/cinecomedia.png', appId: 'plutotv', bg: 'linear-gradient(135deg, #2c1a0a, #4a2a10)', orbs: ['rgba(240, 120, 20, 0.55)', 'rgba(210, 90, 15, 0.45)', 'rgba(255, 200, 50, 0.35)'] },
    { num: '47', name: 'FIFA+ Brasil', ccLang: 'pt', program: 'FIFA+ • Competições & Especiais', next: 'Ao Vivo', meta: 'Esportes Ao Vivo • Canal 47', streamUrl: 'https://jmp2.uk/plu-66997e8d3a4ad20008e50be9.m3u8', iconSrc: 'icons/fifaplus.jpg', appId: 'globoplay', bg: 'linear-gradient(135deg, #1b5e35, #2b8a4e)', orbs: ['rgba(27, 138, 68, 0.58)', 'rgba(55, 165, 115, 0.45)', 'rgba(35, 75, 95, 0.4)'] }
  ];

  const M3U_PALETTES = [
    { bg: 'linear-gradient(135deg, #3c78a6, #73a8cc)', orbs: ['rgba(60, 130, 190, 0.55)', 'rgba(95, 165, 200, 0.45)', 'rgba(255, 70, 95, 0.35)'] },
    { bg: 'linear-gradient(135deg, #a65c78, #d38da6)', orbs: ['rgba(185, 90, 125, 0.55)', 'rgba(130, 85, 165, 0.45)', 'rgba(65, 65, 105, 0.4)'] },
    { bg: 'linear-gradient(135deg, #4b6f9c, #7a9ec8)', orbs: ['rgba(75, 120, 185, 0.55)', 'rgba(95, 150, 200, 0.45)', 'rgba(55, 75, 115, 0.4)'] },
    { bg: 'linear-gradient(135deg, #1b5e35, #2b8a4e)', orbs: ['rgba(27, 138, 68, 0.58)', 'rgba(55, 165, 115, 0.45)', 'rgba(35, 75, 95, 0.4)'] }
  ];

  function parseM3uPlaylist(rawText) {
    const lines = String(rawText || '').split(/\r?\n/);
    const parsed = [];
    let pending = null;
    const usedNums = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        const commaIdx = line.lastIndexOf(',');
        const title = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : '';
        const attrPart = commaIdx !== -1 ? line.slice(0, commaIdx) : line;
        const logo = (attrPart.match(/tvg-logo="([^"]+)"/i) || [])[1] || '';
        const group = (attrPart.match(/group-title="([^"]+)"/i) || [])[1] || 'Minha Lista M3U';
        const chno = (attrPart.match(/tvg-chno="(\d+)"/i) || [])[1] || '';
        const lang = (attrPart.match(/tvg-language="([^"]+)"/i) || [])[1] || '';
        pending = { title, logo, group, chno, lang };
      } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
        const meta = pending || {};
        pending = null;
        let num = meta.chno && !usedNums.has(meta.chno) ? meta.chno : String(parsed.length + 1);
        while (usedNums.has(num)) num = String(Number(num) + 1);
        usedNums.add(num);
        const pal = M3U_PALETTES[parsed.length % M3U_PALETTES.length];
        const chName = meta.title || `Canal ${num}`;
        const guessLang = meta.lang ? meta.lang.slice(0, 2).toLowerCase() : 'pt';
        parsed.push({
          num,
          name: chName,
          ccLang: guessLang,
          program: `${meta.group || 'M3U'} • Ao Vivo`,
          next: 'Ao Vivo',
          meta: `${meta.group || 'M3U'} • Canal ${num}`,
          streamUrl: line,
          iconSrc: meta.logo || 'icons/plutotv.jpg',
          appId: 'plutotv',
          bg: pal.bg,
          orbs: pal.orbs
        });
      }
    }
    return parsed;
  }

  function loadLiveChannels() {
    try {
      ['iristv-custom-m3u-v1', 'iristv-custom-m3u-v2', 'iristv-custom-m3u-v3', 'iristv-custom-m3u-v4', 'iristv-custom-m3u-v5', 'iristv-custom-m3u-v6', 'iristv-custom-m3u-v7', 'iristv-custom-m3u-v8'].forEach((k) => localStorage.removeItem(k));
      const saved = JSON.parse(localStorage.getItem('iristv-custom-m3u-v9') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (_) { }
    return DEFAULT_LIVE_CHANNELS;
  }

  let LIVE_CHANNELS = loadLiveChannels();

  function loadContinueWatching() {
    try {
      const saved = JSON.parse(localStorage.getItem('iristv-continue-v1') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (_) {
      return [];
    }
  }

  const CONTINUE_WATCHING = loadContinueWatching();

  function recordContinueWatching(entry) {
    if (!entry || !entry.title || entry.isLive) return;
    const id = entry.id || `cw-${String(entry.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    const nextItem = {
      id,
      title: entry.title,
      sub: entry.sub || entry.appName || 'Reproduzido recentemente',
      streamUrl: entry.streamUrl || '',
      appName: entry.appName || 'Mídia',
      appId: entry.appId || 'mediaplayer',
      progress: Math.max(5, Math.min(98, Math.round(entry.progress || 12))),
      thumb: entry.thumb || entry.bgImg || 'logo.svg',
      glow: entry.glow || 'rgba(0, 194, 255, 0.5)',
      orbs: entry.orbs || ['rgba(0, 194, 255, 0.45)', 'rgba(155, 77, 255, 0.4)', 'rgba(255, 45, 111, 0.35)']
    };
    const idx = CONTINUE_WATCHING.findIndex((c) => c.id === id);
    if (idx !== -1) CONTINUE_WATCHING.splice(idx, 1);
    CONTINUE_WATCHING.unshift(nextItem);
    if (CONTINUE_WATCHING.length > 12) CONTINUE_WATCHING.length = 12;
    try { localStorage.setItem('iristv-continue-v1', JSON.stringify(CONTINUE_WATCHING)); } catch (_) { }
  }
  window.recordIrisContinueWatching = recordContinueWatching;

  /* =========================================================
     DOM References
     ========================================================= */
  const bootScreen = document.getElementById('boot-screen');
  const skipBootBtn = document.getElementById('skip-boot-btn');
  const tvShell = document.getElementById('tv-shell');
  const ambientBackdropImg = document.getElementById('ambient-backdrop-img');
  const orb1 = document.getElementById('orb-1');
  const orb2 = document.getElementById('orb-2');
  const orb3 = document.getElementById('orb-3');

  const heroSection = document.getElementById('hero-section');
  const heroKicker = document.getElementById('hero-kicker');
  const heroTitle = document.getElementById('hero-title');
  const heroMeta = document.getElementById('hero-meta');
  const heroSubtitle = document.getElementById('hero-subtitle');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroPlayLabel = document.getElementById('hero-play-label');
  const heroListBtn = document.getElementById('hero-list-btn');
  const heroFavLabel = document.getElementById('hero-fav-label');
  const spotlightVisual = document.getElementById('spotlight-visual');
  const spotlightImg = document.getElementById('spotlight-img');

  const rowsContainer = document.getElementById('rows-container');
  const navPills = document.querySelectorAll('.nav-pill[data-tab]');
  const liveClock = document.getElementById('live-clock');
  const liveDate = document.getElementById('live-date');

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeCurrentLabel = document.getElementById('theme-current-label');
  const themePopover = document.getElementById('theme-popover');

  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  const profileOverlay = document.getElementById('profile-overlay');
  const profilesGrid = document.getElementById('profiles-grid');
  const currentAvatar = document.getElementById('current-avatar');

  const appStageOverlay = document.getElementById('app-stage-overlay');
  const appStageWindow = document.getElementById('app-stage-window');
  const appStageBrand = document.getElementById('app-stage-brand');
  const appStageBody = document.getElementById('app-stage-body');

  const toastPill = document.getElementById('toast-pill');
  let toastTimer = null;

  /* =========================================================
     Theme System
     ========================================================= */
  function applyTheme(themeKey, notify = false) {
    const t = THEMES[themeKey] ? themeKey : 'prism';
    state.theme = t;
    document.body.classList.remove('theme-prism', 'theme-light', 'theme-oled', 'theme-aurora');
    document.body.classList.add(`theme-${t}`);
    localStorage.setItem('irisos-theme', t);
    if (themeCurrentLabel) themeCurrentLabel.textContent = THEMES[t].label;

    document.querySelectorAll('.theme-option').forEach((opt) => {
      opt.classList.toggle('active', opt.dataset.theme === t);
    });

    setAmbientOrbs(THEMES[t].orbs);
    applyGlassTransparency();
    if (state.activeTab === 'settings') renderSettingsWorkspace();
    if (notify) showToast(`Tema: ${THEMES[t].label}`);
  }

  themeToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('move');
    const wasHidden = themePopover?.classList.contains('hidden');
    closeTelemetryPopovers();
    if (wasHidden && themePopover) {
      themePopover.classList.remove('hidden');
      themeToggleBtn.setAttribute('aria-expanded', 'true');
    }
  });

  document.querySelectorAll('.theme-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      playUiSound('select');
      applyTheme(opt.dataset.theme, true);
      closeTelemetryPopovers();
    });
  });

  /* =========================================================
     Interactive Topbar Sound, Wi-Fi Menu & Calendar Popover
     ========================================================= */
  const soundTriggerBtn = document.getElementById('sound-trigger-btn');
  const topbarSoundIcon = document.getElementById('topbar-sound-icon');
  const topbarSoundLabel = document.getElementById('topbar-sound-label');
  const soundPopover = document.getElementById('sound-popover');
  const soundPopoverVal = document.getElementById('sound-popover-val');
  const soundPopoverMuteBtn = document.getElementById('sound-popover-mute-btn');
  const soundPopoverMuteSvg = document.getElementById('sound-popover-mute-svg');
  const soundPopoverRange = document.getElementById('sound-popover-range');

  let lastActiveVolume = 70;

  function syncSoundPillUi(vol, isMuted) {
    const cleanVol = Math.max(0, Math.min(100, Math.round(Number(vol) || 0)));
    const muted = Boolean(isMuted) || cleanVol === 0;

    if (topbarSoundLabel) {
      topbarSoundLabel.textContent = muted ? 'Mudo' : `${cleanVol}%`;
    }
    if (soundTriggerBtn) {
      soundTriggerBtn.title = muted ? 'Controle de Som (Mudo)' : `Controle de Som (${cleanVol}%)`;
    }
    if (topbarSoundIcon) {
      if (muted) {
        topbarSoundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
      } else if (cleanVol < 50) {
        topbarSoundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
      } else {
        topbarSoundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
      }
    }
    if (soundPopoverVal) {
      soundPopoverVal.textContent = muted ? 'Mudo' : `${cleanVol}%`;
    }
    if (soundPopoverRange) {
      soundPopoverRange.value = muted ? 0 : cleanVol;
    }
    if (soundPopoverMuteSvg) {
      if (muted) {
        soundPopoverMuteSvg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
      } else {
        soundPopoverMuteSvg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
      }
    }
  }

  // Padrão do sistema: MUDO
  syncSoundPillUi(0, true);

  const wifiTriggerBtn = document.getElementById('wifi-trigger-btn');
  const wifiPopover = document.getElementById('wifi-popover');
  const topbarWifiDot = document.getElementById('topbar-wifi-dot');
  const offlineGateOverlay = document.getElementById('offline-gate-overlay');
  const offlineWifiContainer = document.getElementById('offline-wifi-container');
  const calendarTriggerBtn = document.getElementById('calendar-trigger-btn');
  const calendarPopover = document.getElementById('calendar-popover');
  const topbarWeatherBtn = document.getElementById('topbar-weather-btn');
  const topbarWeatherIcon = document.getElementById('topbar-weather-icon');
  const topbarWeatherTemp = document.getElementById('topbar-weather-temp');

  let calCursorDate = new Date();
  let calSelectedIso = '';
  let calClockTimer = null;
  let wifiSelectedSsid = '';
  let wifiConnecting = false;
  let wifiState = null;

  function closeTelemetryPopovers() {
    if (themePopover && !themePopover.classList.contains('hidden')) {
      themePopover.classList.add('hidden');
      themeToggleBtn?.setAttribute('aria-expanded', 'false');
    }
    if (soundPopover && !soundPopover.classList.contains('hidden')) {
      soundPopover.classList.add('hidden');
      soundTriggerBtn?.setAttribute('aria-expanded', 'false');
    }
    if (wifiPopover && !wifiPopover.classList.contains('hidden')) {
      wifiPopover.classList.add('hidden');
      wifiTriggerBtn?.setAttribute('aria-expanded', 'false');
      if (wifiPollTimer) { clearInterval(wifiPollTimer); wifiPollTimer = null; }
    }
    if (calendarPopover && !calendarPopover.classList.contains('hidden')) {
      calendarPopover.classList.add('hidden');
      calendarTriggerBtn?.setAttribute('aria-expanded', 'false');
      if (calClockTimer) { clearInterval(calClockTimer); calClockTimer = null; }
    }
  }

  function formatIsoDate(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function renderCalendarPopover() {
    if (!calendarPopover) return;
    const now = new Date();
    const todayIso = formatIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
    if (!calSelectedIso) calSelectedIso = todayIso;

    const year = calCursorDate.getFullYear();
    const month = calCursorDate.getMonth();
    const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = firstWeekday - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, outside: true, iso: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, outside: false, iso: formatIsoDate(year, month, d) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: cells.length - (firstWeekday + daysInMonth) + 1, outside: true, iso: '' });
    }

    const [sy, sm, sd] = calSelectedIso.split('-').map(Number);
    const selLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(sy, (sm || 1) - 1, sd || 1));

    calendarPopover.innerHTML = `
      <div class="cal-pop-head">
        <div class="cal-pop-now">
          <strong id="cal-live-hms">${now.toLocaleTimeString('pt-BR')}</strong>
          <span>${escHtml(selLabel)}</span>
        </div>
        <button id="cal-today-btn" class="stg-btn" type="button">Hoje</button>
      </div>
      <div class="cal-month-nav">
        <button id="cal-prev-m" class="cal-nav-btn" type="button" aria-label="Mês anterior">‹</button>
        <strong>${escHtml(monthName)}</strong>
        <button id="cal-next-m" class="cal-nav-btn" type="button" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal-weekdays">
        <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
      </div>
      <div class="cal-grid">
        ${cells.map((c) => {
      const isToday = c.iso === todayIso;
      const isSel = c.iso === calSelectedIso;
      return `<button type="button" class="cal-day ${c.outside ? 'is-out' : ''} ${isToday ? 'is-today' : ''} ${isSel ? 'is-selected' : ''}" ${c.iso ? `data-cal-iso="${c.iso}"` : 'disabled'}>${c.day}</button>`;
    }).join('')}
      </div>
    `;

    calendarPopover.querySelector('#cal-prev-m')?.addEventListener('click', (e) => {
      e.stopPropagation();
      calCursorDate = new Date(year, month - 1, 1);
      renderCalendarPopover();
    });
    calendarPopover.querySelector('#cal-next-m')?.addEventListener('click', (e) => {
      e.stopPropagation();
      calCursorDate = new Date(year, month + 1, 1);
      renderCalendarPopover();
    });
    calendarPopover.querySelector('#cal-today-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const dNow = new Date();
      calCursorDate = new Date(dNow.getFullYear(), dNow.getMonth(), 1);
      calSelectedIso = formatIsoDate(dNow.getFullYear(), dNow.getMonth(), dNow.getDate());
      renderCalendarPopover();
    });
    calendarPopover.querySelectorAll('[data-cal-iso]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        calSelectedIso = btn.dataset.calIso;
        playUiSound('move');
        renderCalendarPopover();
      });
    });
  }

  let offlineGatePollTimer = null;

  function isSystemOnline(info = wifiState) {
    if (navigator.onLine === false) return false;
    if (info && typeof info === 'object') {
      return Boolean(info.powerOn && (info.isAssociated || info.connectedSsid));
    }
    return Boolean(navigator.onLine);
  }

  function syncOfflineGate(online) {
    if (!offlineGateOverlay) return;
    const wasHidden = offlineGateOverlay.classList.contains('hidden');
    if (!online) {
      offlineGateOverlay.classList.remove('hidden');
      if (playerVideo && !cinemaPlayer.classList.contains('hidden')) {
        try { playerVideo.pause(); } catch (_) { }
      }
      renderWifiWidgetInto(offlineWifiContainer, 'gate');
      if (!offlineGatePollTimer) {
        offlineGatePollTimer = setInterval(() => {
          const isBusyTyping = Boolean(
            wifiSelectedSsid ||
            (document.activeElement && offlineGateOverlay.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') ||
            (irisOskEl && !irisOskEl.classList.contains('hidden'))
          );
          if (!wifiConnecting && !isBusyTyping && !offlineGateOverlay.classList.contains('hidden')) {
            refreshWifiStatus(false, true);
          }
        }, 6000);
      }
      if (wasHidden) {
        setTimeout(() => ensureScopeFocus(), 40);
      }
    } else {
      if (offlineGatePollTimer) {
        clearInterval(offlineGatePollTimer);
        offlineGatePollTimer = null;
      }
      if (!wasHidden) {
        offlineGateOverlay.classList.add('hidden');
        playUiSound('chime');
        showToast('Conexão com a internet estabelecida!');
        setTimeout(() => ensureScopeFocus(), 40);
      }
    }
  }

  function updateTopbarWifiIndicator(info) {
    const online = isSystemOnline(info);
    if (topbarWifiDot) {
      topbarWifiDot.classList.toggle('is-online', online);
      topbarWifiDot.classList.toggle('is-offline', !online);
    }
    syncOfflineGate(online);
  }

  window.addEventListener('offline', () => updateTopbarWifiIndicator(wifiState));
  window.addEventListener('online', () => refreshWifiStatus(false, false));

  function wifiBarsSvg(rssi) {
    const bars = rssi > -58 ? 3 : (rssi > -72 ? 2 : 1);
    return `<svg class="wifi-sig-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M2 9a15 15 0 0 1 20 0" opacity="${bars >= 3 ? 1 : 0.22}"/>
      <path d="M5.5 13a10 10 0 0 1 13 0" opacity="${bars >= 2 ? 1 : 0.22}"/>
      <path d="M9 17a5 5 0 0 1 6 0" opacity="1"/>
      <circle cx="12" cy="20.2" r="1" fill="currentColor"/>
    </svg>`;
  }

  let wifiPollTimer = null;
  const wifiDraftPasswords = {};
  const wifiManualDraft = { ssid: '', pass: '' };

  function renderWifiWidgetInto(container, idSuffix = 'pop') {
    if (!container) return;
    const d = wifiState;
    if (!d) {
      container.innerHTML = `
        <div class="wifi-pop-head">
          <div><strong>Wi-Fi</strong><small>Buscando redes…</small></div>
          <div class="wifi-head-actions"><button class="cal-nav-btn wifi-rescan-btn is-spinning" type="button">↻</button></div>
        </div>
        <div class="wifi-pop-loading">Procurando redes Wi-Fi próximas…</div>
      `;
      return;
    }

    const activeLabel = !d.powerOn
      ? 'Wi-Fi Desligado'
      : (d.connectedSsid
        ? `Conectado a ${d.connectedSsid}`
        : (d.isAssociated ? `Conectado via Cabo • IP ${d.ip || 'Local'}` : 'Desconectado'));

    const networks = Array.isArray(d.networks) ? d.networks : [];

    container.innerHTML = `
      <div class="wifi-pop-head">
        <div>
          <strong>Redes Wi-Fi Disponíveis</strong>
          <small>${escHtml(activeLabel)}</small>
        </div>
        <div class="wifi-head-actions">
          <button class="cal-nav-btn wifi-rescan-btn" data-wifi-act="rescan" type="button" title="Atualizar redes agora">↻</button>
          <button class="stg-btn ${d.powerOn ? 'is-on' : ''}" data-wifi-act="power" type="button">${d.powerOn ? 'Ligado' : 'Desligado'}</button>
        </div>
      </div>

      ${d.powerOn ? `
        <div class="wifi-nets-list">
          ${networks.length ? networks.map((n) => {
      const isSel = wifiSelectedSsid === n.ssid;
      const isConn = Boolean(n.connected || (d.connectedSsid && d.connectedSsid === n.ssid));
      const draftVal = wifiDraftPasswords[n.ssid] || '';
      return `
              <div class="wifi-net-wrap">
                <button type="button" class="wifi-net-row ${isConn ? 'is-connected' : ''} ${isSel ? 'is-selected' : ''}" data-wifi-ssid="${escHtml(n.ssid)}" data-wifi-secure="${n.secure ? '1' : '0'}" data-wifi-conn="${isConn ? '1' : '0'}">
                  <span class="wifi-net-left">
                    ${wifiBarsSvg(n.rssi)}
                    <span class="wifi-net-name">${escHtml(n.ssid)}</span>
                  </span>
                  <span class="wifi-net-right">
                    ${isConn ? '<span class="wifi-conn-badge">Conectado</span>' : (n.saved ? '<span class="wifi-saved-badge">Salva</span>' : '')}
                    ${n.secure ? '<span class="wifi-lock" title="Protegida por senha"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>' : ''}
                  </span>
                </button>
                ${isConn && isSel ? `
                  <div class="wifi-conn-panel">
                    <div class="wifi-conn-panel-title">Rede Atual Conectada</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);">IP: <strong>${escHtml(d.ip || 'Obtido via DHCP')}</strong> • Sinal: ${n.rssi} dBm</div>
                    <div class="wifi-btn-row">
                      <button type="button" class="wifi-disconnect-btn" data-action="disconnect">Desconectar desta rede</button>
                      <button type="button" class="stg-btn" data-action="close-panel" style="font-size:0.76rem;padding:4px 10px;">Fechar</button>
                    </div>
                  </div>
                ` : ''}
                ${!isConn && isSel ? `
                  <div class="wifi-conn-panel" data-wifi-form="${escHtml(n.ssid)}">
                    <div class="wifi-conn-panel-title">Conectar a <strong>${escHtml(n.ssid)}</strong></div>
                    <div class="wifi-input-row">
                      <input type="text" id="wifi-pass-${idSuffix}-${escHtml(n.ssid)}" data-ssid="${escHtml(n.ssid)}" value="${escHtml(draftVal)}" class="shows-search-input wifi-pass-input wifi-masked-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" placeholder="${n.saved ? 'Senha salva (ou digite nova)' : 'Senha do Wi-Fi'}" />
                      <button type="button" class="stg-btn wifi-toggle-pass-btn" title="Mostrar/ocultar senha">Ver</button>
                      <button type="button" class="stg-btn wifi-osk-btn" title="Abrir teclado na tela">Teclado</button>
                    </div>
                    <div class="wifi-btn-row">
                      <button type="button" class="stg-btn" data-action="close-panel" style="font-size:0.78rem;padding:6px 12px;">Cancelar</button>
                      <button type="button" class="btn-prism wifi-submit-btn" style="height:34px;padding:0 16px;font-size:0.78rem;" ${wifiConnecting ? 'disabled' : ''}>
                        ${wifiConnecting ? 'Conectando…' : 'Conectar'}
                      </button>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
    }).join('') : `<div class="wifi-pop-loading">Nenhuma rede sem fio encontrada no momento. Clique em ↻ para buscar novamente.</div>`}
        </div>
        <div class="wifi-manual-form">
          <input class="shows-search-input wifi-manual-ssid-inp" type="text" value="${escHtml(wifiManualDraft.ssid)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Outro Wi-Fi (SSID)…" />
          <input class="shows-search-input wifi-masked-input wifi-manual-pass-inp" type="text" value="${escHtml(wifiManualDraft.pass)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" placeholder="Senha" />
          <button type="button" class="stg-btn wifi-manual-submit-btn" ${wifiConnecting ? 'disabled' : ''}>Entrar</button>
        </div>
      ` : `<div class="wifi-pop-loading">Ligue o Wi-Fi acima para ver e conectar às redes disponíveis.</div>`}
    `;

    const doConnect = async (ssid, password) => {
      if (!ssid || wifiConnecting) return;
      wifiConnecting = true;
      showToast(`Conectando a ${ssid}…`);
      renderWifiPopover();
      try {
        const res = await fetch('/api/wifi/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid, password })
        });
        const j = await res.json();
        if (j.ok) {
          showToast(`Conectado com sucesso a ${ssid}!`);
          delete wifiDraftPasswords[ssid];
          wifiSelectedSsid = '';
        } else {
          showToast(j.error || 'Falha ao conectar. Verifique a senha.');
        }
      } catch (_) {
        showToast('Erro ao comunicar com a placa de rede');
      } finally {
        wifiConnecting = false;
        refreshWifiStatus(false, true);
      }
    };

    container.querySelector('[data-wifi-act="rescan"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playUiSound('move');
      const btn = e.currentTarget;
      btn?.classList.add('is-spinning');
      refreshWifiStatus(true, true).finally(() => btn?.classList.remove('is-spinning'));
    });

    container.querySelector('[data-wifi-act="power"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      playUiSound('select');
      const next = !d.powerOn;
      try {
        await fetch('/api/wifi/power', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: next })
        });
        showToast(next ? 'Wi-Fi ativado' : 'Wi-Fi desativado');
        setTimeout(() => refreshWifiStatus(false, true), 600);
      } catch (_) { }
    });

    container.querySelectorAll('[data-wifi-ssid]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ssid = btn.dataset.wifiSsid;
        const isSecure = btn.dataset.wifiSecure === '1';
        const isConn = btn.dataset.wifiConn === '1';

        if (!isSecure && !isConn) {
          playUiSound('select');
          doConnect(ssid, '');
          return;
        }

        wifiSelectedSsid = wifiSelectedSsid === ssid ? '' : ssid;
        playUiSound('move');
        renderWifiPopover();
        const passInput = container.querySelector('.wifi-pass-input');
        if (passInput) {
          passInput.focus();
          const len = passInput.value.length;
          try { passInput.setSelectionRange(len, len); } catch (_) { }
        }
      });
    });

    container.querySelectorAll('.wifi-pass-input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const ssid = inp.dataset.ssid || wifiSelectedSsid;
        if (ssid) wifiDraftPasswords[ssid] = inp.value;
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const ssid = inp.dataset.ssid || wifiSelectedSsid;
          doConnect(ssid, inp.value || '');
        }
      });
    });

    const manualSsidInp = container.querySelector('.wifi-manual-ssid-inp');
    const manualPassInp = container.querySelector('.wifi-manual-pass-inp');
    manualSsidInp?.addEventListener('input', () => { wifiManualDraft.ssid = manualSsidInp.value; });
    manualPassInp?.addEventListener('input', () => { wifiManualDraft.pass = manualPassInp.value; });
    const submitManual = () => {
      const ssid = manualSsidInp?.value?.trim();
      const pass = manualPassInp?.value || '';
      if (ssid) doConnect(ssid, pass);
    };
    manualSsidInp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitManual(); }
    });
    manualPassInp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitManual(); }
    });
    container.querySelector('.wifi-manual-submit-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      submitManual();
    });

    container.querySelectorAll('[data-action="close-panel"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        wifiSelectedSsid = '';
        renderWifiPopover();
      });
    });

    container.querySelectorAll('[data-action="disconnect"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        playUiSound('select');
        try {
          await fetch('/api/wifi/disconnect', { method: 'POST' });
          showToast('Wi-Fi desconectado');
          wifiSelectedSsid = '';
          setTimeout(() => refreshWifiStatus(false, true), 500);
        } catch (_) { }
      });
    });

    container.querySelectorAll('.wifi-toggle-pass-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const inp = btn.closest('.wifi-input-row')?.querySelector('input');
        if (inp) {
          const unmasked = inp.classList.toggle('is-unmasked');
          btn.textContent = unmasked ? 'Ocultar' : 'Ver';
          inp.focus();
          const len = inp.value.length;
          try { inp.setSelectionRange(len, len); } catch (_) { }
        }
      });
    });

    container.querySelectorAll('.wifi-osk-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const inp = btn.closest('.wifi-input-row')?.querySelector('input');
        if (inp) openOnScreenKeyboard(inp, 'Senha do Wi-Fi');
      });
    });

    container.querySelectorAll('[data-wifi-form]').forEach((form) => {
      form.querySelector('.wifi-submit-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ssid = form.dataset.wifiForm;
        const pass = form.querySelector('input')?.value || '';
        doConnect(ssid, pass);
      });
    });
  }

  function renderWifiPopover() {
    renderWifiWidgetInto(wifiPopover, 'pop');
    if (offlineGateOverlay && !offlineGateOverlay.classList.contains('hidden')) {
      renderWifiWidgetInto(offlineWifiContainer, 'gate');
    }
  }

  async function refreshWifiStatus(showLoading = false, scanRadio = false) {
    const hadState = Boolean(wifiState);
    if (showLoading) {
      wifiState = null;
      renderWifiPopover();
    }
    try {
      const r = await fetch(`/api/wifi/status${scanRadio ? '?scan=1' : ''}`);
      const j = await r.json();
      if (j && j.ok) {
        wifiState = j;
        updateTopbarWifiIndicator(j);
        const popOpen = wifiPopover && !wifiPopover.classList.contains('hidden');
        const gateOpen = offlineGateOverlay && !offlineGateOverlay.classList.contains('hidden');
        if (popOpen || gateOpen) {
          const isTypingWifi = Boolean(
            wifiSelectedSsid ||
            (document.activeElement && (wifiPopover?.contains(document.activeElement) || offlineGateOverlay?.contains(document.activeElement)) && document.activeElement.tagName === 'INPUT') ||
            (irisOskEl && !irisOskEl.classList.contains('hidden'))
          );
          if (!isTypingWifi || !hadState || showLoading) {
            renderWifiPopover();
          }
        }
      }
    } catch (_) { }
  }

  soundTriggerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('move');
    const wasHidden = soundPopover.classList.contains('hidden');
    closeTelemetryPopovers();
    if (wasHidden) {
      soundPopover.classList.remove('hidden');
      soundTriggerBtn.setAttribute('aria-expanded', 'true');
      const curAudio = state.systemInfo?.audio || {};
      const curVol = typeof curAudio.outputVolume === 'number' ? curAudio.outputVolume : 0;
      const curMuted = typeof curAudio.muted === 'boolean' ? curAudio.muted : true;
      syncSoundPillUi(curVol, curMuted);
      soundPopoverRange?.focus();
    }
  });

  soundPopoverMuteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('select');
    adjustSystemVolume(0, true);
  });

  soundPopoverRange?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    const curAudio = state.systemInfo?.audio || {};
    const curVol = typeof curAudio.outputVolume === 'number' ? curAudio.outputVolume : 0;
    adjustSystemVolume(v - curVol, false);
  });

  wifiTriggerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('move');
    const wasHidden = wifiPopover.classList.contains('hidden');
    closeTelemetryPopovers();
    if (wasHidden) {
      wifiPopover.classList.remove('hidden');
      wifiTriggerBtn.setAttribute('aria-expanded', 'true');
      renderWifiPopover();
      refreshWifiStatus(!wifiState, true);
      if (wifiPollTimer) clearInterval(wifiPollTimer);
      wifiPollTimer = setInterval(() => {
        const isBusyTyping = Boolean(
          wifiSelectedSsid ||
          (document.activeElement && wifiPopover.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') ||
          (irisOskEl && !irisOskEl.classList.contains('hidden'))
        );
        if (!wifiConnecting && !isBusyTyping && wifiPopover && !wifiPopover.classList.contains('hidden')) {
          refreshWifiStatus(false, true);
        }
      }, 8000);
    }
  });

  calendarTriggerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('move');
    const wasHidden = calendarPopover.classList.contains('hidden');
    closeTelemetryPopovers();
    if (wasHidden) {
      calendarPopover.classList.remove('hidden');
      calendarTriggerBtn.setAttribute('aria-expanded', 'true');
      const n = new Date();
      calCursorDate = new Date(n.getFullYear(), n.getMonth(), 1);
      calSelectedIso = formatIsoDate(n.getFullYear(), n.getMonth(), n.getDate());
      renderCalendarPopover();
      if (calClockTimer) clearInterval(calClockTimer);
      calClockTimer = setInterval(() => {
        const hms = document.getElementById('cal-live-hms');
        if (hms) hms.textContent = new Date().toLocaleTimeString('pt-BR');
      }, 1000);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#unified-telemetry-pill')) {
      closeTelemetryPopovers();
    }
  });

  /* =========================================================
     Real Downloaded UI Sound Effects (MP3 Pool) & Ambient Orbs
     ========================================================= */
  const SOUND_PACK = {
    move: { src: 'sounds/move.mp3?v=material2', vol: 0.55 },
    select: { src: 'sounds/select.mp3?v=material2', vol: 0.65 },
    back: { src: 'sounds/back.mp3?v=material2', vol: 0.62 },
    open: { src: 'sounds/open.mp3?v=material2', vol: 0.65 },
    chime: { src: 'sounds/chime.mp3?v=material2', vol: 0.65 }
  };

  const soundPool = new Map();
  Object.entries(SOUND_PACK).forEach(([key, cfg]) => {
    const audio = new Audio(cfg.src);
    audio.preload = 'auto';
    audio.volume = cfg.vol;
    soundPool.set(key, { base: audio, vol: cfg.vol });
  });

  function playUiSound(type) {
    if (!state.soundEnabled) return;
    const entry = soundPool.get(type) || soundPool.get('select');
    if (!entry) return;
    try {
      const volMult = (state.settings.soundVolume / 100) * (state.settings.nightSound ? 0.55 : 1);
      const inst = entry.base.cloneNode(true);
      inst.volume = Math.max(0, Math.min(1, entry.vol * volMult));
      const p = inst.play();
      if (p && typeof p.catch === 'function') p.catch(() => { });
    } catch (_) { }
  }

  function showToast(msg) {
    toastPill.textContent = msg;
    toastPill.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastPill.classList.add('hidden'), 2000);
  }

  function setAmbientOrbs(colors) {
    if (!colors || colors.length < 3) return;
    orb1.style.background = `radial-gradient(circle, ${colors[0]} 0%, transparent 70%)`;
    orb2.style.background = `radial-gradient(circle, ${colors[1]} 0%, transparent 70%)`;
    orb3.style.background = `radial-gradient(circle, ${colors[2]} 0%, transparent 72%)`;
  }

  /* =========================================================
     Boot Sequence (Cinematic 3s Hardware-Accelerated Startup)
     ========================================================= */
  let bootFinished = false;
  function finishBoot(instant = false) {
    if (bootFinished) return;
    if (typeof mountHomeNow === 'function') mountHomeNow();
    sessionStorage.setItem('irisos-booted', '1');
    const maybeOnboard = async () => {
      if (localStorage.getItem('iristv-onboarded') === '1') return;
      try {
        const r = await fetch('/api/os/ui-state', { cache: 'no-store' });
        if (r.ok) {
          const data = await r.json();
          if (data?.state?.onboarded) {
            localStorage.setItem('iristv-onboarded', '1');
            applyUserPreferences();
            return;
          }
        }
      } catch (_) {}
      openOnboarding();
    };
    if (instant) {
      bootFinished = true;
      bootScreen.classList.add('hidden', 'fade-out');
      tvShell.classList.remove('is-hidden');
      maybeOnboard();
      setTimeout(() => ensureScopeFocus(), 30);
      return;
    }
    if (bootScreen.classList.contains('fade-out')) return;
    bootFinished = true;
    bootScreen.classList.add('fade-out');
    tvShell.classList.remove('is-hidden');
    setTimeout(() => {
      bootScreen.classList.add('hidden');
      maybeOnboard();
      setTimeout(() => ensureScopeFocus(), 30);
    }, 220);
  }

  function replayBoot() {
    closeAppStage();
    bootFinished = false;
    bootScreen.classList.remove('hidden', 'fade-out');
    const wrap = bootScreen.querySelector('.boot-logo-wrap');
    wrap.replaceWith(wrap.cloneNode(true));
    setTimeout(() => finishBoot(false), 3000);
  }

  skipBootBtn?.addEventListener('click', () => finishBoot(false));
  bootScreen?.addEventListener('click', () => finishBoot(false));

  /* =========================================================
     Clock, Date, Real System Settings & Idle Screensaver
     ========================================================= */
  let clockIntervalId = null;
  let idleTimerId = null;
  const silkWavesEl = document.querySelector('.silk-waves');

  function formatTvTime(date = new Date()) {
    const opts = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !state.settings.clock24h
    };
    if (state.settings.showSeconds) opts.second = '2-digit';
    return date.toLocaleTimeString('pt-BR', opts);
  }

  let lastAutoNightState = null;

  function isAutoNightWindow(date = new Date()) {
    const h = date.getHours();
    return h >= 22 || h < 6;
  }

  function updateClock() {
    const now = new Date();
    liveClock.textContent = formatTvTime(now);
    liveDate.textContent = now.toLocaleDateString('pt-BR', { weekday: 'short', month: 'short', day: 'numeric' });
    liveDate.classList.toggle('hidden', !state.settings.showDate);
    const previewEl = document.getElementById('stg-clock-live');
    if (previewEl) previewEl.textContent = formatTvTime(now);
    if (state.settings.autoNightMode) {
      const activeNow = isAutoNightWindow(now);
      if (lastAutoNightState !== null && lastAutoNightState !== activeNow) {
        lastAutoNightState = activeNow;
        applyAllSettings();
      }
      lastAutoNightState = activeNow;
    } else {
      lastAutoNightState = null;
    }
  }

  function restartClockTimer() {
    clearInterval(clockIntervalId);
    updateClock();
    clockIntervalId = setInterval(updateClock, state.settings.showSeconds ? 1000 : 15000);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimerId);
    const mins = Number(state.settings.screensaverMinutes) || 0;
    if (mins <= 0) return;
    idleTimerId = setTimeout(() => {
      if (cinemaPlayer && cinemaPlayer.classList.contains('hidden') && screensaverOverlay && screensaverOverlay.classList.contains('hidden')) {
        openScreensaver();
      }
    }, mins * 60000);
  }

  ['pointerdown', 'pointermove', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, resetIdleTimer, { passive: true });
  });

  let currentAmbientWpUrl = '';
  let activeAmbientLayer = 'a';
  let activeShowBannerUrl = '';
  let ambientWpCleanupTimer = null;

  function setMainWallpaperUrl(url, fastFade = false) {
    if (!url || url === currentAmbientWpUrl) return;
    currentAmbientWpUrl = url;
    const root = document.documentElement;
    root.classList.toggle('fast-wallpaper-fade', !!fastFade);
    const layerA = document.getElementById('ambient-wp-a');
    const layerB = document.getElementById('ambient-wp-b');
    if (layerA && layerB) {
      clearTimeout(ambientWpCleanupTimer);
      const nextLayer = activeAmbientLayer === 'a' ? layerB : layerA;
      const currLayer = activeAmbientLayer === 'a' ? layerA : layerB;
      nextLayer.style.backgroundImage = `url("${url}")`;
      void nextLayer.offsetWidth;
      nextLayer.classList.add('is-active');
      currLayer.classList.remove('is-active');
      activeAmbientLayer = activeAmbientLayer === 'a' ? 'b' : 'a';
      // Liberar textura decodificada antiga da VRAM/heap logo apos o crossfade
      ambientWpCleanupTimer = setTimeout(() => {
        if (!currLayer.classList.contains('is-active')) {
          currLayer.style.backgroundImage = 'none';
        }
      }, 1250);
    } else {
      const ambientWpEl = document.getElementById('ambient-wallpaper-bg');
      if (ambientWpEl) ambientWpEl.style.backgroundImage = `url("${url}")`;
    }
    root.style.setProperty('--active-wallpaper-url', `url("${url}")`);
  }

  function updateMainScreenWallpaper(fastFade = false) {
    const activeId = state.settings.activeWallpaperId;
    const wp = activeWallpapersList.find((w) => w.id === activeId) || activeWallpapersList[0];
    if (state.settings.showBannersAsWallpaper) {
      const fallbackShow = TRENDING_SHOWS.find((s) => s.bgImg && s.id !== 'severance' && !/severance|ruptura/i.test(s.title || '')) || {};
      const bannerUrl = activeShowBannerUrl || fallbackShow.bgImg || wp?.path;
      if (bannerUrl) setMainWallpaperUrl(bannerUrl, fastFade);
      return;
    }
    if (wp && wp.path) {
      setMainWallpaperUrl(wp.path, fastFade);
      const root = document.documentElement;
      const accent = wp.accent || '#00c2ff';
      const glow = wp.glow || 'rgba(0, 194, 255, 0.42)';
      root.style.setProperty('--wallpaper-accent', accent);
      root.style.setProperty('--wallpaper-glow', glow);
    }
  }

  const THEME_GLASS_RGB = {
    prism: { bg: '72, 88, 114', surface: '58, 72, 96' },
    light: { bg: '255, 255, 255', surface: '248, 250, 252' },
    oled: { bg: '14, 16, 22', surface: '10, 10, 14' },
    aurora: { bg: '10, 30, 38', surface: '8, 25, 33' }
  };

  function scaleGlassRgb(rgbStr, factor) {
    return rgbStr
      .split(',')
      .map((n) => Math.max(0, Math.min(255, Math.round(Number(n.trim()) * factor))))
      .join(', ');
  }

  function applyGlassTransparency() {
    const s = state.settings;
    const root = document.documentElement;
    const palette = THEME_GLASS_RGB[state.theme] || THEME_GLASS_RGB.prism;
    const brightFactor = Math.max(0.5, Math.min(1.8, Number(s.glassBrightness ?? 100) / 100));
    const bgRgb = scaleGlassRgb(palette.bg, brightFactor);
    const surfRgb = scaleGlassRgb(palette.surface, brightFactor);
    const enabled = s.glassTransparency !== false && Number(s.glassTransparencyLevel) > 0;
    root.classList.toggle('no-transparency', !enabled);
    if (!enabled) {
      root.style.setProperty('--glass-blur', '0px');
      root.style.setProperty('--glass-bg', `rgba(${bgRgb}, 1)`);
      root.style.setProperty('--glass-surface', `rgba(${surfRgb}, 1)`);
      root.style.setProperty('--glass-pill-bg', `rgba(${bgRgb}, 1)`);
      return;
    }
    const level = Math.max(0, Math.min(90, Number(s.glassTransparencyLevel ?? 45))) / 100;
    const bgAlpha = +(1 - level * 0.82).toFixed(3);
    const surfAlpha = +(1 - level * 0.65).toFixed(3);
    const autoBlur = Math.min(12, Math.round((level / 0.9) * 36)); // perf: blur alto custa muito de GPU
    const pillAlpha = state.theme === 'light'
      ? +(Math.max(0.28, Math.min(0.95, 0.68 * brightFactor))).toFixed(3)
      : +(Math.max(0.04, Math.min(0.42, 0.14 * Math.pow(brightFactor, 1.5)))).toFixed(3);
    const pillRgb = state.theme === 'light' ? '255, 255, 255' : '255, 255, 255';
    root.style.setProperty('--glass-blur', `${autoBlur}px`);
    root.style.setProperty('--glass-bg', `rgba(${bgRgb}, ${bgAlpha})`);
    root.style.setProperty('--glass-surface', `rgba(${surfRgb}, ${surfAlpha})`);
    root.style.setProperty('--glass-pill-bg', `rgba(${pillRgb}, ${pillAlpha})`);
  }

  let syncingSystemTheme = false;

  function resolveOsDarkMode() {
    if (state.systemInfo && typeof state.systemInfo.darkMode === 'boolean') {
      return state.systemInfo.darkMode;
    }
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  }

  function applyAllSettings() {
    const s = state.settings;
    const root = document.documentElement;
    if (s.autoSystemTheme && !syncingSystemTheme) {
      const osDark = resolveOsDarkMode();
      const targetTheme = osDark ? (state.theme === 'light' ? 'prism' : state.theme) : 'light';
      if (targetTheme !== state.theme) {
        syncingSystemTheme = true;
        applyTheme(targetTheme, false);
        syncingSystemTheme = false;
        return;
      }
    }
    updateMainScreenWallpaper();
    const pic = PICTURE_MODES[s.pictureMode] || PICTURE_MODES.standard;
    const autoNightActive = !!s.autoNightMode && isAutoNightWindow();
    const brightFactor = (s.brightness / 100)
      * (state.smartHome.ecoMode ? 0.86 : 1)
      * (autoNightActive && s.pictureMode !== 'night' ? 0.94 : 1);
    const contrastFactor = pic.contrast
      * ((Number(s.contrast ?? 100)) / 100)
      * (autoNightActive && s.pictureMode !== 'night' ? 0.96 : 1);
    const saturateFactor = pic.saturate * ((Number(s.saturation ?? 100)) / 100);
    const temp = s.colorTemp || 'neutral';
    const tempWarmth = temp === 'warm' ? 0.16 : 0;
    const warmthTotal = Math.min(0.45, pic.warmth + tempWarmth + (autoNightActive && s.pictureMode !== 'night' ? 0.24 : 0));
    const hueShift = temp === 'cool' ? '-8deg' : '0deg';

    const accent = ACCENT_COLORS[s.accentColor] || ACCENT_COLORS.cyan;
    const fontCfg = FONT_STYLES[s.fontStyle] || FONT_STYLES.modern;

    root.style.setProperty('--tv-brightness', brightFactor.toFixed(2));
    root.style.setProperty('--tv-contrast', contrastFactor.toFixed(2));
    root.style.setProperty('--tv-saturate', saturateFactor.toFixed(2));
    root.style.setProperty('--tv-warmth', warmthTotal.toFixed(2));
    root.style.setProperty('--tv-hue', hueShift);
    root.style.setProperty('--tv-safe-margin', `${Number(s.tvSafeMargin || 0)}vmin`);
    root.style.setProperty('--ambient-intensity', (s.ambientIntensity / 100).toFixed(2));
    applyGlassTransparency();
    root.style.setProperty('--card-radius', `${s.cardRadius}px`);
    root.style.setProperty('--accent-color', accent.hex);
    root.style.setProperty('--accent-glow', accent.glow);
    root.style.setProperty('--iris-cyan', accent.hex);
    root.style.setProperty('--ui-font-family', fontCfg.stack);
    if (s.focusStyle === 'accent' || s.focusStyle === 'glow' || (s.accentColor && s.accentColor !== 'cyan')) {
      root.style.setProperty('--focus-ring', accent.hex);
    } else if (state.theme === 'light') {
      root.style.setProperty('--focus-ring', 'rgba(16, 21, 38, 0.92)');
    } else {
      root.style.setProperty('--focus-ring', 'rgba(255, 255, 255, 0.92)');
    }
    root.dataset.gridDensity = s.gridDensity || 'comfortable';
    root.dataset.focusStyle = s.focusStyle || 'neutral';
    root.dataset.wallpaperDim = s.wallpaperDim || 'medium';
    root.dataset.lockClockStyle = s.lockClockStyle || 'corner';
    root.classList.toggle('hide-app-labels', !!s.hideAppLabels);
    root.classList.toggle('show-banners-mode', !!s.showBannersAsWallpaper);
    root.style.fontSize = `${(s.uiScale * 16).toFixed(2)}px`;
    if (heroSection) {
      heroSection.classList.toggle('hidden', state.activeTab !== 'home' || !!s.hideHeroBanner);
    }
    syncWallpaperAutoRotate();
    syncAutoHideTopbar();

    document.body.classList.toggle('has-custom-accent', s.accentColor !== 'cyan');
    document.body.classList.toggle('has-custom-font', s.fontStyle !== 'modern');
    const hasFilter = Math.abs(brightFactor - 1) > 0.01
      || Math.abs(contrastFactor - 1) > 0.01
      || Math.abs(saturateFactor - 1) > 0.01
      || warmthTotal > 0.005
      || temp === 'cool'
      || s.pictureMode !== 'standard';
    root.classList.toggle('has-picture-filter', hasFilter);
    root.classList.toggle('text-sharpness', !!s.textSharpness);
    root.classList.toggle('reduce-motion', !!s.reduceMotion);
    root.classList.toggle('high-contrast-focus', !!s.highContrastFocus);
    root.classList.toggle('no-kenburns', !s.kenBurns);
    root.classList.toggle('eco-mode', !!state.smartHome.ecoMode);

    if (silkWavesEl) silkWavesEl.classList.toggle('hidden', !s.silkWaves);

    state.soundEnabled = !!s.soundEnabled;
    if (!state.smartHome.ambilightSync) {
      setAmbientOrbs(THEMES[state.theme].orbs);
    }

    const rewBtn = document.getElementById('player-rew-btn');
    const fwdBtn = document.getElementById('player-fwd-btn');
    if (rewBtn) rewBtn.title = `Voltar ${s.seekStep}s`;
    if (fwdBtn) fwdBtn.title = `Avançar ${s.seekStep}s`;

    if (typeof IrisGpuManager !== 'undefined') {
      IrisGpuManager.applyPreference(s.gpuPreference || 'dedicated');
    }

    restartClockTimer();
    updateTopbarWeather();
    resetIdleTimer();
    saveSettings();
    saveSmartHome();
  }

  restartClockTimer();

  topbarWeatherBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('select');
    const weatherApp = APPS.find((a) => a.id === 'weather');
    if (weatherApp) launchApp(weatherApp);
  });

  function resolveWeatherMeta(code, isDay) {
    let icon = isDay ? 'sol.svg' : 'lua.svg';
    let label = isDay ? 'Céu Limpo' : 'Noite Limpa';
    if (code === 0) {
      icon = isDay ? 'sol.svg' : 'lua.svg';
      label = isDay ? 'Céu Limpo' : 'Noite Limpa';
    } else if (code === 1 || code === 2) {
      icon = isDay ? 'parcialmente-nublado.svg' : 'parcialmente-nublado-noite.svg';
      label = 'Parcialmente Nublado';
    } else if (code === 3) {
      icon = isDay ? 'nublado.svg' : 'encoberto.svg';
      label = isDay ? 'Nublado' : 'Encoberto';
    } else if (code === 45 || code === 48) {
      icon = 'neblina.svg';
      label = 'Neblina';
    } else if ([51, 53, 55, 56, 57].includes(code)) {
      icon = 'garoa.svg';
      label = 'Garoa';
    } else if ([61, 63, 80].includes(code)) {
      icon = isDay ? 'chuva.svg' : 'chuva-noite.svg';
      label = 'Chuva';
    } else if ([65, 66, 67, 81, 82].includes(code)) {
      icon = 'chuva-forte.svg';
      label = 'Chuva Forte';
    } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
      icon = 'neve.svg';
      label = 'Neve';
    } else if (code === 95) {
      icon = 'trovoada.svg';
      label = 'Trovoada';
    } else if ([96, 99].includes(code)) {
      icon = 'tempestade.svg';
      label = 'Tempestade';
    }
    return { icon, label };
  }

  function hydrateWeatherWidgetEl(btn) {
    if (!btn) return;
    const w = state.homeWeather;
    const city = w?.city || localStorage.getItem('iristv_weather_city') || 'São Paulo';
    const tempText = w ? `${w.temp}°` : '--°';
    const condText = w?.label || 'Carregando clima...';
    const iconSrc = w?.icon ? `icons/weather/${w.icon}` : 'icons/weather/parcialmente-nublado.svg';
    const feelsText = w && typeof w.feelsLike === 'number' ? `Sensação ${w.feelsLike}°` : 'Sensação --°';
    const humText = w && typeof w.humidity === 'number' ? `${w.humidity}%` : '--%';
    const windText = w && typeof w.wind === 'number' ? `${w.wind} km/h` : '-- km/h';

    btn.innerHTML = `
      <div class="weather-widget-specular" aria-hidden="true"></div>
      <div class="weather-widget-top">
        <div class="weather-widget-loc">
          <span class="weather-widget-badge">Clima Agora</span>
          <span class="weather-widget-city">${escHtml(city)}</span>
        </div>
        <img class="weather-widget-icon" src="${iconSrc}" alt="${escHtml(condText)}" />
      </div>
      <div class="weather-widget-main">
        <div class="weather-widget-temp">${tempText}</div>
        <div class="weather-widget-meta">
          <span class="weather-widget-cond">${escHtml(condText)}</span>
          <span class="weather-widget-feels">${feelsText}</span>
        </div>
      </div>
      <div class="weather-widget-footer">
        <span class="weather-widget-pill">Umidade ${humText}</span>
        <span class="weather-widget-pill">Vento ${windText}</span>
        <span class="weather-widget-action">Abrir Clima →</span>
      </div>
    `;
  }

  async function updateTopbarWeather() {
    if (!topbarWeatherIcon || !topbarWeatherTemp) return;
    try {
      const city = localStorage.getItem('iristv_weather_city') || 'São Paulo';
      const res = await fetch(`/api/weather?q=${encodeURIComponent(city)}&lang=pt`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.ok || !data.current) return;
      const code = Number(data.current.weather_code ?? 0);
      const isDay = Number(data.current.is_day ?? 1);
      const temp = Math.round(data.current.temperature_2m ?? 0);
      const { icon, label } = resolveWeatherMeta(code, isDay);

      state.homeWeather = {
        city: data.location?.city || city,
        country: data.location?.country || '',
        temp,
        feelsLike: typeof data.current.apparent_temperature === 'number' ? Math.round(data.current.apparent_temperature) : null,
        humidity: typeof data.current.relative_humidity_2m === 'number' ? Math.round(data.current.relative_humidity_2m) : null,
        wind: typeof data.current.wind_speed_10m === 'number' ? Math.round(data.current.wind_speed_10m) : null,
        code,
        isDay,
        icon,
        label
      };

      topbarWeatherIcon.src = `icons/weather/${icon}`;
      topbarWeatherTemp.textContent = `${temp}°`;
      if (topbarWeatherBtn) {
        topbarWeatherBtn.title = `Clima em ${state.homeWeather.city}: ${temp}°C • Clique para abrir`;
      }
      hydrateWeatherWidgetEl(document.getElementById('home-weather-widget'));
    } catch (_) {}
  }

  updateTopbarWeather();
  setInterval(updateTopbarWeather, 600000);

  /* =========================================================
     Native WebView & Real OS Bridge
     ========================================================= */
  let wakeLockSentinel = null;
  const isNativeWebView = Boolean(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.irisWebView);

  function postWebViewAction(action, extra = {}) {
    if (isNativeWebView) {
      try {
        window.webkit.messageHandlers.irisWebView.postMessage({ action, ...extra });
        return true;
      } catch (_) { }
    }
    return false;
  }

  /* =========================================================
     Apple TV Fast App Switching & Session Restoration (Web Layer)
     ========================================================= */
  const webAppWarmPool = new Map();
  const MAX_WARM_WEB_APPS = 3;
  let activeWebStageAppId = null;

  function saveWebSession(appId, url) {
    if (!appId) return;
    try {
      const data = { id: appId, url, scrollY: window.scrollY || 0, savedAt: Date.now() };
      localStorage.setItem(`iris_session_${appId}`, JSON.stringify(data));
      fetch('/api/os/app-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    } catch (_) {}
  }

  function getSavedWebSession(appId) {
    if (!appId) return null;
    try {
      const local = localStorage.getItem(`iris_session_${appId}`);
      if (local) return JSON.parse(local);
    } catch (_) {}
    return null;
  }

  function closeFastAppWebStage() {
    if (!activeWebStageAppId) return;
    const entry = webAppWarmPool.get(activeWebStageAppId);
    if (entry && entry.container) {
      try {
        entry.iframe.contentWindow?.postMessage({ action: 'iris-suspend' }, '*');
        const doc = entry.iframe.contentDocument;
        if (doc) {
          doc.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); } catch (_) {} });
          saveWebSession(activeWebStageAppId, doc.location.href);
        }
      } catch (_) {}
      entry.container.style.display = 'none';
    }
    const stage = document.getElementById('iris-web-app-stage');
    if (stage) stage.classList.add('hidden');
    activeWebStageAppId = null;
    playUiSound('back');
  }

  function openFastAppWebStage(url, name, appMeta = {}) {
    const appId = (appMeta.id || appMeta.name || url).toLowerCase().replace(/[^a-z0-9]/g, '_');
    activeWebStageAppId = appId;

    let stage = document.getElementById('iris-web-app-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'iris-web-app-stage';
      stage.className = 'iris-web-app-stage hidden';
      stage.innerHTML = `
        <div class="iris-web-stage-header">
          <button id="iris-web-stage-back" class="btn-glass" type="button">← Voltar ao irisTV (ESC)</button>
          <strong id="iris-web-stage-title" class="iris-web-stage-title">App</strong>
          <button id="iris-web-stage-reload" class="btn-glass" type="button">↻</button>
        </div>
        <div id="iris-web-stage-slot" class="iris-web-stage-slot"></div>
      `;
      document.body.appendChild(stage);

      stage.querySelector('#iris-web-stage-back')?.addEventListener('click', () => closeFastAppWebStage());
      stage.querySelector('#iris-web-stage-reload')?.addEventListener('click', () => {
        const ent = webAppWarmPool.get(activeWebStageAppId);
        if (ent && ent.iframe) ent.iframe.src = ent.iframe.src;
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && activeWebStageAppId) {
          e.preventDefault();
          closeFastAppWebStage();
        }
      });
    }

    const titleEl = stage.querySelector('#iris-web-stage-title');
    if (titleEl) titleEl.textContent = `${name || 'App'} • ESC para voltar ao irisTV`;
    const slot = stage.querySelector('#iris-web-stage-slot');

    webAppWarmPool.forEach((item) => {
      if (item.container) item.container.style.display = 'none';
    });

    stage.classList.remove('hidden');

    if (webAppWarmPool.has(appId)) {
      const entry = webAppWarmPool.get(appId);
      entry.container.style.display = 'block';
      playUiSound('open');
      try {
        entry.iframe.contentWindow?.postMessage({ action: 'iris-resume' }, '*');
      } catch (_) {}
      return;
    }

    let finalUrl = url;
    const session = getSavedWebSession(appId);
    if (session && session.url) {
      finalUrl = session.url;
    }

    if (webAppWarmPool.size >= MAX_WARM_WEB_APPS) {
      const oldestKey = webAppWarmPool.keys().next().value;
      const oldest = webAppWarmPool.get(oldestKey);
      if (oldest) {
        saveWebSession(oldestKey, oldest.url);
        oldest.container.remove();
        webAppWarmPool.delete(oldestKey);
      }
    }

    const container = document.createElement('div');
    container.className = 'iris-web-app-frame-wrap';
    const iframe = document.createElement('iframe');
    iframe.src = finalUrl;
    iframe.className = 'iris-web-app-iframe';
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    container.appendChild(iframe);
    slot.appendChild(container);

    webAppWarmPool.set(appId, { container, iframe, url: finalUrl, savedAt: Date.now() });
    playUiSound('open');
  }

  let appSplashTimer = null;
  function hideAppLaunchSplash() {
    if (appSplashTimer) {
      clearTimeout(appSplashTimer);
      appSplashTimer = null;
    }
    const el = document.getElementById('iris-app-splash');
    if (el) {
      el.classList.add('is-fading');
      setTimeout(() => { el.classList.add('hidden'); el.classList.remove('is-fading'); }, 220);
    }
  }

  function showAppLaunchSplash(appMeta = {}, autoHideMs = 0) {
    let el = document.getElementById('iris-app-splash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'iris-app-splash';
      el.className = 'iris-app-splash hidden';
      el.innerHTML = `
        <div class="iris-app-splash-glow"></div>
        <div class="iris-app-splash-content">
          <div class="iris-app-splash-icon-wrap">
            <img id="iris-app-splash-img" alt="" />
          </div>
          <h2 id="iris-app-splash-name" class="iris-app-splash-name"></h2>
          <div class="iris-app-splash-spinner"></div>
        </div>
      `;
      document.body.appendChild(el);
    }
    const img = el.querySelector('#iris-app-splash-img');
    const title = el.querySelector('#iris-app-splash-name');
    const iconWrap = el.querySelector('.iris-app-splash-icon-wrap');
    el.style.setProperty('--splash-bg', appMeta.bg || '#080c16');
    el.style.setProperty('--splash-glow', appMeta.glow || 'rgba(0, 194, 255, 0.45)');
    if (img) {
      if (appMeta.iconSrc) {
        img.src = appMeta.iconSrc;
        img.style.display = 'block';
        if (iconWrap) iconWrap.style.background = appMeta.bg || '#141414';
      } else {
        img.style.display = 'none';
      }
    }
    if (title) title.textContent = appMeta.name || 'Abrindo...';
    el.classList.remove('hidden', 'is-fading');
    if (appSplashTimer) clearTimeout(appSplashTimer);
    if (autoHideMs > 0) {
      appSplashTimer = setTimeout(() => hideAppLaunchSplash(), autoHideMs);
    }
  }

  async function openExternalAppUrl(url, name, appMeta = {}) {
    if (!url && !appMeta?.id) return;
    if (window.IrisWebOS?.isWebOS && window.IrisWebOS.launchApp(appMeta.id, url)) return;
    if (!(appMeta.isApk || appMeta.androidPackage) && postWebViewAction('openAppUrl', { url, name: name || 'App', id: appMeta?.id, iconSrc: appMeta?.iconSrc || '', bg: appMeta?.bg || '' })) return;

    const isLinux = /linux/i.test(state.systemInfo?.hostPlatform || '');
    if (isLinux || appMeta.isApk || appMeta.androidPackage) {
      showAppLaunchSplash({ name: name || appMeta.name || 'App', iconSrc: appMeta.iconSrc, bg: appMeta.bg, glow: appMeta.glow }, 2600);
    }

    try {
      const r = await fetch('/api/os/launch-tv-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: appMeta.id || '',
          name: name || appMeta.name || 'App',
          url: url || '',
          androidPackage: appMeta.androidPackage || ''
        })
      });
      if (r.ok) {
        const res = await r.json();
        if (res?.launched) {
          if (res?.mode === 'waydroid-widevine-resumed') {
            hideAppLaunchSplash();
          }
          const onReturn = () => {
            hideAppLaunchSplash();
            window.removeEventListener('focus', onReturn);
          };
          window.addEventListener('focus', onReturn);
          return;
        }
      }
    } catch (_) { }
    hideAppLaunchSplash();
    if (url) {
      openFastAppWebStage(url, name, appMeta);
    }
  }

  async function refreshOsStatus() {
    try {
      const r = await fetch(`/api/os/status?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) {
        state.systemInfo = await r.json();
        if (state.systemInfo?.gpus && typeof IrisGpuManager !== 'undefined') {
          IrisGpuManager.setSystemGpus(state.systemInfo.gpus);
        }
        return state.systemInfo;
      }
    } catch (_) { }
    return state.systemInfo;
  }

  async function updateOsVolume(payload) {
    try {
      const r = await fetch('/api/os/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        const data = await r.json();
        if (state.systemInfo && data.audio) state.systemInfo.audio = data.audio;
        return data.audio;
      }
    } catch (_) { }
    return null;
  }

  async function setKeepAwake(enable) {
    state.keepAwake = Boolean(enable);
    if (enable) {
      try {
        if ('wakeLock' in navigator && !wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
        }
      } catch (_) { }
    } else if (wakeLockSentinel) {
      try { await wakeLockSentinel.release(); } catch (_) { }
      wakeLockSentinel = null;
    }
  }

  function toggleTvFullscreen() {
    if (postWebViewAction('toggleFullscreen')) return;
    // Do NOT call HTML5 requestFullscreen() because Chromium shows "Press Esc to exit full screen"
    // and the OS session already runs in fullscreen kiosk mode.
  }

  refreshOsStatus();

  /* =========================================================
     Live Dynamic Spotlight Hero (NavaTV Open-Canvas Behavior)
     ========================================================= */
  let spotlightMediaTimer = null;
  function setSpotlightItem(target) {
    if (!target) return;
    state.spotlightTarget = target;

    const scheduleHeavySpotlight = (fn) => {
      clearTimeout(spotlightMediaTimer);
      spotlightMediaTimer = setTimeout(fn, 85);
    };

    if (target.type === 'app') {
      const app = target.data;
      if (heroKicker) heroKicker.textContent = app.kicker || 'APLICATIVO';
      heroTitle.textContent = app.name;
      heroMeta.textContent = app.meta || 'Brasil • Web App';
      heroSubtitle.textContent = app.tagline;
      heroPlayLabel.textContent = 'Abrir';
      spotlightVisual.classList.remove('is-wide');
      spotlightVisual.style.setProperty('--spot-glow', app.glow || 'rgba(0, 194, 255, 0.35)');
      ambientBackdropImg.classList.remove('is-visible');
      scheduleHeavySpotlight(() => {
        if (state.spotlightTarget !== target) return;
        spotlightImg.src = app.iconSrc || 'logo.svg';
        spotlightImg.alt = app.name;
        if (state.theme === 'prism' && state.smartHome.ambilightSync) setAmbientOrbs(app.orbs);
      });
    } else if (target.type === 'show') {
      const show = target.data;
      if (heroKicker) heroKicker.textContent = show.appName ? show.appName.toUpperCase() : '';
      heroTitle.textContent = show.title;
      heroMeta.textContent = show.sub;
      heroSubtitle.textContent = show.desc;
      heroPlayLabel.textContent = 'Assistir';
      spotlightVisual.classList.add('is-wide');
      spotlightVisual.style.setProperty('--spot-glow', show.glow || 'rgba(0, 194, 255, 0.45)');
      if (ambientBackdropImg) ambientBackdropImg.classList.remove('is-visible');
      scheduleHeavySpotlight(() => {
        if (state.spotlightTarget !== target) return;
        spotlightImg.src = show.bgImg;
        spotlightImg.alt = show.title;
        if (state.theme === 'prism' && state.smartHome.ambilightSync) setAmbientOrbs(show.orbs);
        if (state.settings.showBannersAsWallpaper && show.bgImg && show.id !== 'severance' && !/severance|ruptura/i.test(show.title || '')) {
          activeShowBannerUrl = show.bgImg;
          updateMainScreenWallpaper(true);
        }
      });
    } else if (target.type === 'continue') {
      const item = target.data;
      heroKicker.textContent = `CONTINUAR • ${item.appName.toUpperCase()}`;
      heroTitle.textContent = item.title;
      heroMeta.textContent = `${item.sub} • ${item.progress}% concluído`;
      heroSubtitle.textContent = `Retome de onde parou no ${item.appName}.`;
      heroPlayLabel.textContent = 'Continuar';
      spotlightVisual.classList.add('is-wide');
      spotlightVisual.style.setProperty('--spot-glow', item.glow || 'rgba(155, 77, 255, 0.45)');
      if (ambientBackdropImg) ambientBackdropImg.classList.remove('is-visible');
      scheduleHeavySpotlight(() => {
        if (state.spotlightTarget !== target) return;
        spotlightImg.src = item.thumb;
        spotlightImg.alt = item.title;
        if (state.theme === 'prism' && state.smartHome.ambilightSync) setAmbientOrbs(item.orbs);
        if (state.settings.showBannersAsWallpaper && item.thumb) {
          activeShowBannerUrl = item.thumb;
          updateMainScreenWallpaper(true);
        }
      });
    } else if (target.type === 'live') {
      const ch = target.data;
      heroKicker.textContent = `AO VIVO • CANAL ${ch.num}`;
      heroTitle.textContent = ch.name;
      heroMeta.textContent = ch.meta || 'Transmissão Ao Vivo • HD';
      heroSubtitle.textContent = `${ch.program}${ch.next ? ` • ${ch.next}` : ''}`;
      heroPlayLabel.textContent = 'Sintonizar';
      spotlightVisual.classList.remove('is-wide');
      spotlightVisual.style.setProperty('--spot-glow', 'rgba(255, 45, 111, 0.4)');
      ambientBackdropImg.classList.remove('is-visible');
      scheduleHeavySpotlight(() => {
        if (state.spotlightTarget !== target) return;
        spotlightImg.src = ch.iconSrc || 'logo.svg';
        spotlightImg.alt = ch.name;
        if (state.theme === 'prism' && state.smartHome.ambilightSync) setAmbientOrbs(ch.orbs);
      });
    }

    const isFav = state.favorites.has(target.data.id || target.data.num);
    heroFavLabel.textContent = isFav ? 'Nos Favoritos' : 'Favoritos';
  }

  heroPlayBtn.addEventListener('click', () => {
    const t = state.spotlightTarget;
    if (!t) return;
    if (t.type === 'app') {
      launchApp(t.data);
    } else if (t.type === 'show') {
      openMediaDetails(t.data);
    } else if (t.type === 'continue') {
      openCinemaPlayer({
        title: t.data.title,
        sub: t.data.sub,
        appName: t.data.appName,
        bgImg: t.data.thumb,
        streamUrl: t.data.streamUrl,
        startProgress: t.data.progress
      });
    } else if (t.type === 'live') {
      openCinemaPlayer({
        title: `${t.data.num} • ${t.data.name}`,
        sub: t.data.program,
        appName: 'TV AO VIVO',
        bgImg: t.data.iconSrc,
        streamUrl: t.data.streamUrl,
        isLive: true,
        liveNum: t.data.num
      });
    }
  });

  heroListBtn.addEventListener('click', () => {
    const t = state.spotlightTarget;
    if (!t) return;
    const key = t.data.id || t.data.num;
    const label = t.data.name || t.data.title;
    playUiSound('select');
    if (state.favorites.has(key)) {
      state.favorites.delete(key);
      showToast(`"${label}" removido dos favoritos`);
    } else {
      state.favorites.add(key);
      showToast(`"${label}" adicionado aos favoritos`);
    }
    saveFavorites();
    heroFavLabel.textContent = state.favorites.has(key) ? 'Nos Favoritos' : 'Favoritos';
  });

  /* =========================================================
     3D Parallax Tilt + Card Builders
     ========================================================= */
  function attachParallaxTilt() {
    // Pure CSS transitions handle hover scale without mousemove layout overhead.
  }

  function createAppTile(app, rowId, idx = 0) {
    const wrap = document.createElement('div');
    wrap.className = 'app-tile-item';
    wrap.style.setProperty('--stagger', String(idx));

    const btn = document.createElement('button');
    btn.className = 'app-card focusable';
    btn.dataset.nav = rowId;
    btn.dataset.appId = app.id;
    btn.style.setProperty('--card-bg', app.bg);
    btn.style.setProperty('--card-glow', app.glow);
    btn.setAttribute('aria-label', app.name);
    btn.innerHTML = app.iconSrc
      ? `<img class="app-real-icon" src="${app.iconSrc}" alt="${app.name}" loading="lazy" decoding="async" />`
      : `<div class="app-card-logo">${app.icon}</div>`;

    attachParallaxTilt(btn);

    btn.addEventListener('mouseenter', () => {
      setFocus(btn, false);
    });
    btn.addEventListener('click', () => launchApp(app));

    const label = document.createElement('span');
    label.className = 'app-tile-label';
    label.textContent = app.name;

    wrap.appendChild(btn);
    wrap.appendChild(label);
    return wrap;
  }

  function createLiveCard(ch, rowId) {
    const btn = document.createElement('button');
    btn.className = 'live-card focusable' + (state.offlineChannels.has(ch.streamUrl) ? ' is-offline' : '');
    btn.dataset.nav = rowId;
    btn.dataset.liveNum = ch.num;
    btn.dataset.streamUrl = ch.streamUrl;
    btn.innerHTML = `
      <img class="live-card-bg" src="${ch.iconSrc}" alt="" loading="lazy" decoding="async" />
      <div class="live-card-scrim"></div>
      <div class="live-card-footer">
        <span class="live-dot" aria-label="Ao vivo"></span>
        <span class="live-channel-name">${ch.name}</span>
      </div>
    `;
    btn.addEventListener('mouseenter', () => {
      setFocus(btn, false);
    });
    btn.addEventListener('click', () => {
      openCinemaPlayer({
        title: `${ch.num} • ${ch.name}`,
        sub: ch.program,
        appName: 'TV AO VIVO',
        bgImg: ch.iconSrc,
        streamUrl: ch.streamUrl,
        isLive: true,
        liveNum: ch.num
      });
    });
    return btn;
  }

  let isCheckingChannelsHealth = false;
  async function checkChannelsHealth() {
    if (isCheckingChannelsHealth || !LIVE_CHANNELS || !LIVE_CHANNELS.length) return;
    isCheckingChannelsHealth = true;
    try {
      const urls = LIVE_CHANNELS.map((c) => c.streamUrl);
      const res = await fetch('/api/channels/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.health) return;

      let changed = false;
      for (const [url, ok] of Object.entries(data.health)) {
        if (!ok) {
          if (!state.offlineChannels.has(url)) {
            state.offlineChannels.add(url);
            changed = true;
          }
        } else {
          if (state.offlineChannels.has(url)) {
            state.offlineChannels.delete(url);
            changed = true;
          }
        }
      }

      // Always sync DOM cards with state
      document.querySelectorAll('.live-card').forEach((btn) => {
        const url = btn.dataset.streamUrl;
        if (url) btn.classList.toggle('is-offline', state.offlineChannels.has(url));
      });
      const subTag = document.querySelector('[data-role="live-channels-count"]');
      if (subTag) {
        const onlineCount = LIVE_CHANNELS.filter((c) => !state.offlineChannels.has(c.streamUrl)).length;
        subTag.textContent = `${onlineCount} canais online`;
      }
    } catch (_) {
    } finally {
      isCheckingChannelsHealth = false;
    }
  }

  function getMediaKey(item) {
    const type = String(item?.type || 'SHOW').toUpperCase();
    const base = String(item?.originalTitle || item?.title || item?.id || '').toLowerCase().trim();
    return `${type}:${base}`;
  }

  function getTrackEntry(item) {
    return state.mediaTracker[getMediaKey(item)] || null;
  }

  function upsertTrackEntry(item, details, patch) {
    const key = getMediaKey(item);
    const cur = state.mediaTracker[key] || {
      key,
      id: item.id || key,
      type: details?.type || item.type || 'SHOW',
      title: details?.title || item.title,
      originalTitle: details?.originalTitle || item.originalTitle || item.title,
      poster: details?.poster || item.poster,
      bgImg: details?.backdrop || item.bgImg || item.poster,
      year: details?.year || item.year || null,
      genreSlugs: details?.genreSlugs || item.genreSlugs || [],
      genres: details?.genres || item.genres || [],
      watched: false,
      watchlist: false,
      userRating: 0,
      watchedSeasons: [],
      watchedEpisodes: [],
      updatedAt: Date.now()
    };
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    if (details?.genreSlugs?.length) next.genreSlugs = details.genreSlugs;
    if (details?.poster) next.poster = details.poster;
    if (details?.title) next.title = details.title;
    state.mediaTracker[key] = next;
    state.showsGridDirty = true;
    saveMediaTracker();
    return next;
  }

  let lastOpenedMediaCard = null;

  function createPosterCard(show, rowId, idx = 0) {
    const tr = getTrackEntry(show);
    const typeTag = show.type === 'MOVIE' ? 'Filme' : (show.appName || 'Série');
    const btn = document.createElement('button');
    btn.className = 'poster-card focusable is-img-loading';
    btn.dataset.nav = rowId;
    btn.dataset.showId = show.id;
    btn.style.setProperty('--stagger', String(idx));
    btn.style.setProperty('--card-glow', show.glow || 'rgba(0, 194, 255, 0.5)');
    btn.setAttribute('aria-label', `${show.title} — ${typeTag}`);

    const statusBadges = [
      tr?.watched ? '<span class="poster-mini-pill watched">Visto</span>' : '',
      !tr?.watched && tr?.watchlist ? '<span class="poster-mini-pill watchlist">Quero Ver</span>' : '',
      !tr?.watched && tr?.watchedEpisodes?.length ? `<span class="poster-mini-pill">${tr.watchedEpisodes.length} eps</span>` : '',
      tr?.userRating ? `<span class="poster-mini-pill rate">Nota ${tr.userRating}</span>` : ''
    ].filter(Boolean).join('');

    const img = document.createElement('img');
    img.src = show.poster;
    img.alt = show.title;
    img.loading = 'lazy';
    img.decoding = 'async';

    const onLoaded = () => {
      img.classList.add('is-loaded');
      btn.classList.remove('is-img-loading');
    };
    if (img.complete && img.naturalWidth > 0) {
      onLoaded();
    } else {
      img.addEventListener('load', onLoaded, { once: true });
      img.addEventListener('error', () => {
        btn.classList.remove('is-img-loading');
      }, { once: true });
    }

    btn.appendChild(img);
    if (statusBadges) {
      const st = document.createElement('div');
      st.className = 'poster-card-status';
      st.innerHTML = statusBadges;
      btn.appendChild(st);
    }
    const appBadge = document.createElement('span');
    appBadge.className = 'poster-app-badge';
    appBadge.textContent = typeTag;
    btn.appendChild(appBadge);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'poster-bottom-title';
    titleSpan.textContent = show.title;
    btn.appendChild(titleSpan);

    btn.addEventListener('mouseenter', () => {
      setFocus(btn, false);
      setSpotlightItem({ type: 'show', data: show });
    });
    btn.addEventListener('click', () => {
      lastOpenedMediaCard = btn;
      openMediaDetails(show);
    });
    return btn;
  }

  function createContinueCard(item, rowId) {
    const btn = document.createElement('button');
    btn.className = 'media-card focusable';
    btn.dataset.nav = rowId;
    btn.dataset.cwId = item.id;
    btn.style.setProperty('--card-glow', item.glow);
    btn.innerHTML = `
      <div class="media-thumb">
        <img class="media-thumb-img" src="${item.thumb}" alt="${item.title}" loading="lazy" decoding="async" />
        <span class="media-app-tag">${item.appName}</span>
        <div class="media-progress-track">
          <div class="media-progress-fill" style="width:${item.progress}%"></div>
        </div>
      </div>
      <div class="media-meta">
        <div class="media-title">${item.title}</div>
        <div class="media-sub">${item.sub}</div>
      </div>
    `;
    btn.addEventListener('mouseenter', () => {
      setFocus(btn, false);
      setSpotlightItem({ type: 'continue', data: item });
    });
    btn.addEventListener('click', () => {
      openCinemaPlayer({
        title: item.title,
        sub: item.sub,
        appName: item.appName,
        bgImg: item.thumb,
        streamUrl: item.streamUrl,
        startProgress: item.progress
      });
    });
    return btn;
  }

  function buildRow(title, subtitleTag, actionLabel, onAction, builderFn, subtitleRole = null) {
    const section = document.createElement('section');
    section.className = 'tv-row';
    const header = document.createElement('div');
    header.className = 'row-header';
    header.innerHTML = `
      <div class="row-title-wrap">
        <h2 class="row-title">${title}</h2>
        ${subtitleTag ? `<span class="row-subtitle-tag"${subtitleRole ? ` data-role="${subtitleRole}"` : ''}>${subtitleTag}</span>` : ''}
      </div>
    `;

    if (actionLabel && onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'row-action-btn';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', onAction);
      header.appendChild(actionBtn);
    }

    const track = document.createElement('div');
    track.className = 'row-track';
    builderFn(track);
    section.appendChild(header);
    section.appendChild(track);
    return section;
  }

  /* =========================================================
     Tab Rendering
     ========================================================= */
  const SHOW_GENRES = [
    { key: 'all', label: 'Todos', jwSlug: '' },
    { key: 'drm', label: 'Drama', jwSlug: 'drm' },
    { key: 'scf', label: 'Sci-Fi', jwSlug: 'scf' },
    { key: 'act', label: 'Ação', jwSlug: 'act' },
    { key: 'crm', label: 'Crime', jwSlug: 'crm' },
    { key: 'cmy', label: 'Comédia', jwSlug: 'cmy' },
    { key: 'ani', label: 'Animação & Anime', jwSlug: 'ani' },
    { key: 'hrr', label: 'Terror', jwSlug: 'hrr' },
    { key: 'trl', label: 'Mistério & Thriller', jwSlug: 'trl' }
  ];

  function getTrackedLists() {
    const entries = Object.values(state.mediaTracker || {});
    const watched = entries.filter((e) => e.watched || (e.watchedEpisodes && e.watchedEpisodes.length > 0)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const watchlist = entries.filter((e) => e.watchlist && !e.watched).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { watched, watchlist };
  }

  function getRecommendationParams() {
    const { watched } = getTrackedLists();
    const scoreBySlug = new Map();
    const excludeNames = [];
    for (const item of watched) {
      if (item.title) excludeNames.push(item.title);
      if (item.originalTitle) excludeNames.push(item.originalTitle);
      const weight = (item.userRating || 3) + (item.watched ? 2 : 0);
      for (const slug of item.genreSlugs || []) {
        scoreBySlug.set(slug, (scoreBySlug.get(slug) || 0) + weight);
      }
    }
    const topGenres = [...scoreBySlug.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((x) => x[0]);
    return { topGenres, excludeNames, watchedCount: watched.length };
  }

  let catalogFetchToken = 0;
  const showsCatalogCache = new Map();

  function getShowsCatalogCacheKey() {
    const view = state.activeShowView;
    const genre = (SHOW_GENRES.find((g) => g.key === state.activeShowGenre)?.jwSlug) || '';
    const q = (state.activeShowSearch || '').trim().toLowerCase();
    return `${view}|${genre}|${q}`;
  }

  function prefetchDefaultShowsCatalog() {
    const { lang, country } = getCurrentUiLocale();
    const key = 'all||';
    if (showsCatalogCache.has(key)) return;
    fetch(`/api/media/discover?type=ALL&genre=&q=&lang=${encodeURIComponent(lang)}&country=${encodeURIComponent(country)}&limit=40`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.items?.length) showsCatalogCache.set(key, { ts: Date.now(), items: j.items });
      })
      .catch(() => { });
  }

  async function loadShowsCatalog() {
    const myToken = ++catalogFetchToken;
    const { lang, country } = getCurrentUiLocale();
    const cacheKey = getShowsCatalogCacheKey();
    const cached = showsCatalogCache.get(cacheKey);
    const isFresh = cached && (Date.now() - cached.ts < 5 * 60 * 1000);

    if (cached) {
      if (state.activeShowView === 'recommended') state.recommendedItems = cached.items;
      else state.catalogItems = cached.items;
      state.catalogLoading = false;
      renderShowsGridOnly();
      if (isFresh) return;
    } else if ((state.activeShowView === 'SHOW' || state.activeShowView === 'MOVIE') && state.activeShowGenre === 'all' && !(state.activeShowSearch || '').trim()) {
      // Instant local filter from 'all||' cache while live fetch refines
      const allCached = showsCatalogCache.get('all||');
      if (allCached?.items?.length) {
        state.catalogItems = allCached.items.filter((x) => x.type === state.activeShowView);
        state.catalogLoading = false;
        renderShowsGridOnly();
      } else {
        state.catalogLoading = true;
        renderShowsGridOnly();
      }
    } else {
      state.catalogLoading = true;
      renderShowsGridOnly();
    }

    try {
      if (state.activeShowView === 'recommended') {
        const { topGenres, excludeNames } = getRecommendationParams();
        const url = `/api/media/recommendations?genres=${encodeURIComponent(topGenres.join(','))}&exclude=${encodeURIComponent(excludeNames.join('|'))}&lang=${encodeURIComponent(lang)}&country=${encodeURIComponent(country)}`;
        const resp = await fetch(url);
        if (resp.ok && myToken === catalogFetchToken) {
          const j = await resp.json();
          const items = j.items || [];
          state.recommendedItems = items;
          showsCatalogCache.set(cacheKey, { ts: Date.now(), items });
        }
      } else if (state.activeShowView === 'all' || state.activeShowView === 'SHOW' || state.activeShowView === 'MOVIE') {
        const typeParam = state.activeShowView === 'all' ? 'ALL' : state.activeShowView;
        const gObj = SHOW_GENRES.find((g) => g.key === state.activeShowGenre);
        const genreSlug = gObj?.jwSlug || '';
        const q = (state.activeShowSearch || '').trim();
        const url = `/api/media/discover?type=${encodeURIComponent(typeParam)}&genre=${encodeURIComponent(genreSlug)}&q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}&country=${encodeURIComponent(country)}&limit=40`;
        const resp = await fetch(url);
        if (resp.ok && myToken === catalogFetchToken) {
          const j = await resp.json();
          const items = j.items || [];
          state.catalogItems = items;
          showsCatalogCache.set(cacheKey, { ts: Date.now(), items });
        }
      }
    } catch (_) { }

    if (myToken === catalogFetchToken) {
      state.catalogLoading = false;
      renderShowsGridOnly();
    }
  }

  function ensureTabProgressBar(gridEl) {
    if (!gridEl || !gridEl.parentElement) return null;
    const parent = gridEl.parentElement;
    let wrap = parent.querySelector(':scope > .tab-progress-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'tab-progress-wrap';
      wrap.innerHTML = `
        <div class="tab-progress-meta">
          <span class="tab-progress-label">Carregando...</span>
          <span class="tab-progress-pct">0%</span>
        </div>
        <div class="tab-progress-track">
          <div class="tab-progress-fill"></div>
        </div>
      `;
      parent.insertBefore(wrap, gridEl);
    }
    wrap.classList.remove('is-done');
    return {
      wrap,
      labelEl: wrap.querySelector('.tab-progress-label'),
      pctEl: wrap.querySelector('.tab-progress-pct'),
      fillEl: wrap.querySelector('.tab-progress-fill')
    };
  }

  function enhanceProgressiveImages(rootEl, onImgDone) {
    const imgs = rootEl.querySelectorAll('img');
    imgs.forEach((img) => {
      img.loading = 'lazy';
      img.decoding = 'async';
      const box = img.parentElement;
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('iris-progressive-img', 'is-loaded');
        if (onImgDone) onImgDone();
        return;
      }
      img.classList.add('iris-progressive-img');
      if (box) box.classList.add('iris-img-loading-box');
      const finish = () => {
        img.classList.add('is-loaded');
        if (box) box.classList.remove('iris-img-loading-box');
        if (onImgDone) onImgDone();
      };
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
    });
    return imgs.length;
  }

  function renderGridProgressively(grid, items, createCardFn, opts = {}) {
    const { batchSize = 4, batchDelayMs = 18, label = 'Carregando', progressHost = grid } = opts;
    const token = (grid.__irisRenderToken || 0) + 1;
    grid.__irisRenderToken = token;
    grid.replaceChildren();

    const bar = ensureTabProgressBar(progressHost);
    const total = items.length;
    if (!total) {
      if (bar) bar.wrap.classList.add('is-done');
      return;
    }

    let renderedCount = 0;
    let totalImgs = 0;
    let loadedImgs = 0;

    const updateBar = () => {
      if (grid.__irisRenderToken !== token || !bar) return;
      const domRatio = renderedCount / total;
      const imgRatio = totalImgs > 0 ? Math.min(1, loadedImgs / totalImgs) : 1;
      const pct = Math.min(100, Math.round((domRatio * 0.65 + imgRatio * 0.35) * 100));
      bar.fillEl.style.width = `${pct}%`;
      bar.pctEl.textContent = `${pct}%`;
      bar.labelEl.textContent = renderedCount < total
        ? `${label}... (${renderedCount}/${total})`
        : (loadedImgs < totalImgs ? `Carregando imagens... (${loadedImgs}/${totalImgs})` : 'Pronto');
      if (renderedCount >= total && (totalImgs === 0 || loadedImgs >= totalImgs)) {
        bar.fillEl.style.width = '100%';
        bar.pctEl.textContent = '100%';
        setTimeout(() => {
          if (grid.__irisRenderToken === token) bar.wrap.classList.add('is-done');
        }, 280);
      }
    };

    const scheduleNext = () => {
      if (batchDelayMs > 0) {
        setTimeout(() => {
          if (grid.__irisRenderToken === token) requestAnimationFrame(step);
        }, batchDelayMs);
      } else {
        requestAnimationFrame(step);
      }
    };

    const step = () => {
      if (grid.__irisRenderToken !== token) return;
      const frag = document.createDocumentFragment();
      const batchCards = [];
      const end = Math.min(total, renderedCount + batchSize);
      for (let i = renderedCount; i < end; i++) {
        const card = createCardFn(items[i], i);
        if (card) {
          card.style.transitionDelay = `${(i - renderedCount) * 32}ms`;
          card.classList.add('iris-card-pre');
          totalImgs += enhanceProgressiveImages(card, () => {
            loadedImgs++;
            updateBar();
          });
          batchCards.push(card);
          frag.appendChild(card);
        }
      }
      grid.appendChild(frag);
      // Commit initial state and trigger smooth GPU rise-up transition on next frame
      requestAnimationFrame(() => {
        if (grid.__irisRenderToken !== token) return;
        batchCards.forEach((c) => {
          c.classList.remove('iris-card-pre');
          c.classList.add('iris-card-in');
        });
      });
      renderedCount = end;
      updateBar();

      if (renderedCount < total) {
        scheduleNext();
      } else {
        // Safety timeout so lazy off-screen images don't keep the bar open forever
        setTimeout(() => {
          if (grid.__irisRenderToken === token && bar && !bar.wrap.classList.contains('is-done')) {
            bar.fillEl.style.width = '100%';
            bar.pctEl.textContent = '100%';
            setTimeout(() => {
              if (grid.__irisRenderToken === token) bar.wrap.classList.add('is-done');
            }, 220);
          }
        }, 1200);
      }
    };

    updateBar();
    requestAnimationFrame(step);
  }

  function renderShowsGridOnly() {
    const grid = document.getElementById('shows-catalog-grid');
    const countBadge = document.getElementById('shows-view-counts');
    if (!grid) return;

    const { watched, watchlist } = getTrackedLists();
    if (countBadge) {
      const wBtn = document.querySelector('[data-sview="watched"]');
      const wlBtn = document.querySelector('[data-sview="watchlist"]');
      if (wBtn) wBtn.textContent = `Já Vi (${watched.length})`;
      if (wlBtn) wlBtn.textContent = `Quero Ver (${watchlist.length})`;
    }

    const q = (state.activeShowSearch || '').trim().toLowerCase();
    const activeFeatured = (state.settings.kidsMode ? TRENDING_SHOWS.filter((s) => s.kidsSafe) : TRENDING_SHOWS)
      .map((s) => ({ ...s, type: s.type || 'SHOW' }));

    let items = [];
    if (state.activeShowView === 'watched') {
      items = watched.filter((x) => !q || x.title.toLowerCase().includes(q));
    } else if (state.activeShowView === 'watchlist') {
      items = watchlist.filter((x) => !q || x.title.toLowerCase().includes(q));
    } else if (state.activeShowView === 'recommended') {
      items = state.recommendedItems.filter((x) => !q || x.title.toLowerCase().includes(q));
    } else {
      const seen = new Set();
      const merged = [];
      // Merge live JustWatch catalog with featured local shows when browsing 'all'/'SHOW'
      const addItem = (it) => {
        const k = (it.originalTitle || it.title || '').toLowerCase();
        if (!k || seen.has(k)) return;
        seen.add(k);
        merged.push(it);
      };
      if (state.activeShowView !== 'MOVIE' && state.activeShowGenre === 'all') {
        activeFeatured.filter((s) => !q || s.title.toLowerCase().includes(q)).forEach(addItem);
      }
      (state.catalogItems || []).forEach(addItem);
      items = merged;
    }

    grid.innerHTML = '';
    if (state.catalogLoading && !items.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:28px 0;color:var(--iris-cyan);font-weight:600;">Carregando séries e filmes...</div>`;
      return;
    }

    if (!items.length) {
      let emptyMsg = 'Nenhum título encontrado.';
      if (state.activeShowView === 'watched') emptyMsg = 'Você ainda não marcou nenhuma série ou filme como visto. Abra qualquer título e clique em "Já Vi".';
      else if (state.activeShowView === 'watchlist') emptyMsg = 'Sua lista "Quero Ver" está vazia. Abra qualquer título e clique em "+ Quero Ver".';
      else if (state.activeShowView === 'recommended') emptyMsg = 'Marque ou avalie séries/filmes que você assistiu para receber recomendações personalizadas.';
      grid.innerHTML = `<div style="grid-column:1/-1;padding:28px 0;color:var(--text-secondary);font-size:0.95rem;">${emptyMsg}</div>`;
      return;
    }

    renderGridProgressively(grid, items, (show) => createPosterCard(show, 'row-1', 0), {
      batchSize: 4,
      batchDelayMs: 18,
      label: 'Carregando séries e filmes'
    });
  }

  let showsSearchDebounce = null;
  function renderShowsAndMoviesTab(frag) {
    const { watched, watchlist } = getTrackedLists();
    const { watchedCount, topGenres } = getRecommendationParams();
    const section = document.createElement('section');
    section.className = 'tv-row';
    const recNote = state.activeShowView === 'recommended' && watchedCount > 0
      ? `<span class="row-subtitle-tag">Baseado em ${watchedCount} título(s) vistos${topGenres.length ? ` • Gêneros favoritos` : ''}</span>`
      : '';

    section.innerHTML = `
      <div class="row-header">
        <div class="row-title-wrap">
          <h2 class="row-title">Séries &amp; Filmes</h2>
          ${state.settings.kidsMode ? '<span class="row-subtitle-tag">Modo Família</span>' : ''}
          ${recNote}
        </div>
      </div>
      <div class="shows-toolbar">
        <div class="shows-search-row">
          <div class="shows-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="shows-search-input" class="shows-search-input" type="text" placeholder="Pesquisar qualquer série ou filme..." value="${escHtml(state.activeShowSearch || '')}" autocomplete="off" />
          </div>
          <div class="category-filter-bar" id="shows-view-counts">
            <button class="cat-chip ${state.activeShowView === 'all' ? 'active' : ''}" data-sview="all">Explorar Tudo</button>
            <button class="cat-chip ${state.activeShowView === 'SHOW' ? 'active' : ''}" data-sview="SHOW">Séries</button>
            <button class="cat-chip ${state.activeShowView === 'MOVIE' ? 'active' : ''}" data-sview="MOVIE">Filmes</button>
            <button class="cat-chip ${state.activeShowView === 'watched' ? 'active' : ''}" data-sview="watched"> Já Vi (${watched.length})</button>
            <button class="cat-chip ${state.activeShowView === 'watchlist' ? 'active' : ''}" data-sview="watchlist"> Quero Ver (${watchlist.length})</button>
            <button class="cat-chip ${state.activeShowView === 'recommended' ? 'active' : ''}" data-sview="recommended"> Recomendados</button>
          </div>
        </div>
        ${(state.activeShowView === 'all' || state.activeShowView === 'SHOW' || state.activeShowView === 'MOVIE') ? `
          <div class="category-filter-bar">
            ${SHOW_GENRES.map((g) => `<button class="cat-chip ${state.activeShowGenre === g.key ? 'active' : ''}" data-genre="${g.key}">${g.label}</button>`).join('')}
          </div>
        ` : ''}
      </div>
      <div id="shows-catalog-grid" class="poster-grid-layout"></div>
    `;
    frag.appendChild(section);

    const searchEl = section.querySelector('#shows-search-input');
    searchEl?.addEventListener('input', (e) => {
      state.activeShowSearch = e.target.value;
      clearTimeout(showsSearchDebounce);
      showsSearchDebounce = setTimeout(() => {
        if (state.activeShowView === 'watched' || state.activeShowView === 'watchlist') renderShowsGridOnly();
        else loadShowsCatalog();
      }, 280);
    });

    section.querySelectorAll('[data-sview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playUiSound('move');
        state.activeShowView = btn.dataset.sview;
        section.querySelectorAll('[data-sview]').forEach((b) => b.classList.toggle('active', b === btn));
        if (state.activeShowView === 'watched' || state.activeShowView === 'watchlist') {
          renderShowsGridOnly();
        } else {
          loadShowsCatalog();
        }
      });
    });

    section.querySelectorAll('[data-genre]').forEach((chip) => {
      chip.addEventListener('click', () => {
        playUiSound('move');
        state.activeShowGenre = chip.dataset.genre;
        section.querySelectorAll('[data-genre]').forEach((c) => c.classList.toggle('active', c === chip));
        loadShowsCatalog();
      });
    });
  }

  /* =========================================================
     Live Real-Time News Tab (Nacionais & Internacionais)
     ========================================================= */
  let newsFetchToken = 0;
  let newsSearchDebounce = null;
  const newsClientCache = new Map();

  function formatRelativeNewsTime(isoOrTs) {
    const diffMs = Math.max(0, Date.now() - (typeof isoOrTs === 'number' ? isoOrTs : Date.parse(isoOrTs || '') || Date.now()));
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `há ${hrs}h`;
    return `há ${Math.floor(hrs / 24)}d`;
  }

  function openNewsArticleModal(article) {
    if (!article) return;
    playUiSound('open');
    appStageWindow.classList.remove('is-details-mode', 'is-store-mode', 'is-fullscreen-app', 'is-mediaplayer-app');
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon" style="background:rgba(0,194,255,0.2);display:grid;place-items:center;font-weight:800;">N</div>
      <div class="app-stage-brand-title">${escHtml(article.source)} • ${article.scope === 'br' ? 'Brasil' : 'Internacional'}</div>
    `;
    appStageBody.innerHTML = `
      <div class="news-reader-wrap">
        ${article.imageUrl ? `<img class="news-reader-hero" src="${escHtml(article.imageUrl)}" alt="${escHtml(article.title)}" />` : ''}
        <div class="news-reader-meta">
          <span class="news-scope-badge ${article.scope === 'br' ? 'is-br' : 'is-intl'}">${article.scope === 'br' ? 'Brasil' : 'Internacional'}</span>
          <span>${escHtml(article.source)}</span>
          <span>•</span>
          <span>${formatRelativeNewsTime(article.ts)}</span>
        </div>
        <h2 class="news-reader-title">${escHtml(article.title)}</h2>
        ${article.summary ? `<p class="news-reader-summary">${escHtml(article.summary)}</p>` : ''}
        <div class="news-reader-actions">
          <button id="news-open-full-btn" class="btn-prism focusable" type="button" style="height:44px;padding:0 22px;">Ler matéria completa no navegador ↗</button>
        </div>
      </div>
    `;
    appStageOverlay.classList.remove('hidden');
    appStageBody.querySelector('#news-open-full-btn')?.addEventListener('click', () => {
      playUiSound('select');
      if (isNativeWebView) {
        closeAppStage();
        postWebViewAction('openAppUrl', { url: article.link, name: article.source });
      } else {
        openExternalAppUrl(article.link);
      }
    });
    ensureScopeFocus();
  }

  async function loadNewsFeed(forceRefresh = false) {
    const myToken = ++newsFetchToken;
    const key = `${state.activeNewsScope}|${state.activeNewsCategory}|${(state.activeNewsSearch || '').trim().toLowerCase()}`;
    const cached = newsClientCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.ts < 60000) {
      state.newsItems = cached.items;
      state.newsUpdatedAt = cached.updatedAt;
      state.newsLoading = false;
      renderNewsGridOnly();
      return;
    }

    state.newsLoading = !state.newsItems.length || forceRefresh;
    renderNewsGridOnly();

    try {
      const qs = new URLSearchParams({
        scope: state.activeNewsScope,
        category: state.activeNewsCategory,
        q: (state.activeNewsSearch || '').trim()
      });
      if (forceRefresh) qs.set('refresh', '1');
      const res = await fetch(`/api/news?${qs.toString()}`);
      if (res.ok && myToken === newsFetchToken) {
        const data = await res.json();
        state.newsItems = data.items || [];
        state.newsUpdatedAt = data.updatedAt || Date.now();
        newsClientCache.set(key, { ts: Date.now(), updatedAt: state.newsUpdatedAt, items: state.newsItems });
      }
    } catch (_) { }

    if (myToken === newsFetchToken) {
      state.newsLoading = false;
      renderNewsGridOnly();
    }
  }

  const newsArticleCache = new Map();

  function renderNewsGridOnly() {
    const grid = document.getElementById('news-feed-grid');
    const timeBadge = document.getElementById('news-updated-badge');
    if (timeBadge && state.newsUpdatedAt) {
      timeBadge.textContent = `Tempo real • atualizado ${new Date(state.newsUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (!grid) return;

    const items = state.newsItems || [];
    if (state.newsLoading && !items.length) {
      grid.innerHTML = `<div class="news-empty-msg">Buscando manchetes em tempo real...</div>`;
      return;
    }
    if (!items.length) {
      grid.innerHTML = `<div class="news-empty-msg">Nenhuma notícia encontrada para este filtro.</div>`;
      return;
    }

    let activeIdx = Number.isInteger(state.activeNewsIdx) && state.activeNewsIdx >= 0 && state.activeNewsIdx < items.length
      ? state.activeNewsIdx
      : 0;
    if (state.activeNewsId) {
      const byId = items.findIndex((x) => (x.id || x.link) === state.activeNewsId);
      if (byId !== -1) activeIdx = byId;
    }
    const activeArt = items[activeIdx] || items[0];
    state.activeNewsIdx = activeIdx;
    state.activeNewsId = activeArt.id || activeArt.link || String(activeIdx);

    grid.innerHTML = `
      <div class="news-split-shell">
        <div class="news-split-list" id="news-split-list"></div>
        <article class="news-split-reader" id="news-split-reader">
          <div class="news-reader-topbar">
            <span class="news-reader-source" id="news-reader-source">${escHtml(activeArt.source)} • ${escHtml(formatRelativeNewsTime(activeArt.ts))}</span>
            <div class="news-reader-btns">
              <button id="news-smart-summary-btn" class="news-smart-btn ${state.newsSmartSummary ? 'active' : ''}" type="button" title="Resumo Inteligente">✨ Smart Summary</button>
              <button id="news-open-source-btn" class="news-smart-btn" type="button">Ler na fonte ↗</button>
            </div>
          </div>
          <h2 class="news-reader-headline" id="news-reader-headline">${escHtml(activeArt.title)}</h2>
          <div id="news-reader-body" class="news-reader-paragraphs">
            ${activeArt.summary ? `<p>${escHtml(activeArt.summary)}</p>` : ''}
            <p class="news-reader-loading">Carregando matéria completa...</p>
          </div>
        </article>
      </div>
    `;

    const loadReaderBody = async (art) => {
      const bodyEl = document.getElementById('news-reader-body');
      if (!bodyEl || !art) return;
      let full = newsArticleCache.get(art.link);
      if (!full && art.link) {
        try {
          const r = await fetch(`/api/news/article?url=${encodeURIComponent(art.link)}`);
          if (r.ok) {
            full = await r.json();
            newsArticleCache.set(art.link, full);
          }
        } catch (_) { }
      }
      if (state.activeNewsId !== (art.id || art.link)) return;
      const paras = (full?.paragraphs && full.paragraphs.length) ? full.paragraphs : (art.summary ? [art.summary] : ['Toque em "Ler na fonte" para abrir a matéria completa.']);
      if (state.newsSmartSummary) {
        const bullets = paras.slice(0, 3);
        bodyEl.innerHTML = `
          <div class="news-smart-box">
            <div class="news-smart-label">✨ Smart Summary</div>
            <ul>${bullets.map((b) => `<li>${escHtml(b)}</li>`).join('')}</ul>
          </div>
          ${paras.map((p) => `<p>${escHtml(p)}</p>`).join('')}
        `;
      } else {
        bodyEl.innerHTML = paras.map((p) => `<p>${escHtml(p)}</p>`).join('');
      }
    };

    loadReaderBody(activeArt);

    const listEl = grid.querySelector('#news-split-list');
    if (listEl) {
      renderGridProgressively(listEl, items, (art, idx) => {
        const isAct = idx === activeIdx;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `news-list-item focusable ${isAct ? 'is-active' : ''}`;
        btn.dataset.nav = 'row-1';
        btn.dataset.newsIdx = String(idx);
        btn.innerHTML = `
          <div class="news-list-top">
            <span class="news-list-src">${escHtml(art.source)}</span>
            <span class="news-list-time">${escHtml(formatRelativeNewsTime(art.ts))}</span>
          </div>
          <div class="news-list-title">${escHtml(art.title)}</div>
          <div class="news-list-bottom">
            ${art.imageUrl ? `<img class="news-list-thumb" src="${escHtml(art.imageUrl)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'" />` : ''}
            ${art.summary ? `<p class="news-list-snippet">${escHtml(art.summary)}</p>` : ''}
          </div>
        `;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('move');
          state.activeNewsIdx = idx;
          state.activeNewsId = art.id || art.link || String(idx);
          listEl.querySelectorAll('.news-list-item.is-active').forEach((el) => el.classList.remove('is-active'));
          btn.classList.add('is-active');
          const srcEl = document.getElementById('news-reader-source');
          const headEl = document.getElementById('news-reader-headline');
          const bodyEl = document.getElementById('news-reader-body');
          if (srcEl) srcEl.textContent = `${art.source} • ${formatRelativeNewsTime(art.ts)}`;
          if (headEl) headEl.textContent = art.title;
          if (bodyEl) bodyEl.innerHTML = `${art.summary ? `<p>${escHtml(art.summary)}</p>` : ''}<p class="news-reader-loading">Carregando matéria completa...</p>`;
          loadReaderBody(art);
        });
        return btn;
      }, {
        batchSize: 5,
        batchDelayMs: 18,
        label: 'Carregando notícias',
        progressHost: grid
      });
    }

    grid.querySelector('#news-smart-summary-btn')?.addEventListener('click', () => {
      playUiSound('select');
      state.newsSmartSummary = !state.newsSmartSummary;
      renderNewsGridOnly();
    });

    grid.querySelector('#news-open-source-btn')?.addEventListener('click', () => {
      playUiSound('open');
      if (isNativeWebView) {
        postWebViewAction('openAppUrl', { url: activeArt.link, name: activeArt.source });
      } else {
        openExternalAppUrl(activeArt.link, activeArt.source);
      }
    });
  }

  function renderNewsTab(frag) {
    const section = document.createElement('section');
    section.className = 'tv-row';
    section.innerHTML = `
      <div class="row-header">
        <div class="row-title-wrap">
          <h2 class="row-title">Notícias em Tempo Real</h2>
          <span class="row-subtitle-tag" id="news-updated-badge">Brasil &amp; Mundo</span>
        </div>
        <button id="news-refresh-btn" class="row-action-btn focusable" type="button">↻ Atualizar</button>
      </div>
      <div class="shows-toolbar">
        <div class="shows-search-row">
          <div class="shows-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="news-search-input" class="shows-search-input" type="text" placeholder="Pesquisar notícias no Brasil e no mundo..." value="${escHtml(state.activeNewsSearch || '')}" autocomplete="off" />
          </div>
          <div class="category-filter-bar">
            <button class="cat-chip ${state.activeNewsScope === 'all' ? 'active' : ''}" data-nscope="all">Todas</button>
            <button class="cat-chip ${state.activeNewsScope === 'br' ? 'active' : ''}" data-nscope="br">Nacionais (Brasil)</button>
            <button class="cat-chip ${state.activeNewsScope === 'intl' ? 'active' : ''}" data-nscope="intl">Internacionais</button>
          </div>
        </div>
        <div class="category-filter-bar">
          <button class="cat-chip ${state.activeNewsCategory === 'all' ? 'active' : ''}" data-ncat="all">Geral</button>
          <button class="cat-chip ${state.activeNewsCategory === 'world' ? 'active' : ''}" data-ncat="world">Mundo</button>
          <button class="cat-chip ${state.activeNewsCategory === 'economy' ? 'active' : ''}" data-ncat="economy">Economia</button>
          <button class="cat-chip ${state.activeNewsCategory === 'tech' ? 'active' : ''}" data-ncat="tech">Tecnologia</button>
        </div>
      </div>
      <div id="news-feed-grid" class="news-grid-layout"></div>
    `;
    frag.appendChild(section);

    section.querySelector('#news-refresh-btn')?.addEventListener('click', () => {
      playUiSound('select');
      loadNewsFeed(true);
    });
    section.querySelector('#news-search-input')?.addEventListener('input', (e) => {
      state.activeNewsSearch = e.target.value;
      clearTimeout(newsSearchDebounce);
      newsSearchDebounce = setTimeout(() => loadNewsFeed(false), 260);
    });
    section.querySelectorAll('[data-nscope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playUiSound('move');
        state.activeNewsScope = btn.dataset.nscope;
        renderTab('news');
      });
    });
    section.querySelectorAll('[data-ncat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playUiSound('move');
        state.activeNewsCategory = btn.dataset.ncat;
        renderTab('news');
      });
    });
  }

  const TAB_ORDER = ['home', 'shows', 'news', 'apps', 'settings'];

  function updateNavPillIndicator() {
    const navPillsBar = document.getElementById('nav-pills');
    const indicator = document.getElementById('nav-pill-indicator');
    if (!navPillsBar || !indicator) return;
    const activePill = navPillsBar.querySelector('.nav-pill.active');
    if (!activePill) {
      indicator.style.opacity = '0';
      return;
    }
    const barRect = navPillsBar.getBoundingClientRect();
    const pillRect = activePill.getBoundingClientRect();
    if (barRect.width === 0 || pillRect.width === 0) return;
    const leftOffset = pillRect.left - barRect.left;
    indicator.style.opacity = '1';
    indicator.style.width = `${pillRect.width}px`;
    indicator.style.transform = `translate3d(${leftOffset}px, 0, 0)`;
  }

  window.addEventListener('resize', () => requestAnimationFrame(updateNavPillIndicator));
  {
    const navPillsBar = document.getElementById('nav-pills');
    if (navPillsBar && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => requestAnimationFrame(updateNavPillIndicator)).observe(navPillsBar);
    }
  }

  let wpAutoRotateTimer = null;
  function syncWallpaperAutoRotate() {
    clearInterval(wpAutoRotateTimer);
    wpAutoRotateTimer = null;
    if (!state.settings.wallpaperAutoRotate || activeWallpapersList.length < 2) return;
    wpAutoRotateTimer = setInterval(() => {
      const idx = activeWallpapersList.findIndex((w) => w.id === state.settings.activeWallpaperId);
      const next = activeWallpapersList[(idx + 1) % activeWallpapersList.length];
      if (next) {
        state.settings.activeWallpaperId = next.id;
        saveSettings();
        updateMainScreenWallpaper();
      }
    }, 60000);
  }

  let autoHideTopbarBound = false;
  function syncAutoHideTopbar() {
    const tvContentEl = document.getElementById('tv-content');
    const topBarEl = document.querySelector('.top-bar');
    if (!topBarEl) return;
    if (!state.settings.autoHideTopbar) {
      topBarEl.classList.remove('is-auto-hidden');
      return;
    }
    if (!autoHideTopbarBound && tvContentEl) {
      autoHideTopbarBound = true;
      let lastY = 0;
      let scrollRafPending = false;
      tvContentEl.addEventListener('scroll', () => {
        if (!state.settings.autoHideTopbar || scrollRafPending) return;
        scrollRafPending = true;
        requestAnimationFrame(() => {
          scrollRafPending = false;
          const y = tvContentEl.scrollTop;
          if (y > 60 && y > lastY) topBarEl.classList.add('is-auto-hidden');
          else if (y < lastY || y <= 40) topBarEl.classList.remove('is-auto-hidden');
          lastY = y;
        });
      }, { passive: true });
    }
  }

  let livePreviewHls = null;

  function destroyLivePreview() {
    if (livePreviewHls) {
      try { livePreviewHls.destroy(); } catch (_) { }
      livePreviewHls = null;
    }
    const vid = document.getElementById('live-preview-video');
    if (vid) {
      try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (_) { }
    }
  }

  function renderLiveTab(frag) {
    const channels = LIVE_CHANNELS || [];
    let activeChannel = channels.find((c) => !state.offlineChannels.has(c.streamUrl)) || channels[0];

    const wrap = document.createElement('section');
    wrap.className = 'live-tab-shell';
    wrap.innerHTML = `
      <div class="live-tab-preview-card">
        <div class="live-preview-stage">
          <video id="live-preview-video" class="live-preview-video" autoplay muted playsinline></video>
          <div class="live-preview-badge">
            <span class="live-dot"></span> AO VIVO
          </div>
        </div>
        <div class="live-preview-meta">
          <div class="live-preview-head">
            <img id="live-preview-logo" class="live-preview-logo" src="${activeChannel?.iconSrc || 'logo.svg'}" alt="" />
            <div>
              <div id="live-preview-ch" class="live-preview-ch">Canal ${escHtml(activeChannel?.num || '')} • ${escHtml(activeChannel?.name || '')}</div>
              <h2 id="live-preview-prog" class="live-preview-prog">${escHtml(activeChannel?.program || 'Transmissão Ao Vivo')}</h2>
              <p id="live-preview-next" class="live-preview-next">${escHtml(activeChannel?.next || '')}</p>
            </div>
          </div>
          <div class="live-preview-actions">
            <button id="live-preview-mute-btn" class="stg-btn" type="button">Ativar Som</button>
            <button id="live-preview-full-btn" class="stg-btn primary" type="button">Assistir em Tela Cheia</button>
          </div>
        </div>
      </div>
      <div class="live-tab-list-card">
        <div class="live-tab-list-title">Canais (${channels.length})</div>
        <div class="live-tab-channels" id="live-tab-channels">
          ${channels.map((ch) => {
      const isOff = state.offlineChannels.has(ch.streamUrl);
      const isAct = activeChannel && ch.num === activeChannel.num;
      return `
              <button class="live-ch-row focusable ${isAct ? 'active' : ''} ${isOff ? 'is-offline' : ''}" type="button" data-live-pick="${escHtml(ch.num)}">
                <span class="live-ch-num">${escHtml(ch.num)}</span>
                <img class="live-ch-ico" src="${escHtml(ch.iconSrc || 'logo.svg')}" alt="" />
                <span class="live-ch-info">
                  <strong>${escHtml(ch.name)}</strong>
                  <span>${escHtml(ch.program || ch.meta || 'Ao Vivo')}</span>
                </span>
              </button>
            `;
    }).join('')}
        </div>
      </div>
    `;
    frag.appendChild(wrap);

    const attachPreviewStream = async (ch) => {
      if (!ch) return;
      activeChannel = ch;
      destroyLivePreview();
      const logoEl = wrap.querySelector('#live-preview-logo');
      const chEl = wrap.querySelector('#live-preview-ch');
      const progEl = wrap.querySelector('#live-preview-prog');
      const nextEl = wrap.querySelector('#live-preview-next');
      const videoEl = wrap.querySelector('#live-preview-video');
      if (logoEl) logoEl.src = ch.iconSrc || 'logo.svg';
      if (chEl) chEl.textContent = `Canal ${ch.num} • ${ch.name}`;
      if (progEl) progEl.textContent = ch.program || 'Transmissão Ao Vivo';
      if (nextEl) nextEl.textContent = ch.next || '';

      wrap.querySelectorAll('[data-live-pick]').forEach((b) => {
        b.classList.toggle('active', b.dataset.livePick === String(ch.num));
      });

      if (videoEl && ch.streamUrl) {
        const proxyUrl = `/api/hls-proxy?url=${encodeURIComponent(ch.streamUrl)}`;
        if (window.Hls && window.Hls.isSupported()) {
          livePreviewHls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
          livePreviewHls.loadSource(proxyUrl);
          livePreviewHls.attachMedia(videoEl);
          livePreviewHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            videoEl.play().catch(() => { });
          });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = proxyUrl;
          videoEl.play().catch(() => { });
        }
      }

      if (typeof getEpgForChannel === 'function') {
        try {
          const epg = await getEpgForChannel(ch.name);
          if (activeChannel?.num === ch.num && epg?.days?.[0]?.slots?.length) {
            const nowMs = Date.now();
            const cur = epg.days[0].slots.find((sl) => sl.start <= nowMs && sl.end >= nowMs) || epg.days[0].slots[0];
            if (cur && progEl) progEl.textContent = cur.title;
            const nxt = epg.days[0].slots.find((sl) => sl.start > (cur?.start || nowMs));
            if (nxt && nextEl) nextEl.textContent = `A seguir: ${nxt.title}`;
          }
        } catch (_) { }
      }
    };

    wrap.querySelectorAll('[data-live-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playUiSound('move');
        const ch = channels.find((c) => String(c.num) === btn.dataset.livePick);
        if (ch) attachPreviewStream(ch);
      });
    });

    wrap.querySelector('#live-preview-mute-btn')?.addEventListener('click', (e) => {
      const videoEl = wrap.querySelector('#live-preview-video');
      if (!videoEl) return;
      videoEl.muted = !videoEl.muted;
      e.currentTarget.textContent = videoEl.muted ? 'Ativar Som' : 'Silenciar';
      playUiSound('select');
    });

    wrap.querySelector('#live-preview-full-btn')?.addEventListener('click', () => {
      if (!activeChannel) return;
      destroyLivePreview();
      openCinemaPlayer({
        title: `${activeChannel.num} • ${activeChannel.name}`,
        sub: activeChannel.program,
        appName: 'TV AO VIVO',
        bgImg: activeChannel.iconSrc,
        streamUrl: activeChannel.streamUrl,
        isLive: true,
        liveNum: activeChannel.num,
        ccLang: activeChannel.ccLang
      });
    });

    if (activeChannel) attachPreviewStream(activeChannel);
  }

  const tabPaneCache = new Map();
  let lastAppsFilterRendered = null;
  let lastAppsCountRendered = -1;
  let lastNewsFetchAt = 0;

  function renderTab(tab, forceRebuild = false) {
    destroyLivePreview();
    const oldIdx = TAB_ORDER.indexOf(state.activeTab || 'home');
    const newIdx = TAB_ORDER.indexOf(tab);
    const isForward = newIdx >= oldIdx;
    state.activeTab = tab;
    document.documentElement.dataset.activeTab = tab;
    navPills.forEach((pill) => pill.classList.toggle('active', pill.dataset.tab === tab));
    requestAnimationFrame(updateNavPillIndicator);

    heroSection.classList.toggle('hidden', tab !== 'home' || !!state.settings.hideHeroBanner);

    // Zero-reflow GPU tab animation (no offsetWidth forced layout!)
    rowsContainer.classList.remove('tab-anim-enter-right', 'tab-anim-enter-left');
    requestAnimationFrame(() => {
      rowsContainer.classList.add(isForward ? 'tab-anim-enter-right' : 'tab-anim-enter-left');
    });

    rowsContainer.replaceChildren();

    const isKidsSafeShow = (s) => {
      if (typeof s.kidsSafe === 'boolean') return s.kidsSafe;
      const age = String(s.ageRating || '').toUpperCase();
      return ['L', 'AL', '10', '12', 'G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'].includes(age);
    };
    const getLiveTrendingList = () => {
      const cachedAll = showsCatalogCache.get('all||');
      const source = (cachedAll?.items && cachedAll.items.length > 0) ? cachedAll.items : TRENDING_SHOWS;
      return state.settings.kidsMode ? source.filter(isKidsSafeShow) : source;
    };
    const activeShows = getLiveTrendingList();
    const frag = document.createDocumentFragment();

    if (tab === 'home') {
      const sHome = state.settings;
      const defaultOrder = ['widgets', 'settings', 'apps', 'live', 'continue', 'trending'];
      const order = Array.isArray(sHome.homeSectionOrder) && sHome.homeSectionOrder.length
        ? [...new Set([...sHome.homeSectionOrder, ...defaultOrder])]
        : defaultOrder;

      const buildCalendarWidgetEl = (useLiquidGlass) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.getDate();
        const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let cellsHtml = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
          .map((d) => `<span class="cal-widget-dow">${d}</span>`)
          .join('');
        for (let i = 0; i < firstDay; i++) {
          cellsHtml += '<span class="cal-widget-day is-empty" aria-hidden="true"></span>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
          cellsHtml += `<span class="cal-widget-day${d === today ? ' is-today' : ''}">${d}</span>`;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'home-calendar-widget';
        btn.dataset.nav = 'row-widgets';
        btn.className = `home-widget-card calendar-widget-card focusable ${useLiquidGlass ? 'is-liquid-glass' : 'is-solid-matte'}`;
        btn.setAttribute('aria-label', `Calendário — ${weekdays[now.getDay()]}, ${today} de ${months[month]} de ${year}`);
        btn.innerHTML = `
          <div class="weather-widget-specular" aria-hidden="true"></div>
          <div class="cal-widget-left">
            <div class="cal-widget-top">
              <span class="weather-widget-badge">Calendário</span>
              <span class="cal-widget-month">${months[month]} ${year}</span>
            </div>
            <div class="cal-widget-today-num">${today}</div>
            <div class="cal-widget-weekday">${weekdays[now.getDay()]}</div>
          </div>
          <div class="cal-widget-grid" aria-hidden="true">${cellsHtml}</div>
        `;
        btn.addEventListener('mouseenter', () => setFocus(btn, false));
        btn.addEventListener('click', () => playUiSound('select'));
        return btn;
      };

      const updateAnalogClockWidget = (widgetEl) => {
        if (!widgetEl || !widgetEl.isConnected) return;
        const now = new Date();
        const sec = now.getSeconds();
        const min = now.getMinutes();
        const hr = now.getHours() % 12;

        const secDeg = sec * 6;
        const minDeg = min * 6 + sec * 0.1;
        const hrDeg = hr * 30 + min * 0.5;

        const hHand = widgetEl.querySelector('[data-hand="hour"]');
        const mHand = widgetEl.querySelector('[data-hand="minute"]');
        const sHand = widgetEl.querySelector('[data-hand="second"]');
        if (hHand) hHand.setAttribute('transform', `rotate(${hrDeg} 60 60)`);
        if (mHand) mHand.setAttribute('transform', `rotate(${minDeg} 60 60)`);
        if (sHand) sHand.setAttribute('transform', `rotate(${secDeg} 60 60)`);

        const digEl = widgetEl.querySelector('.clock-widget-digital');
        if (digEl) {
          const use24 = state.settings.clock24h !== false;
          const showSec = !!state.settings.showSeconds;
          digEl.textContent = now.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            ...(showSec ? { second: '2-digit' } : {}),
            hour12: !use24
          });
        }
      };

      const buildClockWidgetEl = (useLiquidGlass) => {
        const now = new Date();
        const ticks = [];
        for (let i = 0; i < 12; i++) {
          ticks.push(`<line x1="60" y1="10" x2="60" y2="${i % 3 === 0 ? 19 : 15}" transform="rotate(${i * 30} 60 60)" class="clock-tick-major" />`);
        }
        const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'home-clock-widget';
        btn.dataset.nav = 'row-widgets';
        btn.className = `home-widget-card clock-widget-card focusable ${useLiquidGlass ? 'is-liquid-glass' : 'is-solid-matte'}`;
        btn.setAttribute('aria-label', 'Relógio');
        btn.innerHTML = `
          <div class="clock-widget-dial-wrap">
            <svg class="clock-widget-svg" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="55" class="clock-dial-face" />
              ${ticks.join('')}
              <line data-hand="hour" x1="60" y1="66" x2="60" y2="34" class="clock-hand-hour" />
              <line data-hand="minute" x1="60" y1="68" x2="60" y2="20" class="clock-hand-minute" />
              <line data-hand="second" x1="60" y1="70" x2="60" y2="16" class="clock-hand-second" />
              <circle cx="60" cy="60" r="3.4" class="clock-center-outer" />
            </svg>
          </div>
          <div class="clock-widget-info">
            <div class="clock-widget-date">${escHtml(dateLabel)}</div>
          </div>
        `;
        updateAnalogClockWidget(btn);
        if (window.__irisAnalogClockTimer) clearInterval(window.__irisAnalogClockTimer);
        window.__irisAnalogClockTimer = setInterval(() => {
          const el = document.getElementById('home-clock-widget');
          if (!el) {
            clearInterval(window.__irisAnalogClockTimer);
            window.__irisAnalogClockTimer = null;
            return;
          }
          if (!document.hidden) updateAnalogClockWidget(el);
        }, 1000);

        btn.addEventListener('mouseenter', () => setFocus(btn, false));
        btn.addEventListener('click', () => {
          playUiSound('select');
          state.activeSettingsSection = 'controls';
          renderTab('settings');
        });
        return btn;
      };

      const buildHomeWidgetsSection = () => {
        if (sHome.showHomeWidgets === false) return null;
        if (sHome.widgetWeather === false && sHome.widgetCalendar === false && sHome.widgetClock === false) return null;

        const section = document.createElement('section');
        section.className = 'tv-row home-widgets-row';
        const header = document.createElement('div');
        header.className = 'row-header';
        header.innerHTML = `
          <div class="row-title-wrap">
            <h2 class="row-title">Widgets</h2>
            <span class="row-subtitle-tag">Tela Inicial</span>
          </div>
          <button class="row-action-btn focusable" type="button" data-nav="row-widgets">Personalizar →</button>
        `;
        header.querySelector('.row-action-btn')?.addEventListener('click', () => {
          playUiSound('select');
          state.activeSettingsSection = 'style';
          renderTab('settings');
        });

        const grid = document.createElement('div');
        grid.className = 'home-widgets-grid';
        const useLiquidGlass = sHome.widgetWeatherLiquidGlass !== false;

        if (sHome.widgetWeather !== false) {
          const weatherBtn = document.createElement('button');
          weatherBtn.type = 'button';
          weatherBtn.id = 'home-weather-widget';
          weatherBtn.dataset.nav = 'row-widgets';
          weatherBtn.className = `home-widget-card weather-widget-card focusable ${useLiquidGlass ? 'is-liquid-glass' : 'is-solid-matte'}`;
          weatherBtn.setAttribute('aria-label', 'Widget de Clima — Clique para abrir o app Clima');
          hydrateWeatherWidgetEl(weatherBtn);
          if (!state.homeWeather) updateTopbarWeather();
          weatherBtn.addEventListener('click', () => {
            playUiSound('select');
            const weatherApp = APPS.find((a) => a.id === 'weather');
            if (weatherApp) launchApp(weatherApp);
          });
          weatherBtn.addEventListener('mouseenter', () => setFocus(weatherBtn, false));
          grid.appendChild(weatherBtn);
        }

        if (sHome.widgetCalendar !== false) {
          grid.appendChild(buildCalendarWidgetEl(useLiquidGlass));
        }

        if (sHome.widgetClock !== false) {
          grid.appendChild(buildClockWidgetEl(useLiquidGlass));
        }

        section.appendChild(header);
        section.appendChild(grid);
        return section;
      };

      const buildHomeSection = {
        widgets: buildHomeWidgetsSection,
        apps: () => (sHome.showHomeApps !== false ? buildRow('Apps', `Brasil • ${APPS.length} instalados`, 'Ver todos & Loja →', () => renderTab('apps'), (track) => {
          APPS.slice(0, 20).forEach((app, idx) => track.appendChild(createAppTile(app, 'row-1', idx)));
        }) : null),
        live: () => (sHome.showHomeLive !== false ? buildRow('TV ao Vivo', `${LIVE_CHANNELS.filter((c) => !state.offlineChannels.has(c.streamUrl)).length} canais`, null, null, (track) => {
          LIVE_CHANNELS.forEach((ch) => track.appendChild(createLiveCard(ch, 'row-2')));
        }, 'live-channels-count') : null),
        continue: () => (sHome.showHomeContinue !== false && CONTINUE_WATCHING.length > 0 ? buildRow('Continuar Assistindo', QUALITY_META[state.settings.streamQuality]?.label || 'Auto', null, null, (track) => {
          CONTINUE_WATCHING.forEach((item) => track.appendChild(createContinueCard(item, 'row-3')));
        }) : null),
        trending: () => (sHome.showHomeTrending !== false ? buildRow('Em Alta Agora', state.settings.kidsMode ? 'Modo Família Ativo' : 'Séries & Filmes', `Ver tudo →`, () => renderTab('shows'), (track) => {
          activeShows.slice(0, 14).forEach((show, idx) => track.appendChild(createPosterCard(show, 'row-4', idx)));
          const cachedAll = showsCatalogCache.get('all||');
          const isFresh = cachedAll && (Date.now() - cachedAll.ts < 5 * 60 * 1000);
          if (!isFresh) {
            const { lang, country } = getCurrentUiLocale();
            fetch(`/api/media/discover?type=ALL&genre=&q=&lang=${encodeURIComponent(lang)}&country=${encodeURIComponent(country)}&limit=40`)
              .then((r) => (r.ok ? r.json() : null))
              .then((j) => {
                if (!j?.items?.length) return;
                showsCatalogCache.set('all||', { ts: Date.now(), items: j.items });
                if (!track.isConnected) return;
                const liveList = state.settings.kidsMode ? j.items.filter(isKidsSafeShow) : j.items;
                if (!liveList.length) return;
                const f = document.createDocumentFragment();
                liveList.slice(0, 14).forEach((show, idx) => f.appendChild(createPosterCard(show, 'row-4', idx)));
                track.innerHTML = '';
                track.appendChild(f);
              })
              .catch(() => { });
          }
        }) : null),
        settings: () => (sHome.showHomeSettings !== false ? buildRow('Ajustes do Sistema', 'Acesso rápido às configurações', 'Abrir Todos →', () => {
          playUiSound('select');
          renderTab('settings');
        }, (track) => {
          const homeSettingsCats = [
            {
              id: 'system',
              title: 'Rede & Wi-Fi',
              sub: 'Conexões sem fio e internet',
              glow: 'rgba(0, 194, 255, 0.24)',
              iconGrad: 'linear-gradient(135deg, #0070f3, #00c2ff)',
              icon: '<svg class="lucide lucide-wifi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>'
            },
            {
              id: 'display',
              title: 'Tela & Cores',
              sub: 'Brilho, temas e resolução',
              glow: 'rgba(255, 0, 128, 0.22)',
              iconGrad: 'linear-gradient(135deg, #7928ca, #ff0080)',
              icon: '<svg class="lucide lucide-monitor" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>'
            },
            {
              id: 'audio',
              title: 'Som & Volume',
              sub: 'Saídas, volume geral e mudo',
              glow: 'rgba(255, 77, 77, 0.22)',
              iconGrad: 'linear-gradient(135deg, #ff0080, #ff4d4d)',
              icon: '<svg class="lucide lucide-volume-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>'
            },
            {
              id: 'style',
              title: 'Personalização',
              sub: 'Cores, widgets e transparência',
              glow: 'rgba(245, 166, 35, 0.22)',
              iconGrad: 'linear-gradient(135deg, #f5a623, #ff7a00)',
              icon: '<svg class="lucide lucide-palette" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg>'
            },
            {
              id: 'playback',
              title: 'Vídeo & Player',
              sub: 'Qualidade e descanso de tela',
              glow: 'rgba(0, 229, 137, 0.2)',
              iconGrad: 'linear-gradient(135deg, #00b86b, #00e589)',
              icon: '<svg class="lucide lucide-clapperboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.296 3.464 3.02 3.956"/><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m6.18 5.276 3.1 3.899"/></svg>'
            },
            {
              id: 'controls',
              title: 'Controles & Remoto',
              sub: 'Navegação, D-pad e hora',
              glow: 'rgba(6, 182, 212, 0.22)',
              iconGrad: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
              icon: '<svg class="lucide lucide-gamepad-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>'
            },
            {
              id: 'system',
              title: 'Sobre o irisOS',
              sub: 'Hardware, versão e energia',
              glow: 'rgba(148, 163, 184, 0.2)',
              iconGrad: 'linear-gradient(135deg, #1e293b, #475569)',
              icon: '<svg class="lucide lucide-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
            }
          ];

          homeSettingsCats.forEach((cat) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'settings-home-card focusable';
            btn.setAttribute('data-nav', 'row-5');
            btn.style.setProperty('--cat-glow', cat.glow);
            btn.innerHTML = `
              <div class="settings-home-icon-box" style="background:${cat.iconGrad}">
                ${cat.icon}
              </div>
              <div class="settings-home-text">
                <span class="settings-home-title">${cat.title}</span>
                <span class="settings-home-sub">${cat.sub}</span>
              </div>
              <span class="settings-home-arrow" aria-hidden="true">→</span>
            `;
            btn.addEventListener('mouseenter', () => setFocus(btn, false));
            btn.addEventListener('click', () => {
              playUiSound('select');
              state.activeSettingsSection = cat.id;
              renderTab('settings');
            });
            track.appendChild(btn);
          });
        }) : null)
      };

      order.forEach((secKey) => {
        const el = buildHomeSection[secKey]?.();
        if (el) frag.appendChild(el);
      });

      rowsContainer.appendChild(frag);
    } else if (tab === 'shows') {
      const pane = document.createElement('div');
      pane.className = 'tab-pane';
      renderShowsAndMoviesTab(pane);
      rowsContainer.replaceChildren(pane);
      state.showsGridDirty = false;
      if (state.activeShowView === 'watched' || state.activeShowView === 'watchlist') {
        renderShowsGridOnly();
      } else {
        loadShowsCatalog();
      }
    } else if (tab === 'news') {
      const pane = document.createElement('div');
      pane.className = 'tab-pane';
      renderNewsTab(pane);
      rowsContainer.replaceChildren(pane);
      renderNewsGridOnly();
      if (!state.newsItems?.length || Date.now() - lastNewsFetchAt > 120000) {
        lastNewsFetchAt = Date.now();
        loadNewsFeed(false);
      }
    } else if (tab === 'apps') {
      const pane = document.createElement('div');
      pane.className = 'tab-pane';
      const section = document.createElement('section');
      section.className = 'tv-row';
      section.innerHTML = `
        <div class="row-header">
          <div class="row-title-wrap"><h2 class="row-title">Todos os Aplicativos</h2><span class="row-count">${APPS.length} instalados</span></div>
          <button id="apps-open-store-btn" class="row-action focusable" type="button">Loja irisStore →</button>
        </div>
        <div class="category-filter-bar">
          <button class="cat-chip ${state.activeAppFilter === 'all' ? 'active' : ''}" data-cat="all">Todos (${APPS.length})</button>
          <button class="cat-chip ${state.activeAppFilter === 'streaming' ? 'active' : ''}" data-cat="streaming">Streaming</button>
          <button class="cat-chip ${state.activeAppFilter === 'music' ? 'active' : ''}" data-cat="music">Música &amp; Vídeo</button>
          <button class="cat-chip ${state.activeAppFilter === 'games' ? 'active' : ''}" data-cat="games">Jogos</button>
          <button class="cat-chip ${state.activeAppFilter === 'utilities' ? 'active' : ''}" data-cat="utilities">Nativos, IA &amp; Casa</button>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'apps-grid-layout';
      const populateAppsGrid = () => {
        const filtered = state.activeAppFilter === 'all' ? APPS : APPS.filter((a) => a.category === state.activeAppFilter);
        renderGridProgressively(grid, filtered, (app, idx) => createAppTile(app, 'row-1', idx), {
          batchSize: 4,
          batchDelayMs: 18,
          label: 'Carregando aplicativos'
        });
        lastAppsFilterRendered = state.activeAppFilter;
        lastAppsCountRendered = APPS.length;
        state.appsGridDirty = false;
      };
      section.appendChild(grid);
      pane.appendChild(section);
      rowsContainer.replaceChildren(pane);
      populateAppsGrid();

      section.querySelector('#apps-open-store-btn')?.addEventListener('click', () => {
        const storeApp = APPS.find((a) => a.id === 'appstore') || window.IrisStore?.getFullCatalog().find((a) => a.id === 'appstore');
        if (storeApp) launchApp(storeApp);
      });

      section.querySelectorAll('.cat-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          playUiSound('move');
          state.activeAppFilter = chip.dataset.cat;
          section.querySelectorAll('.cat-chip').forEach((c) => c.classList.toggle('active', c === chip));
          populateAppsGrid();
        });
      });
      rowsContainer.replaceChildren(pane);
    } else if (tab === 'live') {
      renderLiveTab(frag);
      rowsContainer.appendChild(frag);
    } else if (tab === 'settings') {
      renderSettingsWorkspace(true);
    }

    const tvContent = document.getElementById('tv-content');
    if (tvContent) tvContent.scrollTop = 0;
  }

  navPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      playUiSound('select');
      renderTab(pill.dataset.tab);
    });
  });

  document.getElementById('brand-home-btn').addEventListener('click', () => {
    playUiSound('select');
    renderTab('home');
    document.getElementById('tv-content').scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =========================================================
     Interactive App Stage
     ========================================================= */
  function launchApp(app) {
    if (!app) return;
    if (app.id === 'settings') {
      playUiSound('select');
      renderTab('settings');
      return;
    }
    if (app.id === 'appstore' && window.IrisStore) {
      playUiSound('open');
      window.IrisStore.openAppStoreStage({
        appStageWindow,
        appStageBrand,
        appStageBody,
        appStageOverlay,
        escHtml,
        playUiSound,
        showToast,
        launchApp,
        onInstalledChanged: () => syncInstalledApps()
      });
      setTimeout(() => ensureScopeFocus(), 30);
      return;
    }
    if (window.IrisNativeApps) {
      const nativeCtx = {
        app,
        appStageWindow,
        appStageBrand,
        appStageBody,
        appStageOverlay,
        escHtml,
        playUiSound,
        openWebUrl: (url, name) => {
          if (isNativeWebView) {
            closeAppStage();
            postWebViewAction('openAppUrl', { url, name: name || app.name });
          } else {
            openExternalAppUrl(url);
          }
        }
      };
      if (app.id === 'weather') { playUiSound('open'); window.IrisNativeApps.renderWeatherApp(nativeCtx); ensureScopeFocus(); return; }
      if (app.id === 'calculator') { playUiSound('open'); window.IrisNativeApps.renderCalculatorApp(nativeCtx); ensureScopeFocus(); return; }
      if (app.id === 'clock') { playUiSound('open'); window.IrisNativeApps.renderClockApp(nativeCtx); ensureScopeFocus(); return; }
      if (app.id === 'notes') { playUiSound('open'); window.IrisNativeApps.renderNotesApp(nativeCtx); ensureScopeFocus(); return; }
      if (app.id === 'browser') { playUiSound('open'); window.IrisNativeApps.renderBrowserApp(nativeCtx); ensureScopeFocus(); return; }
    }
    if (window.IrisNativeGames) {
      const gameCtx = { app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound };
      if (app.id === 'snake') { playUiSound('open'); window.IrisNativeGames.renderSnake(gameCtx); return; }
      if (app.id === 'game2048') { playUiSound('open'); window.IrisNativeGames.render2048(gameCtx); return; }
      if (app.id === 'tetris') { playUiSound('open'); window.IrisNativeGames.renderTetris(gameCtx); return; }
      if (app.id === 'pong') { playUiSound('open'); window.IrisNativeGames.renderPong(gameCtx); return; }
      if (app.id === 'memory') { playUiSound('open'); window.IrisNativeGames.renderMemory(gameCtx); ensureScopeFocus(); return; }
    }
    if (app.id === 'mediaplayer' && window.IrisMediaPlayer) {
      playUiSound('open');
      window.IrisMediaPlayer.renderMediaPlayer({ app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound, showToast });
      ensureScopeFocus();
      return;
    }
    if (app.id === 'smarthome') {
      openAppStage(app);
      return;
    }
    if (app.isApk || app.androidPackage || app.webUrl) {
      if (window.IrisWebOS?.isWebOS && window.IrisWebOS.launchApp(app.id, app.webUrl)) {
        playUiSound('open');
        closeAppStage();
        return;
      }
      if (isNativeWebView) {
        playUiSound('open');
        closeAppStage();
        postWebViewAction('openAppUrl', {
          url: app.webUrl,
          name: app.name,
          androidPackage: app.androidPackage,
          id: app.id,
          iconSrc: app.iconSrc || '',
          bg: app.bg || ''
        });
        return;
      }
      playUiSound('open');
      closeAppStage();
      openExternalAppUrl(app.webUrl, app.name, app);
      return;
    }
    openAppStage(app);
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getCurrentUiLocale() {
    const raw = (navigator.language || 'pt-BR').trim();
    const parts = raw.split(/[-_]/);
    return {
      lang: (parts[0] || 'pt').toLowerCase(),
      country: (parts[1] || (parts[0] === 'pt' ? 'BR' : parts[0] === 'es' ? 'ES' : 'US')).toUpperCase()
    };
  }

  function getDetailsLabels(lang) {
    const table = {
      pt: {
        loading: 'Carregando informações, elenco, avaliações e onde assistir...',
        watchNow: 'Assistir Prévia / Stream',
        favAdd: 'Adicionar aos Favoritos',
        favIn: 'Nos Favoritos',
        synopsis: 'Sinopse',
        whereToWatch: 'Onde Ver',
        whereToWatchHint: 'Clique para abrir no site oficial',
        noProviders: 'Disponibilidade regional indisponível no momento.',
        cast: 'Elenco',
        episodes: 'Episódios e Avaliações',
        season: 'Temporada',
        epWord: 'Ep.',
        ratings: 'Avaliações Gerais',
        min: 'min',
        types: { FLATRATE: 'Assinatura', FREE: 'Grátis', ADS: 'Grátis com anúncios', RENT: 'Aluguel', BUY: 'Compra' }
      },
      en: {
        loading: 'Loading details, cast, ratings, and where to watch...',
        watchNow: 'Watch Preview / Stream',
        favAdd: 'Add to Favorites',
        favIn: 'In Favorites',
        synopsis: 'Synopsis',
        whereToWatch: 'Where to Watch',
        whereToWatchHint: 'Click to open official site',
        noProviders: 'Regional streaming offers unavailable right now.',
        cast: 'Cast',
        episodes: 'Episodes & Ratings',
        season: 'Season',
        epWord: 'Ep.',
        ratings: 'Overall Ratings',
        min: 'min',
        types: { FLATRATE: 'Subscription', FREE: 'Free', ADS: 'Free with ads', RENT: 'Rent', BUY: 'Buy' }
      },
      es: {
        loading: 'Cargando detalles, reparto, calificaciones y dónde ver...',
        watchNow: 'Ver Avance / Stream',
        favAdd: 'Añadir a Favoritos',
        favIn: 'En Favoritos',
        synopsis: 'Sinopsis',
        whereToWatch: 'Dónde Ver',
        whereToWatchHint: 'Haz clic para abrir el sitio oficial',
        noProviders: 'Ofertas de streaming no disponibles por ahora.',
        cast: 'Reparto',
        episodes: 'Episodios y Calificaciones',
        season: 'Temporada',
        epWord: 'Ep.',
        ratings: 'Calificaciones Generales',
        min: 'min',
        types: { FLATRATE: 'Suscripción', FREE: 'Gratis', ADS: 'Gratis con anuncios', RENT: 'Alquiler', BUY: 'Compra' }
      }
    };
    return table[lang] || table.en;
  }

  const mediaClientCache = new Map();
  let activeDetailsAbortCtrl = null;
  let currentDetailsShow = null;

  function syncSingleShowCardStatus(show) {
    if (!show) return;
    const card = document.querySelector(`.poster-card[data-show-id="${show.id}"]`);
    if (!card) return;
    const tr = getTrackEntry(show);
    const statusBadges = [
      tr?.watched ? '<span class="poster-mini-pill watched">Visto</span>' : '',
      !tr?.watched && tr?.watchlist ? '<span class="poster-mini-pill watchlist">Quero Ver</span>' : '',
      !tr?.watched && tr?.watchedEpisodes?.length ? `<span class="poster-mini-pill">${tr.watchedEpisodes.length} eps</span>` : '',
      tr?.userRating ? `<span class="poster-mini-pill rate">Nota ${tr.userRating}</span>` : ''
    ].filter(Boolean).join('');
    let st = card.querySelector('.poster-card-status');
    if (statusBadges) {
      if (!st) {
        st = document.createElement('div');
        st.className = 'poster-card-status';
        card.appendChild(st);
      }
      st.innerHTML = statusBadges;
    } else if (st) {
      st.remove();
    }
  }

  async function openMediaDetails(show) {
    if (!show) return;
    currentDetailsShow = show;
    if (activeDetailsAbortCtrl) {
      try { activeDetailsAbortCtrl.abort(); } catch (_) { }
      activeDetailsAbortCtrl = null;
    }
    const abortCtrl = new AbortController();
    activeDetailsAbortCtrl = abortCtrl;
    playUiSound('open');
    const { lang, country } = getCurrentUiLocale();
    const L = getDetailsLabels(lang);

    appStageWindow.classList.add('is-details-mode');
    appStageWindow.style.setProperty('--stage-glow', show.glow || 'rgba(0,194,255,0.55)');
    const matchedApp = APPS.find((a) => a.id === show.appId);
    const appIconHtml = matchedApp?.iconSrc
      ? `<img src="${matchedApp.iconSrc}" alt="${escHtml(show.appName)}" />`
      : '';

    appStageBrand.innerHTML = `
      ${appIconHtml ? `<div class="app-stage-brand-icon" style="background:${matchedApp.bg}">${appIconHtml}</div>` : ''}
      <div class="app-stage-brand-title">${escHtml(show.title)}</div>
    `;

    let currentSeason = 1;
    let latestData = null;

    const renderView = (data, isLoading = false) => {
      if (data) latestData = data;
      const d = latestData || data || {};
      const title = d.title || show.title;
      const backdrop = d.backdrop || show.bgImg || show.poster;
      const poster = d.poster || show.poster || show.bgImg;
      const synopsis = d.synopsis || show.desc || '';
      const isFav = state.favorites.has(show.id);
      const tr = getTrackEntry(d.title ? { ...show, ...d } : show) || {};
      const watchedSet = new Set(tr.watchedEpisodes || []);
      const genresText = (d.genres && d.genres.length) ? d.genres.join(' • ') : '';
      const ratings = d.ratings || {};
      const ratingPills = [
        ratings.imdb ? `<span class="rating-pill">IMDb ${ratings.imdb}${ratings.imdbVotes ? ` (${Math.round(ratings.imdbVotes / 1000)}k)` : ''}</span>` : '',
        ratings.rottenTomatoes ? `<span class="rating-pill">Rotten Tomatoes ${ratings.rottenTomatoes}%</span>` : '',
        ratings.tmdb ? `<span class="rating-pill">TMDB ${ratings.tmdb}/10</span>` : '',
        ratings.tvmaze ? `<span class="rating-pill">TVMaze ${ratings.tvmaze}</span>` : ''
      ].filter(Boolean).join('');

      const fallbackProvider = matchedApp?.webUrl
        ? [{ id: matchedApp.id, name: matchedApp.name, monetizationType: 'FLATRATE', quality: '', url: matchedApp.webUrl, icon: matchedApp.iconSrc }]
        : [];
      const providers = (d.providers && d.providers.length) ? d.providers : fallbackProvider;

      const seasons = [...new Set((d.episodes || []).map((ep) => ep.season))].sort((a, b) => a - b);
      if (seasons.length && !seasons.includes(currentSeason)) currentSeason = seasons[0];

      const isSeasonFullyWatched = (sNum) => {
        const eps = (d.episodes || []).filter((ep) => ep.season === sNum);
        return eps.length > 0 && eps.every((ep) => watchedSet.has(`${sNum}x${ep.number}`));
      };

      const buildEpisodesHtml = (seasonNum) => {
        const eps = (d.episodes || []).filter((ep) => ep.season === seasonNum);
        if (!eps.length) return '';
        const curSet = new Set((getTrackEntry(show)?.watchedEpisodes) || []);
        return eps.map((ep) => {
          const epKey = `${seasonNum}x${ep.number}`;
          const epDone = curSet.has(epKey);
          return `
            <div class="episode-card">
              ${ep.image ? `<img class="episode-thumb" src="${escHtml(ep.image)}" alt="" loading="lazy" decoding="async" />` : ''}
              <div class="episode-meta">
                <div class="episode-head">
                  <span class="episode-title">${L.epWord} ${ep.number} • ${escHtml(ep.name)}</span>
                  ${ep.rating ? `<span class="episode-score">Nota ${ep.rating}</span>` : ''}
                </div>
                <div class="episode-sub">${[ep.airdate, ep.runtime ? `${ep.runtime} ${L.min}` : ''].filter(Boolean).join(' • ')}</div>
                ${ep.summary ? `<div class="episode-desc">${escHtml(ep.summary)}</div>` : ''}
                <button class="ep-watched-btn ${epDone ? 'is-watched' : ''}" type="button" data-ep-toggle="${epKey}">
                  ${epDone ? 'Episódio Visto' : 'Marcar como Visto'}
                </button>
              </div>
            </div>
          `;
        }).join('');
      };

      const renderPickerBody = () => {
        const pickerEl = document.getElementById('details-watched-picker');
        if (!pickerEl || pickerEl.classList.contains('hidden')) return;
        const entry = getTrackEntry(show) || {};
        const curSet = new Set(entry.watchedEpisodes || []);
        const totalEps = (d.episodes || []).length;
        const seenCount = entry.watched ? totalEps : curSet.size;
        const pickerEps = (d.episodes || []).filter((ep) => ep.season === currentSeason);
        const seasonAllDone = pickerEps.length > 0 && pickerEps.every((ep) => curSet.has(`${currentSeason}x${ep.number}`));

        pickerEl.innerHTML = `
          <div class="watched-picker-top">
            <div class="watched-picker-title">Progresso na série • ${seenCount}/${totalEps} episódios</div>
            <div class="watched-picker-actions">
              <button id="picker-all-seasons-btn" class="btn-glass ${entry.watched || (totalEps > 0 && seenCount === totalEps) ? 'is-tracked-on' : ''}" type="button" style="height:32px;font-size:0.78rem;padding:0 12px;"> Todas as Temporadas</button>
              <button id="picker-clear-all-btn" class="btn-glass" type="button" style="height:32px;font-size:0.78rem;padding:0 12px;">Limpar</button>
              <button id="picker-close-btn" class="btn-prism" type="button" style="height:32px;font-size:0.78rem;padding:0 14px;">Concluir</button>
            </div>
          </div>
          <div class="watched-picker-seasons">
            ${seasons.map((sNum) => {
          const sEps = (d.episodes || []).filter((ep) => ep.season === sNum);
          const sDone = sEps.filter((ep) => curSet.has(`${sNum}x${ep.number}`)).length;
          const isFull = sEps.length > 0 && sDone === sEps.length;
          return `<button class="picker-season-pill ${sNum === currentSeason ? 'active' : ''} ${isFull ? 'is-full' : ''}" type="button" data-picker-season="${sNum}">T${sNum} (${sDone}/${sEps.length})${isFull ? ' ' : ''}</button>`;
        }).join('')}
          </div>
          <div class="watched-picker-ep-header">
            <span>Episódios da Temporada ${currentSeason}</span>
            <button id="picker-season-full-btn" class="btn-glass ${seasonAllDone ? 'is-tracked-on' : ''}" type="button" style="height:30px;font-size:0.75rem;padding:0 12px;">
              ${seasonAllDone ? `Temporada ${currentSeason} Inteira Vista` : `Marcar Temporada ${currentSeason} Inteira`}
            </button>
          </div>
          <div class="watched-picker-eps">
            ${pickerEps.map((ep) => {
          const k = `${currentSeason}x${ep.number}`;
          const done = curSet.has(k);
          return `<button class="picker-ep-chip ${done ? 'is-watched' : ''}" type="button" data-picker-ep="${k}" title="${escHtml(ep.name)}">${done ? ' ' : ''}E${ep.number} • ${escHtml(ep.name)}</button>`;
        }).join('')}
          </div>
        `;

        pickerEl.querySelector('#picker-close-btn')?.addEventListener('click', () => {
          playUiSound('select');
          pickerEl.classList.add('hidden');
        });

        pickerEl.querySelector('#picker-all-seasons-btn')?.addEventListener('click', () => {
          const allKeys = (d.episodes || []).map((ep) => `${ep.season}x${ep.number}`);
          upsertTrackEntry(show, latestData, { watched: true, watchlist: false, watchedEpisodes: allKeys });
          playUiSound('select');
          syncDetailsTrackerUi();
        });

        pickerEl.querySelector('#picker-clear-all-btn')?.addEventListener('click', () => {
          upsertTrackEntry(show, latestData, { watched: false, watchedEpisodes: [] });
          playUiSound('back');
          syncDetailsTrackerUi();
        });

        pickerEl.querySelector('#picker-season-full-btn')?.addEventListener('click', () => {
          const sKeys = (d.episodes || []).filter((ep) => ep.season === currentSeason).map((ep) => `${currentSeason}x${ep.number}`);
          const nextSet = new Set((getTrackEntry(show)?.watchedEpisodes) || []);
          const allDoneNow = sKeys.length > 0 && sKeys.every((k) => nextSet.has(k));
          if (allDoneNow) sKeys.forEach((k) => nextSet.delete(k));
          else sKeys.forEach((k) => nextSet.add(k));
          const totalAll = (d.episodes || []).length;
          const fullShowDone = totalAll > 0 && nextSet.size >= totalAll;
          upsertTrackEntry(show, latestData, {
            watchedEpisodes: [...nextSet],
            watched: fullShowDone,
            ...(nextSet.size > 0 ? { watchlist: false } : {})
          });
          playUiSound(allDoneNow ? 'back' : 'select');
          syncDetailsTrackerUi();
        });

        pickerEl.querySelectorAll('[data-picker-season]').forEach((btn) => {
          btn.addEventListener('click', () => {
            playUiSound('move');
            currentSeason = Number(btn.dataset.pickerSeason);
            updateSeasonEpisodeListDom();
            syncDetailsTrackerUi();
          });
        });

        pickerEl.querySelectorAll('[data-picker-ep]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const epKey = btn.dataset.pickerEp;
            const nextSet = new Set((getTrackEntry(show)?.watchedEpisodes) || []);
            if (nextSet.has(epKey)) nextSet.delete(epKey);
            else nextSet.add(epKey);
            const totalAll = (d.episodes || []).length;
            const fullShowDone = totalAll > 0 && nextSet.size >= totalAll;
            upsertTrackEntry(show, latestData, {
              watchedEpisodes: [...nextSet],
              watched: fullShowDone,
              ...(nextSet.size > 0 ? { watchlist: false } : {})
            });
            playUiSound(nextSet.has(epKey) ? 'select' : 'back');
            syncDetailsTrackerUi();
          });
        });
      };

      const bindEpisodeButtons = () => {
        const listEl = document.getElementById('details-episodes-list');
        if (!listEl) return;
        listEl.querySelectorAll('[data-ep-toggle]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const epKey = btn.dataset.epToggle;
            const cur = new Set((getTrackEntry(show)?.watchedEpisodes) || []);
            if (cur.has(epKey)) cur.delete(epKey);
            else cur.add(epKey);
            const totalAll = (d.episodes || []).length;
            const fullShowDone = totalAll > 0 && cur.size >= totalAll;
            upsertTrackEntry(show, latestData, {
              watchedEpisodes: [...cur],
              watched: fullShowDone,
              ...(cur.size > 0 ? { watchlist: false } : {})
            });
            playUiSound(cur.has(epKey) ? 'select' : 'back');
            syncDetailsTrackerUi();
          });
        });
      };

      const updateSeasonEpisodeListDom = () => {
        const listEl = document.getElementById('details-episodes-list');
        if (listEl) {
          listEl.innerHTML = buildEpisodesHtml(currentSeason);
          bindEpisodeButtons();
        }
      };

      const syncDetailsTrackerUi = () => {
        const entry = getTrackEntry(d.title ? { ...show, ...d } : show) || {};
        const curSet = new Set(entry.watchedEpisodes || []);
        const totalEps = (d.episodes || []).length;
        const seenEps = curSet.size;

        const wBtn = document.getElementById('details-watched-btn');
        if (wBtn) {
          const hasAny = entry.watched || seenEps > 0;
          wBtn.classList.toggle('is-tracked-on', hasAny);
          if (entry.watched) wBtn.textContent = 'Já Vi';
          else if (seenEps > 0) wBtn.textContent = `Vistos (${seenEps}/${totalEps || seenEps})`;
          else wBtn.textContent = seasons.length ? 'Já Vi / Episódios' : 'Marcar como Visto';
        }

        const wlBtn = document.getElementById('details-watchlist-btn');
        if (wlBtn) {
          const isWl = Boolean(entry.watchlist && !entry.watched);
          wlBtn.classList.toggle('is-watchlist-on', isWl);
          wlBtn.textContent = isWl ? 'Quero Ver' : '+ Quero Ver';
        }

        const rating = Number(entry.userRating || 0);
        appStageBody.querySelectorAll('[data-star-val]').forEach((sb) => {
          sb.classList.toggle('active', rating >= Number(sb.dataset.starVal));
        });
        const sLabel = appStageBody.querySelector('.star-label');
        if (sLabel) sLabel.textContent = rating ? `${rating}/5` : 'Avaliar';

        appStageBody.querySelectorAll('[data-season-tab]').forEach((tab) => {
          const sNum = Number(tab.dataset.seasonTab);
          const sEps = (d.episodes || []).filter((ep) => ep.season === sNum);
          const full = sEps.length > 0 && sEps.every((ep) => curSet.has(`${sNum}x${ep.number}`));
          tab.classList.toggle('active', sNum === currentSeason);
          tab.textContent = `${L.season} ${sNum}${full ? ' (Visto)' : ''}`;
        });

        const swBtn = document.getElementById('details-season-watched-btn');
        if (swBtn) {
          const sEps = (d.episodes || []).filter((ep) => ep.season === currentSeason);
          const full = sEps.length > 0 && sEps.every((ep) => curSet.has(`${currentSeason}x${ep.number}`));
          swBtn.classList.toggle('is-tracked-on', full);
          swBtn.textContent = full ? `Temporada ${currentSeason} Vista` : `Marcar Temporada ${currentSeason} como Vista`;
        }

        appStageBody.querySelectorAll('[data-ep-toggle]').forEach((btn) => {
          const done = curSet.has(btn.dataset.epToggle);
          btn.classList.toggle('is-watched', done);
          btn.textContent = done ? 'Episódio Visto' : 'Marcar como Visto';
        });

        renderPickerBody();
      };

      const starHtml = [1, 2, 3, 4, 5].map((n) => `
        <button class="star-btn ${(tr.userRating || 0) >= n ? 'active' : ''}" type="button" data-star-val="${n}" aria-label="Avaliar ${n} estrelas">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5z"/></svg>
        </button>
      `).join('');

      appStageBody.innerHTML = `
        <div class="details-hero" style="background-image: linear-gradient(95deg, rgba(6,8,16,0.94) 0%, rgba(6,8,16,0.78) 55%, rgba(6,8,16,0.62) 100%), url('${escHtml(backdrop)}')">
          <img class="details-poster" src="${escHtml(poster)}" alt="${escHtml(title)}" />
          <div class="details-main">
            <h2 class="details-title">${escHtml(title)}</h2>
            <div class="details-meta-row">
              ${d.ageRating ? `<span class="details-age-badge">${escHtml(d.ageRating)}</span>` : ''}
              ${d.year ? `<span>${d.year}</span>` : ''}
              ${d.runtime ? `<span>• ${d.runtime} ${L.min}</span>` : ''}
              ${d.network ? `<span>• ${escHtml(d.network)}</span>` : ''}
              ${d.status ? `<span>• ${escHtml(d.status)}</span>` : ''}
              ${genresText ? `<span>• ${escHtml(genresText)}</span>` : ''}
            </div>
            ${ratingPills ? `<div class="details-ratings-row">${ratingPills}</div>` : ''}
            ${synopsis ? `<p class="details-synopsis">${escHtml(synopsis)}</p>` : ''}
            ${isLoading ? `<p style="font-size:0.82rem;color:var(--iris-cyan)">${L.loading}</p>` : ''}
            <div class="details-actions">
              <div class="watch-split-wrap" id="watch-split-wrap">
                <button id="details-play-btn" class="watch-split-main" type="button">▶ Assistir</button>
                <button id="details-watch-arrow" class="watch-split-arrow" type="button" aria-haspopup="true" aria-expanded="false" title="Opções de reprodução">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <div id="details-watch-menu" class="watch-split-menu hidden" role="menu">
                  <button id="details-trailer-btn" class="watch-split-item" type="button" role="menuitem">▶ Assistir Trailer</button>
                </div>
              </div>
              <button id="details-watched-btn" class="btn-glass" type="button">Marcar como Visto</button>
              <button id="details-watchlist-btn" class="btn-glass" type="button">+ Quero Ver</button>
              <div class="star-rating-bar" title="Sua avaliação">
                ${starHtml}
                <span class="star-label">${tr.userRating ? `${tr.userRating}/5` : 'Avaliar'}</span>
              </div>
              <button id="details-fav-btn" class="btn-glass" type="button">${isFav ? `${L.favIn}` : `+ ${L.favAdd}`}</button>
            </div>
          </div>
        </div>

        <div id="details-watched-picker" class="watched-picker-panel hidden"></div>

        <div class="details-section">
          <div class="details-section-title">
            <span>${L.whereToWatch}</span>
            <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:500;">${L.whereToWatchHint}</span>
          </div>
          <div class="details-providers-grid">
            ${providers.length
          ? providers.map((p) => `
                <button class="provider-card" type="button" data-provider-url="${escHtml(p.url)}" data-provider-name="${escHtml(p.name)}">
                  ${p.icon ? `<img class="provider-icon" src="${escHtml(p.icon)}" alt="${escHtml(p.name)}" />` : ''}
                  <div class="provider-info">
                    <strong>${escHtml(p.name)} ↗</strong>
                    <span>${[L.types[p.monetizationType] || p.monetizationType, p.quality].filter(Boolean).join(' • ')}</span>
                  </div>
                </button>
              `).join('')
          : `<span style="color:var(--text-secondary);font-size:0.86rem;">${L.noProviders}</span>`
        }
          </div>
        </div>

        ${(d.cast && d.cast.length) ? `
          <div class="details-section">
            <div class="details-section-title"><span>${L.cast}</span></div>
            <div class="cast-strip">
              ${d.cast.slice(0, 14).map((actor) => `
                <div class="cast-card">
                  ${actor.photo
            ? `<img class="cast-photo" src="${escHtml(actor.photo)}" alt="${escHtml(actor.name)}" loading="lazy" decoding="async" />`
            : `<div class="cast-photo" style="display:grid;place-items:center;font-weight:800;font-size:1.3rem;">${escHtml((actor.name || '?')[0])}</div>`
          }
                  <div class="cast-name">${escHtml(actor.name)}</div>
                  ${actor.character ? `<div class="cast-role">${escHtml(actor.character)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${seasons.length ? `
          <div class="details-section">
            <div class="details-section-title"><span>${L.episodes}</span></div>
            <div class="season-bar-wrap">
              <div class="season-tabs">
                ${seasons.map((sNum) => `<button class="cat-chip ${sNum === currentSeason ? 'active' : ''}" type="button" data-season-tab="${sNum}">${L.season} ${sNum}</button>`).join('')}
              </div>
              <button id="details-season-watched-btn" class="btn-glass" type="button" style="height:32px;font-size:0.78rem;padding:0 12px;"></button>
            </div>
            <div id="details-episodes-list" class="episodes-list">${buildEpisodesHtml(currentSeason)}</div>
          </div>
        ` : ''}
      `;

      syncDetailsTrackerUi();

      appStageBody.querySelector('#details-play-btn')?.addEventListener('click', () => {
        playUiSound('open');
        const primaryProvider = providers.find((p) => p && p.url) || fallbackProvider[0];
        if (primaryProvider?.url) {
          if (isNativeWebView) {
            closeAppStage();
            postWebViewAction('openAppUrl', { url: primaryProvider.url, name: primaryProvider.name || title });
          } else {
            openExternalAppUrl(primaryProvider.url, primaryProvider.name || title, { id: primaryProvider.id || matchedApp?.id || '' });
          }
          return;
        }
        if (show.streamUrl) {
          closeAppStage();
          openCinemaPlayer({
            title,
            sub: show.sub || d.genres?.join(' • '),
            appName: show.appName || 'irisTV',
            bgImg: backdrop,
            streamUrl: show.streamUrl
          });
        }
      });

      const watchMenu = appStageBody.querySelector('#details-watch-menu');
      const watchArrow = appStageBody.querySelector('#details-watch-arrow');
      watchArrow?.addEventListener('click', (e) => {
        e.stopPropagation();
        playUiSound('move');
        const isHidden = watchMenu?.classList.toggle('hidden');
        watchArrow.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
      });

      appStageBody.addEventListener('click', (e) => {
        if (watchMenu && !watchMenu.classList.contains('hidden') && !e.target.closest('#watch-split-wrap')) {
          watchMenu.classList.add('hidden');
          watchArrow?.setAttribute('aria-expanded', 'false');
        }
      });

      appStageBody.querySelector('#details-trailer-btn')?.addEventListener('click', async () => {
        playUiSound('open');
        watchMenu?.classList.add('hidden');
        watchArrow?.setAttribute('aria-expanded', 'false');
        let ytId = d.trailerYoutubeId || latestData?.trailerYoutubeId;
        if (!ytId) {
          try {
            const q = new URLSearchParams({ title: d.originalTitle || show.title, type: d.type || 'ALL', lang, country });
            const r = await fetch(`/api/media/details?${q.toString()}`);
            if (r.ok) {
              const res = await r.json();
              ytId = res?.trailerYoutubeId || null;
              if (res) latestData = res;
            }
          } catch (_) { }
        }
        if (ytId) {
          const ytWatchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
          const modal = document.createElement('div');
          modal.className = 'trailer-modal-overlay';
          modal.innerHTML = `
            <div class="trailer-cinema-bar">
              <button class="player-back-btn" type="button" id="close-trailer-modal">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span>Voltar</span>
              </button>
              <div class="trailer-cinema-meta">
                <strong>${escHtml(title)}</strong>
                <span>Trailer Oficial</span>
              </div>
              <a class="btn-glass trailer-yt-link" href="${ytWatchUrl}" target="_blank" rel="noopener noreferrer">Abrir no YouTube ↗</a>
            </div>
            <div class="trailer-cinema-stage">
              <iframe class="trailer-modal-frame" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
            </div>
          `;
          const closeTrailer = () => {
            modal.remove();
            document.removeEventListener('keydown', onEscTrailer, true);
          };
          const onEscTrailer = (ev) => {
            if (ev.key === 'Escape') {
              ev.preventDefault();
              ev.stopPropagation();
              closeTrailer();
            }
          };
          document.addEventListener('keydown', onEscTrailer, true);
          modal.querySelector('#close-trailer-modal')?.addEventListener('click', closeTrailer);
          document.body.appendChild(modal);
        } else {
          window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent((d.originalTitle || title) + ' official trailer')}`, '_blank', 'noopener,noreferrer');
        }
      });

      appStageBody.querySelector('#details-watched-btn')?.addEventListener('click', () => {
        if (seasons.length > 0) {
          const pickerEl = document.getElementById('details-watched-picker');
          if (pickerEl) {
            const wasHidden = pickerEl.classList.toggle('hidden');
            playUiSound(wasHidden ? 'back' : 'select');
            if (!wasHidden) renderPickerBody();
          }
          return;
        }
        const curWatched = Boolean(getTrackEntry(show)?.watched);
        upsertTrackEntry(show, latestData, { watched: !curWatched, watchlist: curWatched ? Boolean(getTrackEntry(show)?.watchlist) : false });
        playUiSound(!curWatched ? 'select' : 'back');
        syncDetailsTrackerUi();
      });

      appStageBody.querySelector('#details-watchlist-btn')?.addEventListener('click', () => {
        const curWl = Boolean(getTrackEntry(show)?.watchlist);
        upsertTrackEntry(show, latestData, { watchlist: !curWl });
        playUiSound(!curWl ? 'select' : 'back');
        syncDetailsTrackerUi();
      });

      appStageBody.querySelectorAll('[data-star-val]').forEach((sBtn) => {
        sBtn.addEventListener('click', () => {
          const val = Number(sBtn.dataset.starVal);
          const curRating = Number(getTrackEntry(show)?.userRating || 0);
          const nextRating = curRating === val ? 0 : val;
          upsertTrackEntry(show, latestData, { userRating: nextRating, ...(nextRating > 0 && !seasons.length ? { watched: true, watchlist: false } : {}) });
          playUiSound('select');
          syncDetailsTrackerUi();
        });
      });

      appStageBody.querySelector('#details-season-watched-btn')?.addEventListener('click', () => {
        const sEps = (d.episodes || []).filter((ep) => ep.season === currentSeason).map((ep) => `${currentSeason}x${ep.number}`);
        const nextSet = new Set((getTrackEntry(show)?.watchedEpisodes) || []);
        const allDone = sEps.length > 0 && sEps.every((k) => nextSet.has(k));
        if (allDone) sEps.forEach((k) => nextSet.delete(k));
        else sEps.forEach((k) => nextSet.add(k));
        const totalAll = (d.episodes || []).length;
        const fullShowDone = totalAll > 0 && nextSet.size >= totalAll;
        upsertTrackEntry(show, latestData, { watchedEpisodes: [...nextSet], watched: fullShowDone, ...(nextSet.size > 0 ? { watchlist: false } : {}) });
        playUiSound(allDone ? 'back' : 'select');
        syncDetailsTrackerUi();
      });

      appStageBody.querySelector('#details-fav-btn')?.addEventListener('click', (e) => {
        if (state.favorites.has(show.id)) state.favorites.delete(show.id);
        else state.favorites.add(show.id);
        saveFavorites();
        const activeNow = state.favorites.has(show.id);
        e.currentTarget.textContent = activeNow ? `${L.favIn}` : `+ ${L.favAdd}`;
        playUiSound(activeNow ? 'select' : 'back');
        if (state.spotlightTarget?.data?.id === show.id) setSpotlightItem(state.spotlightTarget);
      });

      appStageBody.querySelectorAll('[data-provider-url]').forEach((card) => {
        card.addEventListener('click', () => {
          const pUrl = card.dataset.providerUrl;
          const pName = card.dataset.providerName || 'Streaming';
          playUiSound('open');
          if (isNativeWebView) {
            closeAppStage();
            postWebViewAction('openAppUrl', { url: pUrl, name: pName });
          } else {
            openExternalAppUrl(pUrl);
          }
        });
      });

      appStageBody.querySelectorAll('[data-season-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
          playUiSound('move');
          currentSeason = Number(tab.dataset.seasonTab);
          updateSeasonEpisodeListDom();
          syncDetailsTrackerUi();
        });
      });

      bindEpisodeButtons();
    };

    const renderLoadingView = () => {
      appStageBody.innerHTML = `
        <div class="details-loading-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:360px;gap:16px;padding:40px;text-align:center;">
          <div class="loading-spinner" style="width:42px;height:42px;border:3px solid rgba(255,255,255,0.16);border-top-color:var(--accent-color, #00c2ff);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <p style="font-size:0.95rem;color:var(--text-secondary);font-weight:500;">${escHtml(L.loading)}</p>
        </div>
      `;
    };

    const queryTitle = show.originalTitle || show.title;
    const cKey = `${show.type || 'ALL'}|${queryTitle}|${lang}|${country}`;
    if (mediaClientCache.has(cKey)) {
      renderView(mediaClientCache.get(cKey), false);
      appStageOverlay.classList.remove('hidden');
      return;
    }

    renderLoadingView();
    appStageOverlay.classList.remove('hidden');

    try {
      const resp = await fetch(`/api/media/details?title=${encodeURIComponent(queryTitle)}&type=${encodeURIComponent(show.type || 'ALL')}&lang=${encodeURIComponent(lang)}&country=${encodeURIComponent(country)}`, {
        signal: abortCtrl.signal
      });
      if (abortCtrl.signal.aborted) return;
      if (resp.ok) {
        const json = await resp.json();
        mediaClientCache.set(cKey, json);
        if (!appStageOverlay.classList.contains('hidden') && activeDetailsAbortCtrl === abortCtrl) {
          renderView(json, false);
        }
      } else if (!appStageOverlay.classList.contains('hidden') && activeDetailsAbortCtrl === abortCtrl) {
        appStageBody.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-secondary);">Não foi possível carregar os dados oficiais.</div>`;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!appStageOverlay.classList.contains('hidden') && activeDetailsAbortCtrl === abortCtrl) {
        appStageBody.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-secondary);">Não foi possível carregar os dados oficiais.</div>`;
      }
    }
  }

  function openAppStage(app, customMedia = null) {
    if (app.id === 'settings') {
      playUiSound('select');
      renderTab('settings');
      return;
    }

    playUiSound('open');
    appStageWindow.classList.remove('is-details-mode', 'is-store-mode');
    appStageWindow.classList.add('is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', app.glow);
    const brandIconHtml = app.iconSrc
      ? `<img src="${app.iconSrc}" alt="${app.name}" />`
      : app.icon;

    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon" style="background:${app.bg}">${brandIconHtml}</div>
      <div class="app-stage-brand-title">${app.name}</div>
    `;

    if (app.id === 'smarthome') {
      renderSmartHomeStage();
    } else if (app.id === 'spotify' || app.id === 'applemusic' || app.id === 'deezer') {
      renderMusicStage(app);
    } else {
      renderMediaAppStage(app, customMedia);
    }

    appStageOverlay.classList.remove('hidden');
    setTimeout(() => ensureScopeFocus(), 30);
  }

  function openLiveStage(ch) {
    playUiSound('select');
    appStageWindow.style.setProperty('--stage-glow', ch.orbs[0]);
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${ch.iconSrc}" alt="${ch.name}" /></div>
      <div class="app-stage-brand-title">Canal ${ch.num} • ${ch.name}</div>
    `;

    appStageBody.innerHTML = `
      <div class="stage-hero-banner" style="background:${ch.bg}">
        <span class="hero-badge prism-tag" style="width:fit-content">● AO VIVO AGORA</span>
        <h2>${ch.name}</h2>
        <p>${ch.program} • ${ch.next}</p>
      </div>
      <div>
        <h3 style="font-family:Outfit,sans-serif;font-size:1rem;margin-bottom:10px;">Trocar de Canal</h3>
        <div class="stage-cards-grid">
          ${LIVE_CHANNELS.map((c) => `
            <div class="stage-mini-card" data-zap-num="${c.num}">
              <strong>${c.num} • ${c.name}</strong>
              <span>${c.program}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    appStageBody.querySelectorAll('[data-zap-num]').forEach((card) => {
      card.addEventListener('click', () => {
        const nextCh = LIVE_CHANNELS.find((c) => c.num === card.dataset.zapNum);
        if (nextCh) openLiveStage(nextCh);
      });
    });

    appStageOverlay.classList.remove('hidden');
    setTimeout(() => ensureScopeFocus(), 30);
  }

  function renderMediaAppStage(app, customMedia) {
    const appShows = TRENDING_SHOWS.filter((s) => s.appId === app.id);
    const defaultShow = appShows[0];
    const headline = customMedia ? customMedia.title : (defaultShow ? defaultShow.title : app.name);
    const sub = customMedia ? customMedia.subtitle : (defaultShow ? defaultShow.sub : app.tagline);
    const bgImg = (customMedia && customMedia.bgImg) || (defaultShow && defaultShow.bgImg) || '';
    const bannerStyle = bgImg
      ? `background: linear-gradient(90deg, rgba(6,8,16,0.92) 0%, rgba(6,8,16,0.55) 55%, rgba(6,8,16,0.25) 100%), url('${bgImg}') center 22% / cover no-repeat`
      : `background:${app.bg}`;

    const listItems = appShows.length
      ? appShows.map((s) => ({ title: s.title, meta: s.sub, bgImg: s.bgImg, streamUrl: s.streamUrl }))
      : [{ title: `${app.name} Destaques`, meta: app.meta || '4K HDR', bgImg: '', streamUrl: VOD_STREAMS.scifi }];

    const cardsHtml = listItems
      .map(
        (it) => `
        <div class="stage-mini-card" data-play-title="${it.title}" data-play-bg="${it.bgImg || ''}" data-play-sub="${it.meta}" data-play-stream="${it.streamUrl || ''}">
          <strong>▶ ${it.title}</strong>
          <span>${it.meta}</span>
        </div>
      `
      )
      .join('');

    appStageBody.innerHTML = `
      <div class="stage-hero-banner" style="${bannerStyle}">
        <span class="hero-badge prism-tag" style="width:fit-content">${customMedia && customMedia.isPlaying ? '▶ REPRODUZINDO' : app.name}</span>
        <h2>${headline}</h2>
        <p>${sub}</p>
        ${app.webUrl ? `<div style="margin-top:10px;"><button id="stage-open-official" class="btn-prism" type="button" style="height:38px;padding:0 18px;">Abrir ${app.name} Oficial ↗</button></div>` : ''}
      </div>
      <div class="stage-cards-grid">${cardsHtml}</div>
    `;

    appStageBody.querySelector('#stage-open-official')?.addEventListener('click', () => {
      playUiSound('select');
      openExternalAppUrl(app.webUrl);
    });

    appStageBody.querySelectorAll('.stage-mini-card').forEach((card) => {
      card.addEventListener('click', () => {
        closeAppStage();
        openCinemaPlayer({
          title: card.dataset.playTitle,
          sub: card.dataset.playSub,
          appName: app.name,
          bgImg: card.dataset.playBg,
          streamUrl: card.dataset.playStream
        });
      });
    });
  }

  function renderMusicStage(app) {
    const bars = Array.from({ length: 6 }, () => '<div class="eq-bar"></div>').join('');
    appStageBody.innerHTML = `
      <div class="music-visualizer-box">
        <div>
          <span class="hero-badge prism-tag">Música</span>
          <h2 id="music-now-title" style="font-family:Outfit,sans-serif;font-size:1.8rem;margin:10px 0 6px;">${escHtml(app.name)}</h2>
          <p style="color:var(--text-secondary)">${escHtml(app.tagline || 'Abra o serviço oficial ou reproduza suas músicas locais no player Mídia.')}</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
            ${app.webUrl ? `<button id="music-open-official" class="btn-prism" type="button" style="height:40px;padding:0 18px;">Abrir ${escHtml(app.name)} ↗</button>` : ''}
            <button id="music-open-player" class="btn-glass" type="button" style="height:40px;padding:0 18px;">Abrir Player de Mídia</button>
          </div>
        </div>
        <div class="eq-bars" aria-hidden="true">${bars}</div>
      </div>
    `;

    appStageBody.querySelector('#music-open-official')?.addEventListener('click', () => {
      playUiSound('select');
      if (isNativeWebView) {
        closeAppStage();
        postWebViewAction('openAppUrl', { url: app.webUrl, name: app.name });
      } else {
        openExternalAppUrl(app.webUrl);
      }
    });

    appStageBody.querySelector('#music-open-player')?.addEventListener('click', () => {
      playUiSound('open');
      const mediaApp = APPS.find((a) => a.id === 'mediaplayer') || window.IrisStore?.getFullCatalog().find((a) => a.id === 'mediaplayer');
      if (mediaApp) launchApp(mediaApp);
    });
  }

  function renderSmartHomeStage() {
    const items = [
      { key: 'livingRoomLight', title: 'Iluminação da Sala', desc: 'Alterna aparência clara e escura no sistema e no fundo' },
      { key: 'ambilightSync', title: 'Cores Dinâmicas de Fundo', desc: 'Sincroniza o fundo da tela com o item selecionado' },
      { key: 'cinemaSoundbar', title: 'Saída de Áudio Principal', desc: 'Ativa ou silencia o som geral do aparelho' },
      { key: 'ecoMode', title: 'Modo Econômico', desc: 'Reduz o brilho e pausa efeitos visuais do fundo' }
    ];

    appStageBody.innerHTML = `
      <div class="stage-hero-banner" style="background:linear-gradient(135deg, #0e2c38, #08131a)">
        <span class="hero-badge prism-tag" style="width:fit-content">Casa Conectada</span>
        <h2>Sala de Estar</h2>
        <p>${Object.values(state.smartHome).filter(Boolean).length} dispositivos ativos • Integrado ao macOS</p>
      </div>
      <div class="settings-list">
        ${items.map((it) => `
          <div class="setting-tile">
            <div><h4>${it.title}</h4><p>${it.desc}</p></div>
            <button class="toggle-switch ${state.smartHome[it.key] ? 'on' : ''}" data-sh-key="${it.key}" aria-label="${it.title}"></button>
          </div>
        `).join('')}
      </div>
    `;

    appStageBody.querySelectorAll('.toggle-switch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const k = sw.dataset.shKey;
        state.smartHome[k] = !state.smartHome[k];
        sw.classList.toggle('on', state.smartHome[k]);
        if (k === 'livingRoomLight') {
          fetch('/api/os/appearance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ darkMode: !state.smartHome[k] })
          }).catch(() => { });
        } else if (k === 'cinemaSoundbar') {
          fetch('/api/os/volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ muted: !state.smartHome[k] })
          }).catch(() => { });
        }
        applyAllSettings();
        playUiSound(state.smartHome[k] ? 'select' : 'back');
      });
    });
  }

  /* =========================================================
     Expansive Real-Time Smart TV Settings Workspace
     ========================================================= */
  function settingRowMarkup({ id, title, desc, controlHtml }) {
    return `
      <div class="setting-row" ${id ? `data-row-id="${id}"` : ''}>
        <div class="setting-info">
          <h4>${title}</h4>
          <p>${desc}</p>
        </div>
        <div class="setting-control">${controlHtml}</div>
      </div>
    `;
  }

  function settingToggleMarkup(key, checked, scope = 'settings') {
    return `<button class="toggle-switch lg ${checked ? 'on' : ''}" data-stg-toggle="${key}" data-scope="${scope}" type="button" aria-pressed="${checked}"></button>`;
  }

  function settingRangeMarkup(key, min, max, step, val, unit = '%') {
    return `
      <div class="tv-range-wrap">
        <input class="tv-range" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-stg-range="${key}" data-unit="${unit}" />
        <span class="tv-range-val" id="val-${key}">${val}${unit}</span>
      </div>
    `;
  }

  function settingSegMarkup(key, options, currentVal) {
    return `
      <div class="seg-control">
        ${options.map((opt) => `
          <button class="seg-btn ${String(currentVal) === String(opt.val) ? 'active' : ''}" type="button" data-stg-seg="${key}" data-val="${opt.val}">${opt.label}</button>
        `).join('')}
      </div>
    `;
  }

  function renderSettingsWorkspace(animateEnter = false, restoreSelector = null) {
    const tvContentEl = document.getElementById('tv-content');
    const prevScroll = tvContentEl ? tvContentEl.scrollTop : 0;
    rowsContainer.innerHTML = '';
    const s = state.settings;
    const sh = state.smartHome;
    const info = state.systemInfo || {
      osName: 'Sistema TV',
      version: '2.0',
      nodeVersion: '',
      memory: { totalGb: '--', freeGb: '--' },
      bluetooth: { enabled: null, connectedDevices: [] },
      irReceiver: { available: false, name: 'Verificando receptor...' },
      network: { ssid: 'Rede Local', signal: 100 }
    };

    const categories = [
      {
        id: 'display',
        title: 'Tela e Cores',
        sub: `${THEMES[state.theme].label} • Brilho ${s.brightness}%`,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>'
      },
      {
        id: 'style',
        title: 'Personalização',
        sub: `Wallpapers 4K • ${(ACCENT_COLORS[s.accentColor] || ACCENT_COLORS.cyan).label}`,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.5c2.5 0 4.5-2 4.5-4.5C22 6 17.5 2 12 2z"/></svg>'
      },
      {
        id: 'audio',
        title: 'Som e Volume',
        sub: s.soundEnabled ? `Menus ${s.soundVolume}%` : 'Sons de menu desligados',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
      },
      {
        id: 'playback',
        title: 'Vídeo e Descanso',
        sub: `${QUALITY_META[s.streamQuality]?.label || 'Automática'} • Avanço ${s.seekStep}s`,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8"/></svg>'
      },
      {
        id: 'controls',
        title: 'Controles e Hora',
        sub: `${s.clock24h ? '24h' : '12h'} • Teclado e Remoto`,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h2M10 10h2M14 10h2M18 10h0M8 14h8"/></svg>'
      },
      {
        id: 'system',
        title: 'Sistema e Rede',
        sub: `${state.currentProfile.name} • ${info.network?.ssid || 'Local'}`,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1Z"/></svg>'
      },
      {
        id: 'developer',
        title: 'Desenvolvedor',
        sub: 'Testes • Onboarding • Depuração',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
      }
    ];

    const sec = state.activeSettingsSection || 'display';
    let panelHtml = '';

    if (sec === 'display') {
      panelHtml = `
        <div class="settings-group">
          <div class="settings-group-title">Fundo e Imagem</div>
          ${settingRowMarkup({
        title: 'Tema de Fundo',
        desc: 'Define as cores gerais da tela inicial e janelas',
        controlHtml: settingSegMarkup('theme', [
          { val: 'prism', label: 'Padrão' },
          { val: 'light', label: 'Claro' },
          { val: 'oled', label: 'Preto Puro' },
          { val: 'aurora', label: 'Verde Escuro' }
        ], state.theme)
      })}
          ${settingRowMarkup({
        title: 'Modo de Imagem',
        desc: 'Ajusta contraste, intensidade de cor e filtro para leitura noturna',
        controlHtml: settingSegMarkup('pictureMode', [
          { val: 'standard', label: 'Padrão' },
          { val: 'cinema', label: 'Filme' },
          { val: 'vivid', label: 'Cores Fortes' },
          { val: 'night', label: 'Noturno' }
        ], s.pictureMode)
      })}
          ${settingRowMarkup({
        title: 'Brilho da Tela',
        desc: 'Use as setas esquerda e direita quando selecionado',
        controlHtml: settingRangeMarkup('brightness', 55, 120, 5, s.brightness, '%')
      })}
          ${settingRowMarkup({
        title: 'Contraste',
        desc: 'Ajusta a diferença entre áreas claras e escuras da imagem',
        controlHtml: settingRangeMarkup('contrast', 80, 120, 5, s.contrast ?? 100, '%')
      })}
          ${settingRowMarkup({
        title: 'Saturação de Cores',
        desc: 'Controla a intensidade das cores exibidas na interface',
        controlHtml: settingRangeMarkup('saturation', 70, 130, 5, s.saturation ?? 100, '%')
      })}
          ${settingRowMarkup({
        title: 'Temperatura de Cor',
        desc: 'Deixa a imagem mais fria, neutra ou quente para conforto visual',
        controlHtml: settingSegMarkup('colorTemp', [
          { val: 'cool', label: 'Frio' },
          { val: 'neutral', label: 'Neutro' },
          { val: 'warm', label: 'Quente' }
        ], s.colorTemp || 'neutral')
      })}
          ${settingRowMarkup({
        title: 'Modo Noturno Automático',
        desc: 'Ativa filtro quente e reduz levemente o brilho das 22h às 06h',
        controlHtml: settingToggleMarkup('autoNightMode', !!s.autoNightMode)
      })}
          ${settingRowMarkup({
        title: 'Tema Automático com o Sistema',
        desc: 'Alterna entre Claro e Escuro seguindo a aparência do sistema operacional',
        controlHtml: settingToggleMarkup('autoSystemTheme', !!s.autoSystemTheme)
      })}
          ${settingRowMarkup({
        title: 'Modo Econômico',
        desc: 'Reduz o brilho e o consumo visual em tela parada',
        controlHtml: settingToggleMarkup('ecoMode', sh.ecoMode, 'smartHome')
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Tela Cheia, Proporção e Legibilidade</div>
          ${settingRowMarkup({
        title: 'Margem de Segurança da TV',
        desc: 'Adiciona recuo nas bordas para evitar cortes em televisores (Overscan)',
        controlHtml: settingRangeMarkup('tvSafeMargin', 0, 5, 1, s.tvSafeMargin ?? 0, '%')
      })}
          ${settingRowMarkup({
        title: 'Nitidez de Texto',
        desc: 'Reforça a definição e legibilidade dos textos à distância',
        controlHtml: settingToggleMarkup('textSharpness', !!s.textSharpness)
      })}
          ${settingRowMarkup({
        title: 'Restaurar Padrões de Imagem',
        desc: 'Volta tema, brilho, contraste, saturação e ajustes de tela ao padrão',
        controlHtml: `<button class="stg-btn" type="button" id="stg-reset-display-btn">Restaurar Padrões</button>`
      })}
          ${settingRowMarkup({
        title: 'Tela Cheia e Manter Tela Ligada',
        desc: 'Expande a janela ou impede que a tela desligue por inatividade',
        controlHtml: `
              <button class="stg-btn primary" type="button" id="stg-fs-btn">Tela Cheia</button>
              <button class="toggle-switch lg ${state.keepAwake ? 'on' : ''}" type="button" id="stg-wake-btn" aria-label="Manter tela ligada"></button>
            `
      })}
          ${info.darkMode !== null ? settingRowMarkup({
        title: `Aparência do Sistema (${info.darkMode ? 'Escuro' : 'Claro'})`,
        desc: 'Alterna entre modo claro e escuro no sistema operacional',
        controlHtml: `<button class="stg-btn" type="button" id="stg-os-dark-btn">${info.darkMode ? 'Mudar para Claro' : 'Mudar para Escuro'}</button>`
      }) : ''}
        </div>
      `;
    } else if (sec === 'style') {
      panelHtml = `
        <div class="settings-group">
          <div class="settings-group-title">Papel de Parede</div>
          <div class="stg-wallpapers-grid">
            ${activeWallpapersList.map((wp) => {
        const isCurrent = (s.activeWallpaperId || activeWallpapersList[0].id) === wp.id;
        return `
                <div class="stg-wallpaper-card ${isCurrent ? 'is-active' : ''}" data-select-wp="${wp.id}" tabindex="0" role="button" aria-pressed="${isCurrent}">
                  <div class="stg-wp-preview">
                    <img class="stg-wp-preview-img" src="/media/wallpapers/thumbs/${wp.file}" alt="${escHtml(wp.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${wp.path}'" />
                    ${isCurrent ? '<span class="stg-wp-status"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Ativo</span>' : ''}
                  </div>
                  <div class="stg-wp-meta">
                    <div class="stg-wp-title">${wp.title}</div>
                    <div class="stg-wp-location">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      ${wp.location}
                    </div>
                    <button class="stg-wp-btn" type="button">
                      ${isCurrent ? '✓ Em Uso' : 'Aplicar'}
                    </button>
                  </div>
                </div>
              `;
      }).join('')}
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Cores, Fonte e Tamanho</div>
          ${settingRowMarkup({
        title: 'Cor de Destaque',
        desc: 'Altera botões ativos, barras de progresso e bordas de seleção',
        controlHtml: `
              <div class="stg-accent-swatches">
                ${Object.entries(ACCENT_COLORS).map(([k, cfg]) => `
                  <button class="stg-accent-dot ${s.accentColor === k ? 'active' : ''}" type="button" data-accent-pick="${k}" style="background:${cfg.hex}" title="${cfg.label}" aria-label="Cor ${cfg.label}"></button>
                `).join('')}
              </div>
            `
      })}
          ${settingRowMarkup({
        title: 'Estilo da Fonte',
        desc: 'Altera a tipografia usada em títulos, botões e listas',
        controlHtml: settingSegMarkup('fontStyle', [
          { val: 'modern', label: 'Moderna' },
          { val: 'system', label: 'Sistema' },
          { val: 'classic', label: 'Arredondada' }
        ], s.fontStyle)
      })}
          ${settingRowMarkup({
        title: 'Tamanho dos Textos e Cartões',
        desc: 'Amplia ou reduz a escala de toda a interface',
        controlHtml: settingSegMarkup('uiScale', [
          { val: 0.9, label: 'Pequeno' },
          { val: 1, label: 'Normal' },
          { val: 1.1, label: 'Grande' }
        ], s.uiScale)
      })}
          ${settingRowMarkup({
        title: 'Formato dos Cartões',
        desc: 'Define o arredondamento de ícones, canais e capas',
        controlHtml: settingSegMarkup('cardRadius', [
          { val: 4, label: 'Quadrado' },
          { val: 18, label: 'Suave' },
          { val: 32, label: 'Arredondado' }
        ], s.cardRadius)
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Fundo, Transparência e Movimento</div>
          ${settingRowMarkup({
        title: 'Intensidade das Luzes de Fundo',
        desc: 'Força das cores de fundo atrás das capas e aplicativos',
        controlHtml: settingRangeMarkup('ambientIntensity', 0, 100, 5, s.ambientIntensity, '%')
      })}
          ${settingRowMarkup({
        title: 'Transparência dos Painéis',
        desc: 'Ativa ou desativa a transparência em menus, janelas e botões',
        controlHtml: settingToggleMarkup('glassTransparency', s.glassTransparency !== false)
      })}
          ${settingRowMarkup({
        title: 'Nível de Transparência',
        desc: 'Controla o quanto o fundo aparece através dos painéis (0% = sólido)',
        controlHtml: settingRangeMarkup('glassTransparencyLevel', 0, 90, 5, s.glassTransparencyLevel ?? 45, '%')
      })}
          ${settingRowMarkup({
        title: 'Brilho da Transparência',
        desc: 'Ajusta a claridade global da transparência em toda a interface',
        controlHtml: settingRangeMarkup('glassBrightness', 50, 180, 5, s.glassBrightness ?? 100, '%')
      })}
          ${settingRowMarkup({
        title: 'Linhas Decorativas no Fundo',
        desc: 'Exibe ou oculta as linhas suaves animadas atrás da tela inicial',
        controlHtml: settingToggleMarkup('silkWaves', s.silkWaves)
      })}
          ${settingRowMarkup({
        title: 'Fundo Reativo à Seleção',
        desc: 'Muda a cor de fundo conforme o filme, canal ou aplicativo focado',
        controlHtml: settingToggleMarkup('ambilightSync', sh.ambilightSync, 'smartHome')
      })}
          ${settingRowMarkup({
        title: 'Borda de Foco Reforçada',
        desc: 'Destaca ainda mais o item selecionado ao navegar pelo teclado ou controle',
        controlHtml: settingToggleMarkup('highContrastFocus', s.highContrastFocus)
      })}
          ${settingRowMarkup({
        title: 'Reduzir Animações',
        desc: 'Desativa transições e inclinação de cartões para navegação mais direta',
        controlHtml: settingToggleMarkup('reduceMotion', s.reduceMotion)
      })}
          ${settingRowMarkup({
        title: 'Escurecimento do Papel de Parede',
        desc: 'Controla o contraste do fundo para facilitar a leitura dos ícones',
        controlHtml: settingSegMarkup('wallpaperDim', [
          { val: 'light', label: 'Leve' },
          { val: 'medium', label: 'Médio' },
          { val: 'strong', label: 'Forte' }
        ], s.wallpaperDim || 'medium')
      })}
          ${settingRowMarkup({
        title: 'Banners de Shows no Fundo',
        desc: 'Usa a arte do filme ou série em destaque no lugar do papel de parede',
        controlHtml: settingToggleMarkup('showBannersAsWallpaper', !!s.showBannersAsWallpaper)
      })}
          ${settingRowMarkup({
        title: 'Troca Automática de Papel de Parede',
        desc: s.showBannersAsWallpaper ? 'Bloqueado enquanto Banners de Shows estiver ativo' : 'Alterna o papel de parede da tela inicial automaticamente',
        controlHtml: `<div style="${s.showBannersAsWallpaper ? 'opacity:0.4;pointer-events:none;' : ''}">${settingToggleMarkup('wallpaperAutoRotate', s.wallpaperAutoRotate)}</div>`
      })}
          ${settingRowMarkup({
        title: 'Relógio na Lock Screen',
        desc: s.showBannersAsWallpaper ? 'Bloqueado enquanto Banners de Shows estiver ativo (relógio fixo no canto superior direito)' : 'Define a posição e tamanho do relógio no descanso de tela',
        controlHtml: `<div style="${s.showBannersAsWallpaper ? 'opacity:0.4;pointer-events:none;' : ''}">${settingSegMarkup('lockClockStyle', [
          { val: 'corner', label: 'Canto Inferior' },
          { val: 'centered', label: 'Centralizado' }
        ], s.lockClockStyle || 'corner')}</div>`
      })}
          ${settingRowMarkup({
        title: 'Esconder Rótulos dos Apps',
        desc: 'Mostra o nome dos aplicativos apenas quando estiverem selecionados',
        controlHtml: settingToggleMarkup('hideAppLabels', s.hideAppLabels)
      })}
          ${settingRowMarkup({
        title: 'Estilo do Foco',
        desc: 'Visual da borda ao navegar pelos cartões e menus',
        controlHtml: settingSegMarkup('focusStyle', [
          { val: 'neutral', label: 'Neutro' },
          { val: 'accent', label: 'Cor de Destaque' },
          { val: 'glow', label: 'Brilho' }
        ], s.focusStyle || 'neutral')
      })}
          ${settingRowMarkup({
        title: 'Tamanho da Grade',
        desc: 'Ajusta o tamanho e espaçamento dos cartões na tela',
        controlHtml: settingSegMarkup('gridDensity', [
          { val: 'compact', label: 'Compacta' },
          { val: 'comfortable', label: 'Padrão' },
          { val: 'spacious', label: 'Espaçosa' }
        ], s.gridDensity || 'comfortable')
      })}
          ${settingRowMarkup({
        title: 'Barra Superior Automática',
        desc: 'Oculta a barra do topo ao rolar para baixo na tela inicial',
        controlHtml: settingToggleMarkup('autoHideTopbar', s.autoHideTopbar)
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Widgets da Tela Inicial</div>
          ${settingRowMarkup({
        title: 'Widgets na Tela Inicial',
        desc: 'Exibe a área de widgets interativos na tela inicial',
        controlHtml: settingToggleMarkup('showHomeWidgets', s.showHomeWidgets !== false)
      })}
          ${settingRowMarkup({
        title: 'Widget de Clima',
        desc: 'Mostra previsão atual, sensação térmica, umidade e vento na tela inicial',
        controlHtml: settingToggleMarkup('widgetWeather', s.widgetWeather !== false)
      })}
          ${settingRowMarkup({
        title: 'Widget de Calendário',
        desc: 'Mostra a data de hoje e o calendário mensal na tela inicial',
        controlHtml: settingToggleMarkup('widgetCalendar', s.widgetCalendar !== false)
      })}
          ${settingRowMarkup({
        title: 'Widget de Relógio Analógico',
        desc: 'Mostra um relógio analógico animado com ponteiros em tempo real',
        controlHtml: settingToggleMarkup('widgetClock', s.widgetClock !== false)
      })}
          ${settingRowMarkup({
        title: 'Efeito Liquid Glass nos Widgets',
        desc: 'Ativa vidro translúcido com reflexo especular nos widgets (desative para estilo sólido)',
        controlHtml: settingToggleMarkup('widgetWeatherLiquidGlass', s.widgetWeatherLiquidGlass !== false)
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Tela Inicial (Seções Visíveis e Ordem)</div>
          ${settingRowMarkup({
        title: 'Ocultar Banner de Destaque',
        desc: 'Esconde o destaque no topo para ir direto aos cartões',
        controlHtml: settingToggleMarkup('hideHeroBanner', s.hideHeroBanner)
      })}
          ${(() => {
        const HOME_SEC_META = {
          widgets: { key: 'showHomeWidgets', title: 'Widgets', desc: 'Cartões interativos na tela inicial (Clima e mais)' },
          apps: { key: 'showHomeApps', title: 'Apps', desc: 'Fileira de aplicativos instalados na tela inicial' },
          live: { key: 'showHomeLive', title: 'TV ao Vivo', desc: 'Canais ao vivo na tela inicial' },
          continue: { key: 'showHomeContinue', title: 'Continuar Assistindo', desc: 'Filmes e séries em andamento' },
          trending: { key: 'showHomeTrending', title: 'Em Alta Agora', desc: 'Destaques de séries e filmes' },
          settings: { key: 'showHomeSettings', title: 'Ajustes do Sistema', desc: 'Atalhos de configuração no final da tela inicial' }
        };
        const defOrder = ['widgets', 'settings', 'apps', 'live', 'continue', 'trending'];
        const curOrder = Array.isArray(s.homeSectionOrder) && s.homeSectionOrder.length
          ? [...new Set([...s.homeSectionOrder, ...defOrder])]
          : defOrder;
        return curOrder.map((secId, idx) => {
          const meta = HOME_SEC_META[secId];
          if (!meta) return '';
          return settingRowMarkup({
            title: meta.title,
            desc: meta.desc,
            controlHtml: `
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <button class="stg-btn" type="button" data-home-move="${secId}:-1" ${idx === 0 ? 'disabled style="opacity:0.35;cursor:default;"' : ''} title="Subir">↑</button>
                <button class="stg-btn" type="button" data-home-move="${secId}:1" ${idx === curOrder.length - 1 ? 'disabled style="opacity:0.35;cursor:default;"' : ''} title="Descer">↓</button>
                ${settingToggleMarkup(meta.key, s[meta.key] !== false)}
              </div>
            `
          });
        }).join('');
      })()}
        </div>
      `;
    } else if (sec === 'audio') {
      const osAudio = info.audio || {};
      const osVol = typeof osAudio.outputVolume === 'number' ? osAudio.outputVolume : 50;
      panelHtml = `
        ${osAudio.supported ? `
        <div class="settings-group">
          <div class="settings-group-title">Volume do Aparelho</div>
          ${settingRowMarkup({
        title: 'Volume Principal',
        desc: 'Altera o volume geral de saída de áudio (atalhos - e +)',
        controlHtml: `
              <div class="tv-range-wrap">
                <input class="tv-range" id="stg-os-vol" type="range" min="0" max="100" step="2" value="${osVol}" />
                <span class="tv-range-val" id="val-os-vol">${osVol}%</span>
              </div>
            `
      })}
          ${settingRowMarkup({
        title: 'Silenciar Áudio (Mudo)',
        desc: 'Ativa ou desativa o mudo geral do aparelho (atalho M)',
        controlHtml: `<button class="toggle-switch lg ${osMuted ? 'on' : ''}" id="stg-os-mute" type="button" aria-pressed="${osMuted}"></button>`
      })}
        </div>` : ''}
        <div class="settings-group">
          <div class="settings-group-title">Sons de Navegação e Reprodução</div>
          ${settingRowMarkup({
        title: 'Sons ao Mover e Confirmar',
        desc: 'Ativa ou silencia os efeitos sonoros dos menus',
        controlHtml: settingToggleMarkup('soundEnabled', s.soundEnabled)
      })}
          ${settingRowMarkup({
        title: 'Volume dos Sons de Menu',
        desc: 'Altura relativa dos efeitos sonoros de navegação',
        controlHtml: settingRangeMarkup('soundVolume', 0, 100, 5, s.soundVolume, '%')
      })}
          ${settingRowMarkup({
        title: 'Redução de Volume Noturno',
        desc: 'Limita o pico dos efeitos para uso em ambiente silencioso',
        controlHtml: settingToggleMarkup('nightSound', s.nightSound)
      })}
          ${settingRowMarkup({
        title: 'Idioma de Áudio Padrão',
        desc: 'Faixa preferida ao iniciar vídeos no reprodutor',
        controlHtml: settingSegMarkup('defaultAudioTrack', [
          { val: 0, label: 'Português' },
          { val: 1, label: 'Original' },
          { val: 2, label: 'Estéreo' }
        ], s.defaultAudioTrack)
      })}
          <div class="setting-row" style="border-bottom:none;padding-bottom:10px;">
            <div class="setting-info">
              <h4>Testar Sons</h4>
              <p>Selecione qualquer botão abaixo para ouvir o som atual</p>
            </div>
          </div>
          <div class="stg-sound-test-row">
            <button class="stg-btn" type="button" data-test-sfx="move">Mover</button>
            <button class="stg-btn" type="button" data-test-sfx="select">Confirmar</button>
            <button class="stg-btn" type="button" data-test-sfx="back">Voltar</button>
            <button class="stg-btn" type="button" data-test-sfx="open">Abrir</button>
            <button class="stg-btn primary" type="button" data-test-sfx="chime">Alerta</button>
          </div>
        </div>
      `;
    } else if (sec === 'playback') {
      panelHtml = `
        <div class="settings-group">
          <div class="settings-group-title">Reprodução de Vídeo</div>
          ${settingRowMarkup({
        title: 'Qualidade Padrão',
        desc: 'Define a preferência inicial ao reproduzir canais e vídeos',
        controlHtml: settingSegMarkup('streamQuality', [
          { val: 'auto', label: 'Automática' },
          { val: '4k', label: 'Alta' },
          { val: '1080p', label: 'HD' },
          { val: '720p', label: 'Econômica' }
        ], s.streamQuality)
      })}
          ${settingRowMarkup({
        title: 'Tempo de Avanço e Retrocesso',
        desc: 'Quantidade de segundos ao avançar ou voltar um vídeo',
        controlHtml: settingSegMarkup('seekStep', [
          { val: 5, label: '5s' },
          { val: 10, label: '10s' },
          { val: 15, label: '15s' },
          { val: 30, label: '30s' }
        ], s.seekStep)
      })}
          ${settingRowMarkup({
        title: 'Movimento Lento nas Capas',
        desc: 'Aplica aproximação lenta nas imagens de destaque em segundo plano',
        controlHtml: settingToggleMarkup('kenBurns', s.kenBurns)
      })}
          ${settingRowMarkup({
        title: 'Restrição Infantil',
        desc: 'Exibe apenas títulos classificados para a família na tela inicial',
        controlHtml: settingToggleMarkup('kidsMode', s.kidsMode)
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Protetor de Tela</div>
          ${settingRowMarkup({
        title: 'Ativar por Inatividade',
        desc: 'Abre o relógio em tela cheia após o tempo escolhido sem comandos',
        controlHtml: settingSegMarkup('screensaverMinutes', [
          { val: 0, label: 'Desativado' },
          { val: 1, label: '1 min' },
          { val: 3, label: '3 min' },
          { val: 5, label: '5 min' }
        ], s.screensaverMinutes)
      })}
          ${settingRowMarkup({
        title: 'Ativar Agora',
        desc: 'Exibe imediatamente o protetor de tela',
        controlHtml: `<button class="stg-btn primary" type="button" id="stg-btn-ss">Abrir Protetor (S)</button>`
      })}
        </div>
      `;
    } else if (sec === 'controls') {
      const btConnected = (info.bluetooth?.connectedDevices || []);
      const gamepads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
      const btSummary = btConnected.length
        ? btConnected.join(', ')
        : (gamepads.length ? gamepads.map((g) => g.id.split('(')[0].trim()).join(', ') : (info.bluetooth?.enabled ? 'Ligado (nenhum dispositivo ativo)' : 'Não detectado'));
      const irSummary = info.irReceiver?.available ? info.irReceiver.name : 'Sem receptor infravermelho conectado';

      panelHtml = `
        <div class="stg-hw-grid">
          <div class="stg-hw-card"><small>Teclado e Setas</small><strong>Ativo em todas as telas</strong></div>
          <div class="stg-hw-card"><small>Bluetooth / Controle Sem Fio</small><strong>${escHtml(btSummary)}</strong></div>
          <div class="stg-hw-card"><small>Receptor Infravermelho (IR)</small><strong>${escHtml(irSummary)}</strong></div>
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Ferramentas de Entrada e Volume</div>
          ${settingRowMarkup({
        title: 'Teclado na Tela',
        desc: 'Abre em qualquer campo pelo botão Teclado ou atalho Ctrl+K / Shift+K',
        controlHtml: `<button class="stg-btn primary" type="button" id="stg-btn-osk">Testar Teclado (Ctrl+K)</button>`
      })}
          ${settingRowMarkup({
        title: 'Controle Virtual na Tela',
        desc: 'Exibe controle flutuante com setas, volume e atalhos (Ctrl+R / Shift+R)',
        controlHtml: `<button class="stg-btn" type="button" id="stg-btn-remote">Abrir Controle (Ctrl+R)</button>`
      })}
          ${settingRowMarkup({
        title: 'Atalhos Principais',
        desc: 'Setas: mover foco • Enter: confirmar • ESC: voltar • Ctrl+K: teclado • Ctrl+R: controle • Ctrl+M: mudo',
        controlHtml: `<button class="stg-btn" type="button" id="stg-net-test">Verificar Dispositivos</button>`
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Formato de Data e Hora</div>
          ${settingRowMarkup({
        title: 'Formato do Relógio',
        desc: 'Alterna entre exibição em 24 horas ou 12 horas',
        controlHtml: settingSegMarkup('clock24h', [
          { val: true, label: '24 horas' },
          { val: false, label: '12 horas' }
        ], s.clock24h)
      })}
          ${settingRowMarkup({
        title: 'Mostrar Segundos',
        desc: 'Exibe os segundos no relógio da barra superior',
        controlHtml: settingToggleMarkup('showSeconds', s.showSeconds)
      })}
          ${settingRowMarkup({
        title: 'Mostrar Data',
        desc: 'Exibe o dia e o mês ao lado do horário',
        controlHtml: settingToggleMarkup('showDate', s.showDate)
      })}
        </div>
      `;
    } else if (sec === 'system') {
      const quickApps = APPS.slice(0, 12);
      const pingText = state.lastPingMs !== null ? `${state.lastPingMs} ms` : 'Não testado';
      const onlineStatus = navigator.onLine ? 'Conectado' : 'Sem rede';
      const gpuInfo = (typeof IrisGpuManager !== 'undefined') ? IrisGpuManager.getGpuInfo() : {};
      const detectedGpus = (info.gpus && info.gpus.length) ? info.gpus : (gpuInfo.systemGpus || []);
      const currentGpuPref = s.gpuPreference || 'dedicated';

      let activeGpuLabel = gpuInfo.name || 'Detectando GPU...';
      let activeGpuSub = 'Aceleração por Hardware Metal / WebGL2 Ativa';
      let isDedicatedActive = gpuInfo.isDedicated;

      // Sort GPUs by capability (dedicated, high-performance, VRAM) dynamically
      const sortedGpus = [...detectedGpus].sort((a, b) => {
        const aScore = (a.isDedicated ? 10 : 0) + (a.isHighPerformance ? 5 : 0) + (a.vram ? 2 : 0);
        const bScore = (b.isDedicated ? 10 : 0) + (b.isHighPerformance ? 5 : 0) + (b.vram ? 2 : 0);
        return bScore - aScore;
      });
      const dedicatedCard = sortedGpus.find((g) => g.isDedicated || g.isHighPerformance) || sortedGpus[0];
      const integratedCard = sortedGpus.find((g) => !g.isDedicated && !g.isHighPerformance) || sortedGpus[sortedGpus.length - 1];

      if (currentGpuPref === 'dedicated') {
        if (dedicatedCard) {
          activeGpuLabel = `${dedicatedCard.name}${dedicatedCard.vram ? ` (${dedicatedCard.vram})` : ''}`;
          const metalStr = dedicatedCard.metal ? `${dedicatedCard.metal} • ` : '';
          const busStr = dedicatedCard.bus ? `${dedicatedCard.bus} • ` : (dedicatedCard.isDedicated ? 'Dedicada • ' : '');
          activeGpuSub = `GPU Mais Potente • ${metalStr}${busStr}Ativa a 60 FPS`;
          isDedicatedActive = true;
        } else {
          activeGpuLabel = gpuInfo.name || 'GPU de Alto Desempenho';
          activeGpuSub = 'Aceleração por hardware ativa a 60 FPS';
          isDedicatedActive = true;
        }
      } else if (currentGpuPref === 'integrated') {
        if (integratedCard && (integratedCard !== dedicatedCard || sortedGpus.length > 1)) {
          activeGpuLabel = `${integratedCard.name}${integratedCard.vram ? ` (${integratedCard.vram})` : ''}`;
          activeGpuSub = 'GPU Integrada • Modo de Economia de Energia';
          isDedicatedActive = false;
        } else {
          activeGpuLabel = gpuInfo.name || 'GPU do Sistema';
          activeGpuSub = 'Modo de economia de energia ativo';
          isDedicatedActive = false;
        }
      } else {
        const primaryGpu = dedicatedCard || integratedCard;
        activeGpuLabel = primaryGpu ? `${primaryGpu.name} (Automático)` : (gpuInfo.name || 'Automático');
        activeGpuSub = 'Gerenciamento automático de GPU pelo sistema operacional';
      }

      panelHtml = `
        <div class="settings-group">
          <div class="settings-group-title">Perfil e Tela Inicial</div>
          ${settingRowMarkup({
        title: 'Nome do Perfil',
        desc: 'Pressione Enter no campo para abrir o teclado ou digite diretamente',
        controlHtml: `
              <input id="stg-user-name" class="stg-text-input" type="text" maxlength="18" value="${escHtml(state.currentProfile.name)}" placeholder="Seu nome" />
              <button class="stg-btn primary" type="button" id="stg-save-name">Salvar</button>
            `
      })}
          <div class="setting-row" style="border-bottom:none;padding-bottom:6px;">
            <div class="setting-info">
              <h4>Apps Fixados no Início</h4>
              <p>Marque os aplicativos que aparecem primeiro na tela inicial</p>
            </div>
          </div>
          <div class="stg-pin-apps-grid">
            ${quickApps.map((a) => `
              <button class="ob-app-pick ${obState.pickedApps.has(a.id) ? 'selected' : ''}" data-pin-app="${a.id}" type="button">
                <img src="${a.iconSrc}" alt="${a.name}" />
                <span>${a.name}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Conexão, Energia e Padrões</div>
          ${settingRowMarkup({
        title: `${escHtml(info.network?.ssid || 'Rede Local')} • ${info.network?.ip || '127.0.0.1'}`,
        desc: `Interface ${info.network?.iface || 'en0'} • Dispositivo ${info.hostname || 'local'}`,
        controlHtml: `<button class="stg-btn primary" type="button" id="stg-net-test">Testar Conexão</button>`
      })}
          ${settingRowMarkup({
        title: 'Energia',
        desc: 'Desliga o sinal da tela ou encerra a janela principal',
        controlHtml: `
              <button class="stg-btn" type="button" id="stg-sleep-display-btn">Apagar Tela</button>
              ${isNativeWebView ? `<button class="stg-btn danger" type="button" id="stg-quit-webview-btn">Fechar Aplicativo</button>` : ''}
            `
      })}
          ${settingRowMarkup({
        title: 'Assistente Inicial e Padrões',
        desc: 'Reabre a configuração guiada de boas-vindas ou restaura todas as configurações padrão',
        controlHtml: `
              <button class="stg-btn primary" type="button" id="stg-onboarding">Refazer Onboarding</button>
              <button class="stg-btn danger" type="button" id="stg-reset-all">Restaurar Padrão</button>
            `
      })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Avançado • Desempenho e Aceleração Gráfica</div>
          ${settingRowMarkup({
            title: 'Desempenho Gráfico (GPU)',
            desc: 'Sempre usa a GPU mais potente e dedicada disponível para manter interface e mídias em 60 FPS fluidos',
            controlHtml: settingSegMarkup('gpuPreference', [
              { val: 'dedicated', label: 'Dedicada (Mais Potente)' },
              { val: 'integrated', label: 'Integrada (Economia)' },
              { val: 'auto', label: 'Automático' }
            ], currentGpuPref)
          })}
          ${settingRowMarkup({
            title: 'GPU Ativa no Momento',
            desc: `${escHtml(activeGpuSub)}`,
            controlHtml: `
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:${isDedicatedActive ? 'rgba(16,185,129,0.18)' : 'rgba(59,130,246,0.18)'};border:1px solid ${isDedicatedActive ? 'rgba(16,185,129,0.36)' : 'rgba(59,130,246,0.36)'};color:${isDedicatedActive ? '#34d399' : '#60a5fa'};font-weight:700;font-size:0.84rem;">
                  <span style="width:7px;height:7px;border-radius:50%;background:${isDedicatedActive ? '#10b981' : '#3b82f6'};box-shadow:0 0 8px ${isDedicatedActive ? '#10b981' : '#3b82f6'};"></span>
                  ${escHtml(activeGpuLabel)}
                </span>
                <button class="stg-btn" type="button" id="stg-gpu-refresh-btn" title="Atualizar detecção de hardware">Atualizar</button>
              </div>
            `
          })}
          ${detectedGpus.length ? `
            <div class="setting-row" style="border-bottom:none;padding-bottom:12px;">
              <div class="setting-info" style="width:100%;">
                <h4 style="margin-bottom:6px;">Placas de Vídeo Detectadas no Sistema</h4>
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
                  ${detectedGpus.map((g) => {
                    const isSelected = (currentGpuPref === 'dedicated' && g === dedicatedCard)
                      || (currentGpuPref === 'integrated' && g === integratedCard)
                      || (currentGpuPref === 'auto' && g === (dedicatedCard || integratedCard));
                    const typeLabel = g.isDedicated ? (g.bus ? `Dedicada (${g.bus})` : 'Dedicada') : (g.bus || 'Integrada');
                    return `
                      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,${isSelected ? '0.08' : '0.03'});border:1px solid rgba(255,255,255,${isSelected ? '0.2' : '0.07'});">
                        <div>
                          <strong style="font-size:0.88rem;color:${isSelected ? 'var(--iris-cyan, #00c2ff)' : 'var(--text-primary)'};">${escHtml(g.name)}</strong>
                          <span style="font-size:0.78rem;color:var(--text-secondary);margin-left:8px;">${typeLabel} ${g.vram ? `• ${g.vram}` : ''} ${g.metal ? `• ${g.metal}` : ''}</span>
                        </div>
                        <span style="font-size:0.78rem;font-weight:700;padding:3px 8px;border-radius:6px;background:${isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'};color:${isSelected ? '#34d399' : 'var(--text-muted)'};">${isSelected ? 'Em Uso' : 'Disponível'}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          ` : ''}
          ${settingRowMarkup({
            title: 'Aceleração por Hardware em 60 FPS',
            desc: 'Mantém rasterização de camadas e decodificação gráfica executando diretamente no chip de vídeo',
            controlHtml: settingToggleMarkup('hardwareAcceleration', s.hardwareAcceleration !== false)
          })}
        </div>
        <div class="settings-group">
          <div class="settings-group-title">Cofre de Senhas do irisTV</div>
          <div id="stg-vault-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
            <span style="font-size:0.84rem;color:var(--text-secondary);">Carregando senhas salvas...</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input id="stg-vault-host" class="tv-input" type="text" placeholder="Site (ex: netflix.com)" style="flex:1;min-width:160px;" />
            <input id="stg-vault-user" class="tv-input" type="text" placeholder="Usuário / E-mail" style="flex:1;min-width:160px;" />
            <input id="stg-vault-pass" class="tv-input" type="password" placeholder="Senha" style="flex:1;min-width:140px;" />
            <button id="stg-vault-save-btn" class="stg-btn primary" type="button">Salvar Senha</button>
          </div>
        </div>
      `;
    } else if (sec === 'developer') {
      panelHtml = `
        <div class="settings-group">
          <div class="settings-group-title">Experiência de Primeiro Início (Onboarding)</div>
          ${settingRowMarkup({
            title: 'Refazer Onboarding Completo',
            desc: 'Abre a experiência inicial com trilha sonora de 10 min, apresentação "Olá!", boas-vindas fluidas, assistente e preparação holográfica',
            controlHtml: `<button class="stg-btn primary" type="button" id="dev-btn-redo-onboarding">Refazer Onboarding Agora</button>`
          })}
          ${settingRowMarkup({
            title: 'Resetar Flag de Primeiro Acesso',
            desc: 'Limpa o registro de onboarding (iristv-onboarded) para que o sistema se comporte como instalado pela 1ª vez',
            controlHtml: `<button class="stg-btn" type="button" id="dev-btn-clear-flag">Limpar Flag (${isOnboarded ? '1' : '0'})</button>`
          })}
          ${settingRowMarkup({
            title: 'Testar Animação de Entrada (Assembly)',
            desc: 'Dispara a montagem de interface elaborada (3D Perspective, wallpaper zoom e efeito dominó)',
            controlHtml: `<button class="stg-btn" type="button" id="dev-btn-test-assembly">Testar Animação Final</button>`
          })}
        </div>

        <div class="settings-group">
          <div class="settings-group-title">Depuração & Console DevTools</div>
          ${settingRowMarkup({
            title: 'Comando Global DevTools',
            desc: 'Você pode invocar window.IrisDev.redoOnboarding() ou window.IrisDev.testAssembly() diretamente no console',
            controlHtml: `<button class="stg-btn" type="button" id="dev-btn-test-console">Executar IrisDev</button>`
          })}
          ${settingRowMarkup({
            title: 'Simular Primeiro Boot do Sistema',
            desc: 'Limpa a sessão de boot e recarrega a página para testar o carregamento completo do SO',
            controlHtml: `<button class="stg-btn danger" type="button" id="dev-btn-reboot">Simular Boot Limpo</button>`
          })}
        </div>
      `;
    }

    const wrap = document.createElement('div');
    wrap.className = animateEnter ? 'settings-workspace is-entering' : 'settings-workspace';
    wrap.innerHTML = `
      <aside class="settings-sidebar" aria-label="Categorias de Configurações">
        <div class="settings-sb-head">
          <h2>Configurações</h2>
          <p>${escHtml(state.currentProfile.name)}</p>
        </div>
        ${categories.map((c) => `
          <button class="settings-nav-btn ${sec === c.id ? 'active' : ''}" type="button" data-sec="${c.id}">
            <span class="settings-nav-icon">${c.icon}</span>
            <span class="settings-nav-meta">
              <strong>${c.title}</strong>
              <span>${c.sub}</span>
            </span>
          </button>
        `).join('')}
      </aside>
      <section class="settings-panel">${panelHtml}</section>
    `;

    wrap.querySelectorAll('[data-sec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playUiSound('move');
        state.activeSettingsSection = btn.dataset.sec;
        renderSettingsWorkspace(true, `[data-sec="${btn.dataset.sec}"]`);
        if (tvContentEl) tvContentEl.scrollTop = 0;
      });
    });

    wrap.querySelectorAll('[data-accent-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.accentPick;
        state.settings.accentColor = key;
        applyAllSettings();
        playUiSound('select');
        renderSettingsWorkspace(false, `[data-accent-pick="${key}"]`);
      });
    });

    wrap.querySelectorAll('[data-home-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [secId, dirStr] = btn.dataset.homeMove.split(':');
        const dir = Number(dirStr);
        const defOrder = ['apps', 'live', 'continue', 'trending', 'settings'];
        const cur = Array.isArray(state.settings.homeSectionOrder) && state.settings.homeSectionOrder.length
          ? [...new Set([...state.settings.homeSectionOrder, ...defOrder])]
          : [...defOrder];
        const idx = cur.indexOf(secId);
        const nextIdx = idx + dir;
        if (idx < 0 || nextIdx < 0 || nextIdx >= cur.length) return;
        [cur[idx], cur[nextIdx]] = [cur[nextIdx], cur[idx]];
        state.settings.homeSectionOrder = cur;
        applyAllSettings();
        playUiSound('move');
        renderSettingsWorkspace(false, `[data-home-move="${secId}:${dir}"]`);
      });
    });

    wrap.querySelectorAll('[data-stg-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.stgToggle;
        const scope = btn.dataset.scope;
        const targetObj = scope === 'smartHome' ? state.smartHome : state.settings;
        targetObj[key] = !targetObj[key];
        applyAllSettings();
        playUiSound(targetObj[key] ? 'select' : 'back');
        renderSettingsWorkspace(false, `[data-stg-toggle="${key}"]`);
      });
    });

    wrap.querySelectorAll('[data-stg-range]').forEach((inp) => {
      const key = inp.dataset.stgRange;
      const unit = inp.dataset.unit || '';
      inp.addEventListener('input', () => {
        state.settings[key] = Number(inp.value);
        const badge = wrap.querySelector(`#val-${key}`);
        if (badge) badge.textContent = `${inp.value}${unit}`;
        applyAllSettings();
      });
      inp.addEventListener('change', () => {
        playUiSound('move');
        renderSettingsWorkspace(false, `[data-stg-range="${key}"]`);
      });
    });

    wrap.querySelectorAll('[data-stg-seg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.stgSeg;
        const raw = btn.dataset.val;
        if (key === 'theme') {
          playUiSound('select');
          applyTheme(raw, true);
          setTimeout(() => {
            const restored = rowsContainer.querySelector(`[data-stg-seg="theme"][data-val="${raw}"]`);
            if (restored) setFocus(restored, false);
          }, 0);
          return;
        }
        let parsed = raw;
        if (raw === 'true') parsed = true;
        else if (raw === 'false') parsed = false;
        else if (!Number.isNaN(Number(raw)) && ['uiScale', 'cardRadius', 'defaultAudioTrack', 'seekStep', 'screensaverMinutes'].includes(key)) {
          parsed = Number(raw);
        }
        state.settings[key] = parsed;
        applyAllSettings();
        if (key === 'gpuPreference') {
          if (typeof IrisGpuManager !== 'undefined') {
            IrisGpuManager.applyPreference(parsed);
          }
          if (parsed === 'dedicated') showToast('GPU Dedicada (Mais Potente) ativada a 60 FPS');
          else if (parsed === 'integrated') showToast('GPU Integrada (Modo Econômico) ativada');
          else showToast('GPU no Modo Automático do Sistema');
        }
        playUiSound('select');
        renderSettingsWorkspace(false, `[data-stg-seg="${key}"][data-val="${raw}"]`);
      });
    });

    wrap.querySelector('#stg-gpu-refresh-btn')?.addEventListener('click', async () => {
      playUiSound('select');
      await refreshOsStatus();
      if (typeof IrisGpuManager !== 'undefined') {
        IrisGpuManager.applyPreference(state.settings.gpuPreference || 'dedicated');
      }
      renderSettingsWorkspace(false, '#stg-gpu-refresh-btn');
      showToast('Hardware gráfico verificado');
    });

    wrap.querySelectorAll('[data-test-sfx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!state.soundEnabled) {
          showToast('Ative os sons para ouvir');
          return;
        }
        playUiSound(btn.dataset.testSfx);
      });
    });

    const osVolInput = wrap.querySelector('#stg-os-vol');
    if (osVolInput) {
      let volTimer = null;
      osVolInput.addEventListener('input', () => {
        const v = Number(osVolInput.value);
        const valBadge = wrap.querySelector('#val-os-vol');
        const statBadge = wrap.querySelector('#stg-os-vol-stat');
        if (valBadge) valBadge.textContent = `${v}%`;
        if (statBadge) statBadge.textContent = `${v}%`;
        clearTimeout(volTimer);
        volTimer = setTimeout(() => updateOsVolume({ volume: v, muted: false }), 120);
      });
      osVolInput.addEventListener('change', () => {
        updateOsVolume({ volume: Number(osVolInput.value), muted: false });
        playUiSound('move');
      });
    }

    wrap.querySelector('#stg-os-mute')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const nextMute = !btn.classList.contains('on');
      btn.classList.toggle('on', nextMute);
      await updateOsVolume({ muted: nextMute });
      playUiSound(nextMute ? 'back' : 'select');
      renderSettingsWorkspace(false, '#stg-os-mute');
    });

    wrap.querySelector('#stg-reset-display-btn')?.addEventListener('click', () => {
      const ds = DEFAULT_THEME_CONFIG.settings || DEFAULT_SETTINGS;
      state.settings.pictureMode = ds.pictureMode ?? 'standard';
      state.settings.brightness = ds.brightness ?? 100;
      state.settings.contrast = ds.contrast ?? 100;
      state.settings.saturation = ds.saturation ?? 100;
      state.settings.colorTemp = ds.colorTemp ?? 'neutral';
      state.settings.autoNightMode = !!ds.autoNightMode;
      state.settings.autoSystemTheme = !!ds.autoSystemTheme;
      state.settings.tvSafeMargin = ds.tvSafeMargin ?? 0;
      state.settings.textSharpness = !!ds.textSharpness;
      state.smartHome.ecoMode = !!(DEFAULT_THEME_CONFIG.smartHome && DEFAULT_THEME_CONFIG.smartHome.ecoMode);
      applyTheme(DEFAULT_THEME_CONFIG.theme || 'prism', false);
      applyAllSettings();
      playUiSound('select');
      renderSettingsWorkspace(false, '#stg-reset-display-btn');
      showToast('Padrões de tela e imagem restaurados');
    });

    wrap.querySelector('#stg-fs-btn')?.addEventListener('click', () => {
      playUiSound('select');
      toggleTvFullscreen();
    });

    wrap.querySelector('#stg-wake-btn')?.addEventListener('click', async (e) => {
      const next = !state.keepAwake;
      await setKeepAwake(next);
      e.currentTarget.classList.toggle('on', next);
      playUiSound(next ? 'select' : 'back');
      showToast(next ? 'Tela mantida ligada' : 'Energia padrão ativada');
    });

    wrap.querySelector('#stg-os-dark-btn')?.addEventListener('click', async () => {
      const nextDark = !(state.systemInfo && state.systemInfo.darkMode);
      playUiSound('select');
      try {
        const r = await fetch('/api/os/appearance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ darkMode: nextDark })
        });
        const resData = await r.json();
        if (resData.ok) {
          applyTheme(nextDark ? 'prism' : 'light', false);
          await refreshOsStatus();
          showToast(`Aparência alterada para ${nextDark ? 'Escuro' : 'Claro'}`);
          renderSettingsWorkspace(false, '#stg-os-dark-btn');
        } else {
          showToast('Permita controle nas configurações do sistema');
        }
      } catch (_) { }
    });

    const vaultListEl = wrap.querySelector('#stg-vault-list');
    const loadVaultList = async () => {
      if (!vaultListEl) return;
      try {
        const r = await fetch('/api/passwords/list');
        const data = await r.json();
        const items = data?.items || [];
        if (!items.length) {
          vaultListEl.innerHTML = `<span style="font-size:0.84rem;color:var(--text-secondary);">Nenhuma senha salva ainda no cofre do irisTV.</span>`;
          return;
        }
        vaultListEl.innerHTML = items.map((it) => `
          <div class="setting-row" style="padding:10px 14px;">
            <div class="setting-meta">
              <div class="setting-title">${escHtml(it.host)}</div>
              <div class="setting-desc">${escHtml(it.username || 'Sem usuário')}</div>
            </div>
            <div class="setting-control" style="gap:8px;">
              <button class="stg-btn" type="button" data-vault-copy="${escHtml(it.host)}">Copiar Senha</button>
              <button class="stg-btn danger" type="button" data-vault-del="${escHtml(it.host)}">Remover</button>
            </div>
          </div>
        `).join('');
        vaultListEl.querySelectorAll('[data-vault-copy]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const host = btn.dataset.vaultCopy;
            try {
              const res = await fetch(`/api/passwords/get?host=${encodeURIComponent(host)}`);
              const cred = await res.json();
              if (cred?.found && cred.password) {
                await navigator.clipboard?.writeText(cred.password);
                playUiSound('select');
                showToast(`Senha de ${host} copiada`);
              }
            } catch (_) { }
          });
        });
        vaultListEl.querySelectorAll('[data-vault-del]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const host = btn.dataset.vaultDel;
            await fetch('/api/passwords/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ host })
            }).catch(() => { });
            playUiSound('back');
            showToast(`Senha de ${host} removida`);
            loadVaultList();
          });
        });
      } catch (_) { }
    };
    if (vaultListEl) loadVaultList();

    wrap.querySelector('#stg-vault-save-btn')?.addEventListener('click', async () => {
      const host = wrap.querySelector('#stg-vault-host')?.value?.trim() || '';
      const username = wrap.querySelector('#stg-vault-user')?.value?.trim() || '';
      const password = wrap.querySelector('#stg-vault-pass')?.value || '';
      if (!host || !password) {
        showToast('Preencha o site e a senha');
        return;
      }
      const r = await fetch('/api/passwords/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, username, password })
      });
      if (r.ok) {
        wrap.querySelector('#stg-vault-host').value = '';
        wrap.querySelector('#stg-vault-user').value = '';
        wrap.querySelector('#stg-vault-pass').value = '';
        playUiSound('select');
        showToast(`Senha salva para ${host} no irisTV`);
        loadVaultList();
      }
    });

    wrap.querySelector('#stg-sleep-display-btn')?.addEventListener('click', () => {
      playUiSound('back');
      fetch('/api/os/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sleep-display' })
      }).catch(() => { });
    });

    wrap.querySelector('#stg-quit-webview-btn')?.addEventListener('click', () => {
      postWebViewAction('quit');
    });

    wrap.querySelector('#stg-btn-osk')?.addEventListener('click', () => {
      playUiSound('select');
      openOnScreenKeyboard(null, 'Teste do Teclado na Tela');
    });
    wrap.querySelector('#stg-btn-remote')?.addEventListener('click', () => {
      playUiSound('select');
      virtualRemote.classList.remove('hidden');
      ensureScopeFocus();
    });
    wrap.querySelector('#stg-btn-ss')?.addEventListener('click', () => openScreensaver());
    wrap.querySelectorAll('[data-select-wp]').forEach((card) => {
      card.addEventListener('click', () => {
        const wpId = card.dataset.selectWp;
        state.settings.activeWallpaperId = wpId;
        const foundIdx = activeWallpapersList.findIndex((w) => w.id === wpId);
        if (foundIdx !== -1) {
          ssCurrentWpIndex = foundIdx;
        }
        applyAllSettings();
        updateMainScreenWallpaper();
        playUiSound('select');
        const wpObj = activeWallpapersList.find((w) => w.id === wpId);
        showToast(`Fundo da TV alterado: ${wpObj?.title || '4K'}`);
        renderSettingsWorkspace(false, `[data-select-wp="${wpId}"]`);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });

    const saveNameFn = () => {
      const nameInp = wrap.querySelector('#stg-user-name');
      if (!nameInp) return;
      const clean = nameInp.value.trim() || 'Usuário';
      obState.name = clean;
      state.currentProfile.name = clean;
      state.currentProfile.initial = clean[0].toUpperCase();
      currentAvatar.textContent = state.currentProfile.initial;
      localStorage.setItem('iristv-user-name', clean);
      playUiSound('select');
      showToast(`Nome atualizado: ${clean}`);
      renderSettingsWorkspace(false, '#stg-save-name');
    };
    wrap.querySelector('#stg-save-name')?.addEventListener('click', saveNameFn);
    wrap.querySelector('#stg-user-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveNameFn(); }
    });

    wrap.querySelectorAll('[data-pin-app]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pinApp;
        if (obState.pickedApps.has(id)) obState.pickedApps.delete(id);
        else obState.pickedApps.add(id);
        btn.classList.toggle('selected', obState.pickedApps.has(id));
        localStorage.setItem('iristv-pinned-apps', JSON.stringify(Array.from(obState.pickedApps)));
        syncInstalledApps();
        playUiSound('move');
        showToast('Ordem dos apps atualizada na Home');
      });
    });

    wrap.querySelector('#stg-net-test')?.addEventListener('click', async () => {
      playUiSound('select');
      const pingEl = wrap.querySelector('#stg-ping-val');
      if (pingEl) pingEl.textContent = 'Testando...';
      try {
        const samples = [];
        let latest = null;
        for (let i = 0; i < 3; i += 1) {
          const t0 = performance.now();
          const r = await fetch(`/api/system?t=${Date.now()}`, { cache: 'no-store' });
          const dt = performance.now() - t0;
          if (r.ok) {
            latest = await r.json();
            samples.push(dt);
          }
        }
        if (latest) state.systemInfo = latest;
        if (samples.length) {
          state.lastPingMs = Math.max(1, Math.round(samples.reduce((a, b) => a + b, 0) / samples.length));
          showToast(`Tempo de resposta: ${state.lastPingMs} ms`);
          renderSettingsWorkspace(false, '#stg-net-test');
        }
      } catch (_) {
        if (pingEl) pingEl.textContent = 'Erro';
      }
    });

    wrap.querySelector('#stg-onboarding')?.addEventListener('click', () => {
      playUiSound('select');
      openOnboarding(true);
    });

    wrap.querySelector('#dev-btn-redo-onboarding')?.addEventListener('click', () => {
      playUiSound('select');
      openOnboarding(true);
    });

    wrap.querySelector('#dev-btn-clear-flag')?.addEventListener('click', () => {
      localStorage.removeItem('iristv-onboarded');
      playUiSound('select');
      showToast('Flag de onboarding removida! Próximo boot iniciará o assistente.');
      renderSettingsWorkspace(false, '#dev-btn-clear-flag');
    });

    wrap.querySelector('#dev-btn-test-assembly')?.addEventListener('click', () => {
      playUiSound('select');
      cinematicInterfaceAssembly();
    });

    wrap.querySelector('#dev-btn-test-console')?.addEventListener('click', () => {
      playUiSound('select');
      showToast('IrisDev ativo! Iniciando onboarding em 500ms...');
      setTimeout(() => window.IrisDev?.redoOnboarding(true), 500);
    });

    wrap.querySelector('#dev-btn-reboot')?.addEventListener('click', () => {
      playUiSound('back');
      localStorage.removeItem('iristv-onboarded');
      sessionStorage.removeItem('irisos-booted');
      window.location.reload();
    });
    wrap.querySelector('#stg-reset-all')?.addEventListener('click', () => {
      state.settings = { ...DEFAULT_SETTINGS };
      state.smartHome = { ...DEFAULT_THEME_CONFIG.smartHome };
      state.favorites = new Set();
      state.mediaTracker = {};
      CONTINUE_WATCHING.length = 0;
      obState.pickedApps = new Set();
      [
        'iristv-settings-v1', 'iristv-smarthome-v1', 'iristv-favorites-v1',
        'iristv-continue-v1', 'iristv-media-tracker-v1', 'iristv-pinned-apps',
        'iristv_installed_apps_v1', 'iristv_custom_apps_v1', 'iristv_notes_v1',
        'iristv_mediaplayer_v1', 'iristv-custom-m3u-v5', 'iristv-user-name'
      ].forEach((k) => { try { localStorage.removeItem(k); } catch (_) { } });
      syncAppsFromStore();
      LIVE_CHANNELS = loadLiveChannels();
      applyTheme(DEFAULT_THEME_CONFIG.theme || 'prism', false);
      applyAllSettings();
      playUiSound('chime');
      showToast('Sistema restaurado sem dados pessoais');
      renderSettingsWorkspace(false, '#stg-reset-all');
    });

    rowsContainer.appendChild(wrap);
    if (!animateEnter && tvContentEl) tvContentEl.scrollTop = prevScroll;
    if (restoreSelector) {
      const target = wrap.querySelector(restoreSelector);
      if (target) setFocus(target, false);
    }
  }

  function closeAppStage() {
    if (appStageOverlay.classList.contains('hidden') || appStageWindow.classList.contains('is-closing')) return;
    if (activeDetailsAbortCtrl) {
      try { activeDetailsAbortCtrl.abort(); } catch (_) { }
      activeDetailsAbortCtrl = null;
    }
    // Cancel in-flight image decodes & embeds immediately to reclaim network sockets & compositor thread
    if (appStageBody) {
      const hero = appStageBody.querySelector('.details-hero');
      if (hero) hero.style.backgroundImage = 'none';
      appStageBody.querySelectorAll('img').forEach((img) => {
        img.src = '';
        img.removeAttribute('src');
      });
      appStageBody.querySelectorAll('iframe').forEach((ifr) => {
        ifr.src = 'about:blank';
        ifr.remove();
      });
      appStageBody.replaceChildren();
    }
    if (appStageBrand) appStageBrand.innerHTML = '';
    appStageWindow.style.removeProperty('--stage-glow');
    playUiSound('back');
    appStageWindow.classList.add('is-closing');
    setTimeout(() => {
      if (window.IrisNativeApps) window.IrisNativeApps.cleanupActiveNative();
      if (window.IrisNativeGames) window.IrisNativeGames.cleanup();
      if (window.IrisMediaPlayer) window.IrisMediaPlayer.cleanup();
      appStageWindow.classList.remove('is-details-mode', 'is-store-mode', 'is-fullscreen-app', 'is-mediaplayer-app', 'is-closing');
      appStageOverlay.classList.add('hidden');
      if (state.showsGridDirty && state.activeTab === 'shows') {
        state.showsGridDirty = false;
        if (state.activeShowView === 'watched' || state.activeShowView === 'watchlist') {
          renderShowsGridOnly();
        } else {
          syncSingleShowCardStatus(currentDetailsShow);
        }
      }
      if (state.appsGridDirty && (state.activeTab === 'home' || state.activeTab === 'apps')) {
        state.appsGridDirty = false;
        renderTab(state.activeTab);
      }
      ensureScopeFocus(lastOpenedMediaCard);
      lastOpenedMediaCard = null;
      currentDetailsShow = null;
    }, 140);
  }

  document.getElementById('close-app-stage').addEventListener('click', closeAppStage);
  document.getElementById('app-stage-backdrop').addEventListener('click', closeAppStage);

  /* =========================================================
     Spotlight Search & Profiles
     ========================================================= */
  let searchFilter = 'all';
  let searchRenderToken = 0;

  function renderSearchResults() {
    const token = ++searchRenderToken;
    const q = searchInput.value.trim().toLowerCase();
    const pool = window.IrisStore ? window.IrisStore.getFullCatalog() : APPS;
    const allApps = pool.filter((app) => {
      const catOk = searchFilter === 'all' || app.category === searchFilter;
      const textOk = !q || app.name.toLowerCase().includes(q) || (app.tagline || '').toLowerCase().includes(q) || (app.developer || '').toLowerCase().includes(q);
      return catOk && textOk;
    });

    const allShows = (searchFilter === 'all' || searchFilter === 'streaming')
      ? TRENDING_SHOWS.filter((s) => !q || s.title.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q) || s.appName.toLowerCase().includes(q))
      : [];

    const appMatches = q ? allApps.slice(0, 24) : allApps.slice(0, 14);
    const showMatches = q ? allShows.slice(0, 18) : allShows.slice(0, 10);

    searchResults.replaceChildren();
    if (!appMatches.length && !showMatches.length) {
      searchResults.innerHTML = `<div style="text-align:center;padding:36px 20px;color:rgba(255,255,255,0.55);font-weight:500;">Nenhum resultado encontrado para "${escHtml(searchInput.value.trim())}".</div>`;
      return;
    }

    const appendSmoothBatch = (host, list, makeEl, batchSize = 5) => {
      let i = 0;
      const next = () => {
        if (searchRenderToken !== token || searchOverlay.classList.contains('hidden')) return;
        const frag = document.createDocumentFragment();
        const batch = [];
        const end = Math.min(list.length, i + batchSize);
        for (; i < end; i++) {
          const el = makeEl(list[i], i);
          if (el) {
            el.style.transitionDelay = `${(batch.length) * 24}ms`;
            el.classList.add('iris-card-pre');
            enhanceProgressiveImages(el);
            batch.push(el);
            frag.appendChild(el);
          }
        }
        host.appendChild(frag);
        requestAnimationFrame(() => {
          if (searchRenderToken !== token) return;
          batch.forEach((el) => {
            el.classList.remove('iris-card-pre');
            el.classList.add('iris-card-in');
          });
        });
        if (i < list.length) {
          setTimeout(() => {
            if (searchRenderToken === token) requestAnimationFrame(next);
          }, 16);
        }
      };
      requestAnimationFrame(next);
    };

    if (appMatches.length) {
      const appSec = document.createElement('div');
      appSec.innerHTML = `<div class="spotlight-section-title">Aplicativos (${allApps.length})</div>`;
      const appGrid = document.createElement('div');
      appGrid.className = 'spotlight-apps-grid';
      appSec.appendChild(appGrid);
      searchResults.appendChild(appSec);

      appendSmoothBatch(appGrid, appMatches, (app, idx) => {
        const tile = createAppTile(app, 'search', idx);
        tile.querySelector('button')?.addEventListener('click', closeSearch);
        return tile;
      }, 6);
    }

    if (showMatches.length) {
      const showSec = document.createElement('div');
      showSec.innerHTML = `<div class="spotlight-section-title">Séries &amp; Filmes (${allShows.length})</div>`;
      const showGrid = document.createElement('div');
      showGrid.className = 'spotlight-shows-grid';
      showSec.appendChild(showGrid);
      searchResults.appendChild(showSec);

      appendSmoothBatch(showGrid, showMatches, (show, idx) => {
        const card = createPosterCard(show, 'search', idx);
        card.addEventListener('click', closeSearch);
        return card;
      }, 5);
    }
  }

  let searchDebounce = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderSearchResults, 100);
  });

  function openSearch() {
    playUiSound('select');
    searchRenderToken++;
    searchInput.value = '';
    searchResults.innerHTML = `<div style="text-align:center;padding:28px 20px;color:rgba(255,255,255,0.55);font-size:0.9rem;font-weight:500;">Carregando aplicativos e títulos...</div>`;
    searchOverlay.classList.remove('hidden');
    searchInput.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!searchOverlay.classList.contains('hidden')) {
          renderSearchResults();
        }
      }, 24);
    });
  }

  function closeSearch() {
    if (searchOverlay.classList.contains('hidden')) return;
    playUiSound('back');
    searchOverlay.classList.add('hidden');
    setTimeout(() => ensureScopeFocus(), 20);
  }

  document.getElementById('search-trigger').addEventListener('click', openSearch);
  document.getElementById('close-search-btn').addEventListener('click', closeSearch);
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  document.querySelectorAll('#search-filters .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      playUiSound('move');
      searchFilter = chip.dataset.filter;
      document.querySelectorAll('#search-filters .filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderSearchResults();
    });
  });

  function openProfiles() {
    playUiSound('select');
    profilesGrid.innerHTML = PROFILES.map(
      (p) => `
      <button class="profile-choice ${p.id === state.currentProfile.id ? 'active' : ''}" data-pid="${p.id}">
        <span class="profile-choice-avatar" style="background:${p.gradient}">${p.initial}</span>
        <span class="profile-choice-name">${p.name}</span>
        <span class="profile-choice-tag">${p.tag}</span>
      </button>
    `
    ).join('');

    profilesGrid.querySelectorAll('.profile-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = PROFILES.find((p) => p.id === btn.dataset.pid);
        if (!chosen) return;
        state.currentProfile = chosen;
        currentAvatar.textContent = chosen.initial;
        currentAvatar.style.background = chosen.gradient;
        playUiSound('select');
        profileOverlay.classList.add('hidden');
        showToast(`Perfil: ${chosen.name}`);
        ensureScopeFocus();
      });
    });

    profileOverlay.classList.remove('hidden');
    setTimeout(() => ensureScopeFocus(), 30);
  }

  document.getElementById('profile-btn').addEventListener('click', openProfiles);
  document.getElementById('close-profile-btn').addEventListener('click', () => {
    playUiSound('back');
    profileOverlay.classList.add('hidden');
    ensureScopeFocus();
  });
  profileOverlay.addEventListener('click', (e) => {
    if (e.target === profileOverlay) {
      profileOverlay.classList.add('hidden');
      ensureScopeFocus();
    }
  });

  /* =========================================================
     Volume OSD & Custom On-Screen Keyboard & Spatial D-Pad
     ========================================================= */
  const volumeOsdEl = document.getElementById('volume-osd');
  const volumeOsdIcon = document.getElementById('volume-osd-icon');
  const volumeOsdVal = document.getElementById('volume-osd-val');
  const volumeOsdFill = document.getElementById('volume-osd-fill');
  let volumeOsdTimer = null;

  function showVolumeHud(vol, muted = false) {
    if (!volumeOsdEl) return;
    const cleanVol = Math.max(0, Math.min(100, Math.round(Number(vol) || 0)));
    const isMuted = Boolean(muted) || cleanVol === 0;
    if (volumeOsdIcon) volumeOsdIcon.innerHTML = isMuted ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    if (volumeOsdVal) volumeOsdVal.textContent = isMuted ? 'Mudo' : `${cleanVol}%`;
    if (volumeOsdFill) volumeOsdFill.style.width = `${isMuted ? 0 : cleanVol}%`;
    volumeOsdEl.classList.remove('hidden');
    clearTimeout(volumeOsdTimer);
    volumeOsdTimer = setTimeout(() => volumeOsdEl.classList.add('hidden'), 1800);
    syncSoundPillUi(cleanVol, isMuted);
  }

  async function adjustSystemVolume(delta = 0, toggleMute = false) {
    const curAudio = state.systemInfo?.audio || {};
    let curVol = typeof curAudio.outputVolume === 'number' ? curAudio.outputVolume : (lastActiveVolume || 70);
    let curMuted = typeof curAudio.muted === 'boolean' ? curAudio.muted : true;

    if (toggleMute) {
      curMuted = !curMuted;
      if (!curMuted && curVol === 0) curVol = lastActiveVolume || 70;
    } else if (delta !== 0) {
      curVol = Math.max(0, Math.min(100, curVol + delta));
      curMuted = curVol === 0;
    }

    if (!curMuted && curVol > 0) {
      lastActiveVolume = curVol;
    }

    if (!state.systemInfo) state.systemInfo = {};
    state.systemInfo.audio = { ...(state.systemInfo.audio || {}), supported: true, outputVolume: curVol, muted: curMuted };

    if (playerVideo && !cinemaPlayer.classList.contains('hidden')) {
      playerVideo.muted = curMuted;
      if (!curMuted) playerVideo.volume = curVol / 100;
      syncPlayerUi();
    }

    showVolumeHud(curVol, curMuted);
    syncSoundPillUi(curVol, curMuted);
    const updated = await updateOsVolume(toggleMute ? { muted: curMuted } : { volume: curVol, muted: curMuted });
    if (updated && typeof updated.outputVolume === 'number') {
      showVolumeHud(updated.outputVolume, updated.muted);
      syncSoundPillUi(updated.outputVolume, updated.muted);
    }
    if (state.activeTab === 'settings' && state.activeSettingsSection === 'audio') {
      const valBadge = document.getElementById('val-os-vol');
      const statBadge = document.getElementById('stg-os-vol-stat');
      const slider = document.getElementById('stg-os-vol');
      const muteBtn = document.getElementById('stg-os-mute');
      const v = updated?.outputVolume ?? curVol;
      const m = updated?.muted ?? curMuted;
      if (valBadge) valBadge.textContent = `${v}%`;
      if (statBadge) statBadge.textContent = m ? 'Mudo' : `${v}%`;
      if (slider) slider.value = String(v);
      if (muteBtn) muteBtn.classList.toggle('on', !!m);
    }
  }

  let lastHwVolAt = 0;
  function initOsHardwareEvents() {
    if (typeof EventSource === 'undefined') return;
    try {
      const es = new EventSource('/api/os/events');
      es.addEventListener('volume', (ev) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (typeof data.outputVolume !== 'number') return;
          lastHwVolAt = Date.now();
          const v = Math.max(0, Math.min(100, Math.round(data.outputVolume)));
          const m = Boolean(data.muted);
          if (!m && v > 0) lastActiveVolume = v;
          if (!state.systemInfo) state.systemInfo = {};
          state.systemInfo.audio = { ...(state.systemInfo.audio || {}), supported: true, outputVolume: v, muted: m };
          if (playerVideo && !cinemaPlayer.classList.contains('hidden')) {
            playerVideo.muted = m;
            if (!m) playerVideo.volume = v / 100;
            syncPlayerUi();
          }
          showVolumeHud(v, m);
          syncSoundPillUi(v, m);
          if (state.activeTab === 'settings' && state.activeSettingsSection === 'audio') {
            const valBadge = document.getElementById('val-os-vol');
            const statBadge = document.getElementById('stg-os-vol-stat');
            const slider = document.getElementById('stg-os-vol');
            const muteBtn = document.getElementById('stg-os-mute');
            if (valBadge) valBadge.textContent = `${v}%`;
            if (statBadge) statBadge.textContent = m ? 'Mudo' : `${v}%`;
            if (slider) slider.value = String(v);
            if (muteBtn) muteBtn.classList.toggle('on', !!m);
          }
        } catch {}
      });
    } catch {}
  }
  initOsHardwareEvents();

  const irisOskEl = document.getElementById('iris-osk');
  const oskRowsEl = document.getElementById('osk-rows');
  const oskPreviewText = document.getElementById('osk-preview-text');
  const oskFieldLabel = document.getElementById('osk-field-label');
  const oskCloseBtn = document.getElementById('osk-close-btn');

  const OSK_LAYOUTS = {
    lower: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
      ['ABC', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'DEL'],
      ['123', 'ÁÉ', ' ', '.', '-', 'Limpar', 'Concluir']
    ],
    upper: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
      ['abc', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DEL'],
      ['123', 'ÁÉ', ' ', '.', '-', 'Limpar', 'Concluir']
    ],
    accents: [
      ['á', 'à', 'â', 'ã', 'é', 'ê', 'í', 'ó', 'ô', 'õ'],
      ['ú', 'ü', 'ç', 'Á', 'À', 'Â', 'Ã', 'É', 'Ê', 'Í'],
      ['Ó', 'Ô', 'Õ', 'Ú', '/', '@', '_', ':', '?', '!'],
      ['abc', '+', '=', '&', '%', '#', '(', ')', 'DEL'],
      ['abc', ' ', '.', '-', 'Limpar', 'Concluir']
    ],
    symbols: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['/', ':', '.', '-', '_', '@', '?', '&', '=', '+'],
      ['!', '#', '$', '%', '*', '(', ')', '[', ']', ','],
      ['abc', ';', '"', "'", '<', '>', '\\', '~', 'DEL'],
      ['abc', 'ÁÉ', ' ', 'Limpar', 'Concluir']
    ]
  };

  const oskState = {
    targetInput: null,
    targetInputId: '',
    buffer: '',
    mode: 'lower',
    returnFocusEl: null
  };

  function resolveOskTarget() {
    if (oskState.targetInput && document.body.contains(oskState.targetInput)) {
      return oskState.targetInput;
    }
    if (oskState.targetInputId) {
      const byId = document.getElementById(oskState.targetInputId);
      if (byId) {
        oskState.targetInput = byId;
        return byId;
      }
    }
    if (offlineGateOverlay && !offlineGateOverlay.classList.contains('hidden')) {
      const gateInp = offlineGateOverlay.querySelector('.wifi-pass-input');
      if (gateInp) {
        oskState.targetInput = gateInp;
        oskState.targetInputId = gateInp.id || '';
        return gateInp;
      }
    }
    if (wifiPopover && !wifiPopover.classList.contains('hidden')) {
      const wifiInp = wifiPopover.querySelector('.wifi-pass-input');
      if (wifiInp) {
        oskState.targetInput = wifiInp;
        oskState.targetInputId = wifiInp.id || '';
        return wifiInp;
      }
    }
    return null;
  }

  function getOskValue() {
    return String(oskState.buffer || '');
  }

  function setOskValue(nextVal) {
    const strVal = String(nextVal ?? '');
    oskState.buffer = strVal;
    const target = resolveOskTarget();
    if (target) {
      target.value = strVal;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (oskPreviewText) oskPreviewText.textContent = strVal;
  }

  function renderOskKeys(restoreVal = null) {
    if (!oskRowsEl) return;
    const rows = OSK_LAYOUTS[oskState.mode] || OSK_LAYOUTS.lower;
    oskRowsEl.innerHTML = rows.map((row) => `
      <div class="osk-row">
        ${row.map((k) => {
      const isSpace = k === ' ';
      const isPrimary = k === 'Concluir';
      const isWide = ['ABC', 'abc', '123', 'ÁÉ', 'DEL', 'Limpar'].includes(k);
      const label = isSpace ? 'Espaço' : k;
      const cls = `osk-key ${isSpace ? 'space' : ''} ${isPrimary ? 'primary' : ''} ${isWide ? 'wide' : ''}`;
      return `<button class="${cls}" type="button" data-osk-key="${escHtml(k)}">${escHtml(label)}</button>`;
    }).join('')}
      </div>
    `).join('');

    oskRowsEl.querySelectorAll('[data-osk-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.oskKey;
        const cur = getOskValue();
        if (k === 'ABC') { oskState.mode = 'upper'; playUiSound('move'); renderOskKeys('abc'); return; }
        if (k === 'abc') { oskState.mode = 'lower'; playUiSound('move'); renderOskKeys('ABC'); return; }
        if (k === '123') { oskState.mode = 'symbols'; playUiSound('move'); renderOskKeys('abc'); return; }
        if (k === 'ÁÉ') { oskState.mode = 'accents'; playUiSound('move'); renderOskKeys('abc'); return; }
        if (k === 'DEL') {
          playUiSound('back');
          setOskValue(cur.slice(0, -1));
          return;
        }
        if (k === 'Limpar') {
          playUiSound('back');
          setOskValue('');
          return;
        }
        if (k === 'Concluir') {
          const target = resolveOskTarget();
          const wifiPanel = target?.closest('[data-wifi-form]');
          const form = target?.closest('form');
          const finalVal = getOskValue().trim();
          closeOnScreenKeyboard();
          if (wifiPanel && finalVal) {
            wifiPanel.querySelector('.wifi-submit-btn')?.click();
          } else if (form && finalVal) {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
          return;
        }
        playUiSound('move');
        setOskValue(cur + k);
      });
    });

    if (restoreVal) {
      const rBtn = oskRowsEl.querySelector(`[data-osk-key="${CSS.escape(restoreVal)}"]`);
      if (rBtn) setFocus(rBtn, false);
    } else {
      const firstKey = oskRowsEl.querySelector('[data-osk-key="q"]') || oskRowsEl.querySelector('[data-osk-key]');
      if (firstKey) setFocus(firstKey, false);
    }
  }

  function openOnScreenKeyboard(targetInput = null, customLabel = null) {
    if (!irisOskEl) return;
    oskState.returnFocusEl = state.focusEl;
    oskState.targetInput = targetInput;
    oskState.targetInputId = targetInput?.id || '';
    oskState.buffer = targetInput ? String(targetInput.value || '') : '';
    oskState.mode = 'lower';
    if (oskFieldLabel) {
      oskFieldLabel.textContent = customLabel || targetInput?.placeholder || 'Digitar texto';
    }
    if (oskPreviewText) oskPreviewText.textContent = getOskValue();
    irisOskEl.classList.remove('hidden');
    playUiSound('select');
    renderOskKeys();
  }

  function closeOnScreenKeyboard() {
    if (!irisOskEl || irisOskEl.classList.contains('hidden')) return;
    playUiSound('back');
    irisOskEl.classList.add('hidden');
    const backEl = oskState.returnFocusEl;
    oskState.targetInput = null;
    if (backEl && document.body.contains(backEl) && backEl.offsetParent !== null) {
      setFocus(backEl, false);
    } else {
      ensureScopeFocus();
    }
  }

  oskCloseBtn?.addEventListener('click', closeOnScreenKeyboard);

  function getActiveScopeRoot() {
    if (irisOskEl && !irisOskEl.classList.contains('hidden')) return irisOskEl;
    if (offlineGateOverlay && !offlineGateOverlay.classList.contains('hidden')) return offlineGateOverlay;
    if (wifiPopover && !wifiPopover.classList.contains('hidden')) return wifiPopover;
    if (calendarPopover && !calendarPopover.classList.contains('hidden')) return calendarPopover;
    if (onboardingOverlay && !onboardingOverlay.classList.contains('hidden')) return onboardingOverlay;
    if (cinemaPlayer && !cinemaPlayer.classList.contains('hidden')) return cinemaPlayer;
    if (m3uOverlay && !m3uOverlay.classList.contains('hidden')) return m3uOverlay;
    if (profileOverlay && !profileOverlay.classList.contains('hidden')) return profileOverlay;
    if (searchOverlay && !searchOverlay.classList.contains('hidden')) return searchOverlay;
    if (appStageOverlay && !appStageOverlay.classList.contains('hidden')) return appStageOverlay;
    if (virtualRemote && !virtualRemote.classList.contains('hidden') && state.focusEl && virtualRemote.contains(state.focusEl)) {
      return virtualRemote;
    }
    return document.getElementById('tv-shell');
  }

  function getScopeFocusableElements(scopeRoot = getActiveScopeRoot()) {
    if (!scopeRoot) return [];
    const selector = [
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '.stage-mini-card',
      '.store-app-card',
      '.details-provider-card'
    ].join(', ');
    const all = scopeRoot.querySelectorAll(selector);
    const visible = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.closest('.hidden')) continue;
      if (el.offsetParent === null) continue;
      visible.push(el);
    }
    return visible;
  }

  function setFocus(el, shouldScroll = true) {
    if (!el) return;
    if (state.focusEl && state.focusEl !== el) state.focusEl.classList.remove('is-focused');
    state.focusEl = el;
    el.classList.add('is-focused');
    el.dispatchEvent(new CustomEvent('iris-focus', { bubbles: true }));
    if (shouldScroll) {
      try {
        el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      } catch (_) { }
    }

    if (el.dataset.appId) {
      const app = APPS.find((a) => a.id === el.dataset.appId);
      if (app) setSpotlightItem({ type: 'app', data: app });
    } else if (el.dataset.showId) {
      const show = TRENDING_SHOWS.find((s) => s.id === el.dataset.showId);
      if (show) setSpotlightItem({ type: 'show', data: show });
    } else if (el.dataset.cwId) {
      const cw = CONTINUE_WATCHING.find((c) => c.id === el.dataset.cwId);
      if (cw) setSpotlightItem({ type: 'continue', data: cw });
    } else if (el.dataset.liveNum) {
      const ch = LIVE_CHANNELS.find((c) => c.num === el.dataset.liveNum);
      if (ch) setSpotlightItem({ type: 'live', data: ch });
    }
  }

  function ensureScopeFocus(preferredEl = null) {
    const scope = getActiveScopeRoot();
    if (preferredEl && scope?.contains(preferredEl) && preferredEl.offsetParent !== null) {
      setFocus(preferredEl, false);
      return preferredEl;
    }
    const items = getScopeFocusableElements(scope);
    if (!items.length) return null;
    if (state.focusEl && scope.contains(state.focusEl) && items.includes(state.focusEl)) {
      return state.focusEl;
    }
    setFocus(items[0], false);
    return items[0];
  }

  function moveSpatialFocus(direction) {
    const scope = getActiveScopeRoot();
    const candidates = getScopeFocusableElements(scope);
    if (!candidates.length) return;

    if (!state.focusEl || !scope.contains(state.focusEl) || !candidates.includes(state.focusEl)) {
      setFocus(candidates[0]);
      playUiSound('move');
      return;
    }

    const cur = state.focusEl;
    if (cur.tagName === 'INPUT' && cur.type === 'range' && (direction === 'left' || direction === 'right')) {
      const step = Number(cur.step) || 2;
      const min = Number(cur.min || 0);
      const max = Number(cur.max || 100);
      const curVal = Number(cur.value);
      const nextVal = Math.max(min, Math.min(max, curVal + (direction === 'right' ? step : -step)));
      if (nextVal !== curVal) {
        cur.value = String(nextVal);
        cur.dispatchEvent(new Event('input', { bubbles: true }));
        playUiSound('move');
      }
      return;
    }

    const curRect = cur.getBoundingClientRect();
    const cx = curRect.left + curRect.width / 2;
    const cy = curRect.top + curRect.height / 2;

    let best = null;
    let bestScore = Infinity;

    const candRects = candidates.map((cand) => {
      const r = cand.getBoundingClientRect();
      return { cand, r };
    });

    for (const { cand, r } of candRects) {
      if (cand === cur) continue;
      const nx = r.left + r.width / 2;
      const ny = r.top + r.height / 2;
      const dx = nx - cx;
      const dy = ny - cy;

      if (direction === 'left' && dx >= -4) continue;
      if (direction === 'right' && dx <= 4) continue;
      if (direction === 'up' && dy >= -4) continue;
      if (direction === 'down' && dy <= 4) continue;

      const primary = (direction === 'left' || direction === 'right') ? Math.abs(dx) : Math.abs(dy);
      const perp = (direction === 'left' || direction === 'right') ? Math.abs(dy) : Math.abs(dx);
      const score = primary + perp * 2.4;

      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (!best) {
      // Smooth row-wrap or tab fallback if at the very edge
      const curIdx = candidates.indexOf(cur);
      if (direction === 'right') best = candidates[(curIdx + 1) % candidates.length];
      else if (direction === 'left') best = candidates[(curIdx - 1 + candidates.length) % candidates.length];
    }

    if (best) {
      setFocus(best, true);
      playUiSound('move');
    }
  }

  /* =========================================================
     Real Cinema Video Player (HLS.js + Native HTML5 Video)
     ========================================================= */
  const cinemaPlayer = document.getElementById('cinema-player');
  const playerBgImg = document.getElementById('player-bg-img');
  const playerVideo = document.getElementById('player-video');
  const playerStatusPill = document.getElementById('player-status-pill');
  const playerZapBar = document.getElementById('player-zap-bar');
  const playerAppLabel = document.getElementById('player-app-label');
  const playerTitle = document.getElementById('player-title');
  const playerSub = document.getElementById('player-sub');
  const playerCurTime = document.getElementById('player-cur-time');
  const playerTotTime = document.getElementById('player-tot-time');
  const playerFill = document.getElementById('player-fill');
  const playerToggleBtn = document.getElementById('player-toggle-btn');
  const playerAudioBtn = document.getElementById('player-audio-btn');
  const playerQualityBtn = document.getElementById('player-quality-btn');
  const playerMuteBtn = document.getElementById('player-mute-btn');
  const playerVolRange = document.getElementById('player-vol-range');
  const playerLocalFile = document.getElementById('player-local-file');
  const playerCcBtn = document.getElementById('player-cc-btn');
  const playerCcLangBtn = document.getElementById('player-cc-lang-btn');
  const playerCaptionsWrap = document.getElementById('player-captions-wrap');
  const playerCaptionsMeta = document.getElementById('player-captions-meta');
  const playerCaptionsText = document.getElementById('player-captions-text');
  const playerTitleInline = document.getElementById('player-title-inline');
  const playerChannelsBtn = document.getElementById('player-channels-btn');
  const playerChPrevBtn = document.getElementById('player-ch-prev-btn');
  const playerChNextBtn = document.getElementById('player-ch-next-btn');
  const playerGuideBtn = document.getElementById('player-guide-btn');
  const playerRecBtn = document.getElementById('player-rec-btn');
  const playerChOsd = document.getElementById('player-ch-osd');
  const playerMoreBtn = document.getElementById('player-more-btn');
  const playerMorePopover = document.getElementById('player-more-popover');
  const playerTimelineRow = document.getElementById('player-timeline-row');

  const AUDIO_TRACKS = ['Áudio: Padrão', 'Áudio: Original', 'Áudio: Estéreo'];
  const CC_LANGS = [
    { code: 'auto', label: 'Auto' },
    { code: 'pt', label: 'PT' },
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' }
  ];
  const playerState = {
    playing: true,
    seconds: 0,
    total: 0,
    audioIdx: 0,
    isLive: false,
    activeLiveNum: null,
    hls: null,
    localObjectUrl: null,
    currentStreamUrl: null,
    ccEnabled: false,
    ccLangIdx: 0,
    ccDefaultLang: 'pt',
    ccSource: null,
    externalCues: [],
    ccSession: null,
    ccCues: [],
    ccQueuedKeys: new Set(),
    ccRecentFrags: [],
    ccRenderTimer: null,
    ccFadeTimer: null,
    ccPreRollTimer: null,
    ccPreRollStartFn: null,
    ccVodRequestedUntil: -1,
    ccWorkerReady: false
  };

  function clearCcPreRoll(triggerPlay = false) {
    clearTimeout(playerState.ccPreRollTimer);
    playerState.ccPreRollTimer = null;
    const fn = playerState.ccPreRollStartFn;
    playerState.ccPreRollStartFn = null;
    if (triggerPlay && typeof fn === 'function') fn();
  }

  function getEffectiveCcLang() {
    const cfg = CC_LANGS[playerState.ccLangIdx] || CC_LANGS[0];
    return cfg.code === 'auto' ? (playerState.ccDefaultLang || 'auto') : cfg.code;
  }

  function extractUpstreamUrl(raw) {
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      if (u.pathname === '/api/stream-proxy' && u.searchParams.get('url')) {
        return u.searchParams.get('url');
      }
      return u.toString();
    } catch (_) {
      return raw;
    }
  }

  function enqueueFragCaption(frag) {
    if (!playerState.ccEnabled || !playerState.ccSession || !frag || !frag.url) return;
    const rawUrl = extractUpstreamUrl(frag.url);
    const key = `${frag.type || 'main'}:${frag.sn}:${rawUrl}`;
    if (playerState.ccQueuedKeys.has(key)) return;
    playerState.ccQueuedKeys.add(key);
    if (playerState.ccQueuedKeys.size > 160) {
      const first = playerState.ccQueuedKeys.values().next().value;
      playerState.ccQueuedKeys.delete(first);
    }

    fetch('/api/captions/segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: playerState.ccSession,
        seq: Number(frag.sn || 0),
        url: rawUrl,
        start: Number(frag.start || 0),
        duration: Number(frag.duration || 0),
        lang: getEffectiveCcLang()
      })
    }).catch(() => { });
  }

  function maybeRequestVodCaptionWindow(curTime) {
    if (!playerState.ccEnabled || !playerState.ccSession) return;
    const url = playerState.currentStreamUrl;
    if (!url || !/^https?:\/\//i.test(url) || url.includes('.m3u8')) return;
    if (curTime + 4 >= playerState.ccVodRequestedUntil) {
      const ss = Math.max(0, Math.floor(Math.max(curTime, playerState.ccVodRequestedUntil)));
      playerState.ccVodRequestedUntil = ss + 8;
      fetch('/api/captions/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'vod',
          session: playerState.ccSession,
          url,
          ss,
          duration: 8,
          lang: getEffectiveCcLang()
        })
      }).catch(() => { });
    }
  }

  function renderActiveCaption() {
    if (!playerState.ccEnabled || cinemaPlayer.classList.contains('hidden')) return;
    const t = Number(playerVideo.currentTime) || 0;

    if (playerState.externalCues.length) {
      const extMatch = playerState.externalCues.find((c) => t >= c.start && t <= c.end);
      if (extMatch) {
        playerCaptionsWrap.classList.remove('hidden');
        if (playerCaptionsText.textContent !== extMatch.text) playerCaptionsText.textContent = extMatch.text;
      } else {
        playerCaptionsWrap.classList.add('hidden');
      }
      return;
    }

    maybeRequestVodCaptionWindow(t);

    if (!playerState.ccCues.length) return;

    let match = null;
    for (let i = playerState.ccCues.length - 1; i >= 0; i--) {
      const c = playerState.ccCues[i];
      if (t >= c.start - 0.14 && t <= c.end + 0.35) {
        match = c;
        break;
      }
    }
    if (!match) {
      for (let i = playerState.ccCues.length - 1; i >= 0; i--) {
        const c = playerState.ccCues[i];
        if (t > c.end && t <= c.end + 4.5) {
          match = c;
          break;
        }
      }
    }

    if (match) {
      playerCaptionsWrap.classList.remove('hidden');
      if (playerCaptionsText.textContent !== match.text) {
        playerCaptionsText.textContent = match.text;
      }
    } else {
      const newest = playerState.ccCues[playerState.ccCues.length - 1];
      if (newest && t > newest.end + 5.0) {
        playerCaptionsWrap.classList.add('hidden');
      }
    }
  }

  function stopLiveCaptions() {
    clearTimeout(playerState.ccFadeTimer);
    clearInterval(playerState.ccRenderTimer);
    playerState.ccRenderTimer = null;
    clearCcPreRoll(!cinemaPlayer.classList.contains('hidden'));
    if (playerState.ccSource) {
      try { playerState.ccSource.close(); } catch (_) { }
      playerState.ccSource = null;
    }
    if (playerState.ccSession) {
      fetch('/api/captions/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'reset', session: playerState.ccSession })
      }).catch(() => { });
    }
    playerState.ccSession = null;
    playerState.ccCues = [];
    playerState.ccQueuedKeys.clear();
    playerState.ccVodRequestedUntil = -1;
    playerCaptionsWrap?.classList.add('hidden');
  }

  function startLiveCaptions() {
    stopLiveCaptions();
    if (!playerState.ccEnabled) return;
    const url = playerState.currentStreamUrl;
    if (!url || !/^https?:\/\//i.test(url)) {
      playerCaptionsMeta.textContent = 'CC • Indisponível para arquivo local';
      playerCaptionsText.textContent = 'Disponível para canais e streams online.';
      playerCaptionsWrap.classList.remove('hidden');
      return;
    }

    const isM3u8 = url.includes('.m3u8');
    if (isM3u8 && window.Hls && window.Hls.isSupported() && !playerState.hls) {
      loadVideoStream(url, playerState.isLive);
    }

    const session = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    playerState.ccSession = session;
    playerState.ccCues = [];
    playerState.ccQueuedKeys.clear();
    playerState.ccVodRequestedUntil = -1;

    playerCaptionsMeta?.classList.add('hidden');
    playerCaptionsText.textContent = 'Carregando legendas...';
    playerCaptionsWrap.classList.remove('hidden');

    const es = new EventSource(`/api/captions/stream?session=${encodeURIComponent(session)}`);
    playerState.ccSource = es;

    es.onmessage = (ev) => {
      if (!playerState.ccEnabled || playerState.ccSession !== session) return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.status === 'ready') {
          playerState.ccWorkerReady = true;
          if (!playerState.ccCues.length) {
            playerCaptionsText.textContent = 'Ouvindo...';
          }
        } else if (msg.status === 'loading') {
          playerCaptionsMeta?.classList.add('hidden');
          playerCaptionsText.textContent = 'Carregando legendas...';
        } else if (msg.status === 'cues' && Array.isArray(msg.cues)) {
          playerState.ccWorkerReady = true;
          playerCaptionsMeta?.classList.add('hidden');
          if (msg.cues.length > 0) {
            if (msg.seq !== undefined) {
              playerState.ccCues = playerState.ccCues.filter((c) => c.seq !== msg.seq);
            }
            for (const cue of msg.cues) {
              playerState.ccCues.push({ ...cue, seq: msg.seq });
            }
            playerState.ccCues.sort((a, b) => a.start - b.start);
            if (playerState.ccCues.length > 160) {
              playerState.ccCues.splice(0, playerState.ccCues.length - 160);
            }
          }
          clearCcPreRoll(true);
          renderActiveCaption();
        } else if (msg.status === 'error' && msg.text) {
          playerCaptionsMeta.textContent = 'CC • Aviso';
          playerCaptionsText.textContent = msg.text;
        }
      } catch (_) { }
    };

    es.onerror = () => {
      if (playerState.ccEnabled) {
        playerCaptionsMeta.textContent = 'CC • Reconectando...';
      }
    };

    const curT = Number(playerVideo.currentTime) || 0;
    for (const f of playerState.ccRecentFrags) {
      if (f.start + f.duration >= curT - 0.5) {
        enqueueFragCaption(f);
      }
    }
    maybeRequestVodCaptionWindow(curT);
    playerState.ccRenderTimer = setInterval(() => { if (!document.hidden) renderActiveCaption(); }, 250);
  }

  function syncCcButtons() {
    playerCcBtn.textContent = 'CC';
    playerCcBtn.classList.toggle('is-cc-on', playerState.ccEnabled);
    const langCfg = CC_LANGS[playerState.ccLangIdx] || CC_LANGS[0];
    playerCcLangBtn.textContent = `Idioma CC: ${langCfg.label}`;
  }

  let playerIdleTimer = null;
  function clearPlayerIdleTimer() {
    clearTimeout(playerIdleTimer);
    playerIdleTimer = null;
  }

  function schedulePlayerIdle(delayMs = 2000) {
    clearPlayerIdleTimer();
    if (cinemaPlayer.classList.contains('hidden')) return;
    if (playerMorePopover && !playerMorePopover.classList.contains('hidden')) return;
    playerIdleTimer = setTimeout(() => {
      if (!cinemaPlayer.classList.contains('hidden')) {
        cinemaPlayer.classList.add('is-idle');
      }
    }, delayMs);
  }

  function wakePlayerUi(delayMs = 2000) {
    if (cinemaPlayer.classList.contains('hidden')) return;
    cinemaPlayer.classList.remove('is-idle');
    schedulePlayerIdle(delayMs);
  }

  cinemaPlayer.addEventListener('pointermove', () => wakePlayerUi(2000), { passive: true });
  cinemaPlayer.addEventListener('pointerdown', () => wakePlayerUi(2400), { passive: true });
  cinemaPlayer.addEventListener('mouseleave', () => {
    if (playerMorePopover && !playerMorePopover.classList.contains('hidden')) return;
    schedulePlayerIdle(200);
  });
  playerVideo.addEventListener('click', () => {
    if (playerMorePopover && !playerMorePopover.classList.contains('hidden')) {
      playerMorePopover.classList.add('hidden');
      return;
    }
    playerToggleBtn.click();
    wakePlayerUi(2000);
  });

  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function setPlayerStatus(text, isLive = false) {
    if (!playerStatusPill) return;
    playerStatusPill.textContent = text;
    playerStatusPill.classList.toggle('live', Boolean(isLive));
  }

  let streamFallbackTimer = null;
  function destroyHls() {
    clearTimeout(streamFallbackTimer);
    streamFallbackTimer = null;
    clearCcPreRoll(false);
    playerVideo.onloadedmetadata = null;
    playerVideo.onerror = null;
    if (playerState.hls) {
      try { playerState.hls.destroy(); } catch (_) { }
      playerState.hls = null;
    }
    if (playerState.localObjectUrl) {
      try { URL.revokeObjectURL(playerState.localObjectUrl); } catch (_) { }
      playerState.localObjectUrl = null;
    }
  }

  let playerClockTimer = null;
  let lastPlayerNativeTime = 0;
  let lastPlayerNativeMoveTs = 0;
  let lastPlayerClockTickTs = 0;

  function syncPlayerUi() {
    if (playerTimelineRow) {
      playerTimelineRow.classList.toggle('hidden', playerState.isLive);
    }
    if (!playerState.isLive) {
      const nativeCur = Number.isFinite(playerVideo.currentTime) ? playerVideo.currentTime : 0;
      const cur = Math.max(nativeCur, playerState.seconds || 0);
      const dur = Number.isFinite(playerVideo.duration) && playerVideo.duration > 0
        ? playerVideo.duration
        : (playerState.total > 0 ? playerState.total : Math.max(120, cur + 30));
      playerCurTime.textContent = fmtTime(cur);
      playerTotTime.textContent = fmtTime(dur);
      playerFill.style.width = `${Math.min(100, (cur / dur) * 100).toFixed(2)}%`;
    }
    const isPlaying = (!playerVideo.paused && !playerVideo.ended) || playerState.playing;
    playerToggleBtn.innerHTML = isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    playerMuteBtn.innerHTML = playerVideo.muted || playerVideo.volume === 0 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  }

  function startPlayerClockWatchdog() {
    clearInterval(playerClockTimer);
    lastPlayerNativeTime = Number.isFinite(playerVideo.currentTime) ? playerVideo.currentTime : 0;
    lastPlayerNativeMoveTs = performance.now();
    lastPlayerClockTickTs = performance.now();
    playerClockTimer = setInterval(() => {
      if (cinemaPlayer.classList.contains('hidden')) {
        clearInterval(playerClockTimer);
        playerClockTimer = null;
        return;
      }
      if (!playerState.playing) return;
      const now = performance.now();
      const dt = Math.max(0, Math.min(1.0, (now - (lastPlayerClockTickTs || now)) / 1000));
      lastPlayerClockTickTs = now;
      const nativeCur = Number.isFinite(playerVideo.currentTime) ? playerVideo.currentTime : 0;
      if (Math.abs(nativeCur - lastPlayerNativeTime) > 0.015) {
        lastPlayerNativeTime = nativeCur;
        lastPlayerNativeMoveTs = now;
        playerState.seconds = nativeCur;
      } else if (now - lastPlayerNativeMoveTs > 550) {
        if (!playerVideo.muted) {
          playerVideo.muted = true;
          playerVideo.play().catch(() => { });
        }
        if (!playerState.isLive) {
          playerState.seconds = (playerState.seconds || 0) + dt;
          try {
            if (playerVideo.readyState >= 1) playerVideo.currentTime = playerState.seconds;
          } catch (_) { }
        }
      }
      syncPlayerUi();
    }, 250);
  }

  function loadVideoStream(streamUrl, isLive = false) {
    destroyHls();
    playerState.ccRecentFrags = [];
    cinemaPlayer.classList.remove('is-playing-video');
    playerVideo.classList.add('hidden');
    playerVideo.pause();
    playerVideo.removeAttribute('src');
    playerVideo.load();
    playerQualityBtn.textContent = 'Qualidade: Auto';

    if (!streamUrl) {
      setPlayerStatus('Sem stream', false);
      return;
    }

    const isM3u8 = streamUrl.includes('.m3u8');
    const isWebOS = Boolean(window.IrisWebOS?.isWebOS || /Web0S|webOS/i.test(navigator.userAgent || ''));
    const canNativeHls = Boolean(
      playerVideo.canPlayType('application/vnd.apple.mpegurl') ||
      playerVideo.canPlayType('application/x-mpegURL') ||
      playerVideo.canPlayType('audio/mpegurl') ||
      isWebOS
    );
    const proxySrc = isM3u8
      ? (streamUrl.startsWith('/api/') ? streamUrl : `/api/stream-proxy/live.m3u8?url=${encodeURIComponent(streamUrl)}`)
      : streamUrl;
    setPlayerStatus(isLive ? '● SINTONIZANDO...' : 'Carregando vídeo...', isLive);

    const onReadyPlay = (engineLabel = '') => {
      playerVideo.classList.remove('hidden');
      cinemaPlayer.classList.add('is-playing-video');
      playerVideo.volume = Math.max(0, Math.min(1, Number(playerVolRange.value) / 100));
      const startPlayNow = () => {
        playerVideo.play().then(() => {
          setPlayerStatus(isLive ? '● AO VIVO' : '▶ Reproduzindo', isLive);
          syncPlayerUi();
        }).catch(() => {
          playerVideo.muted = true;
          playerVideo.play().then(() => {
            setPlayerStatus(isLive ? '● AO VIVO (Mudo)' : '▶ Reproduzindo (Mudo)', isLive);
            syncPlayerUi();
          }).catch(() => { });
        });
      };

      // Pre-roll up to 2.6s when CC is active on HLS so initial batch aligns at t=0
      if (engineLabel === 'HLS' && playerState.ccEnabled && !playerState.ccCues.length) {
        clearCcPreRoll(false);
        playerState.ccPreRollStartFn = startPlayNow;
        setPlayerStatus(isLive ? '● AO VIVO' : '▶ Preparando legendas...', isLive);
        playerState.ccPreRollTimer = setTimeout(() => clearCcPreRoll(true), 2600);
        return;
      }
      startPlayNow();
    };

    const startHlsJs = () => {
      if (!window.Hls || !window.Hls.isSupported()) {
        setPlayerStatus('Stream incompatível', false);
        return;
      }
      const isTv = Boolean(window.IrisWebOS?.isWebOS);
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxBufferLength: isTv ? 15 : 45,
        maxMaxBufferLength: isTv ? 25 : 75,
        maxBufferSize: isTv ? (8 * 1024 * 1024) : (60 * 1024 * 1024),
        backBufferLength: isTv ? 2 : 12,
        manifestLoadingTimeOut: 12000,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        nudgeMaxRetry: 8,
        nudgeOffset: 0.1
      });
      playerState.hls = hls;
      let usesDemuxedAudio = false;
      hls.loadSource(proxySrc);
      hls.attachMedia(playerVideo);
      hls.on(window.Hls.Events.MANIFEST_PARSED, (_e, data) => {
        usesDemuxedAudio = (hls.audioTracks || []).some((t) => Boolean(t.url));
        const levels = data?.levels || [];
        if (levels.length > 0) {
          const best = levels[levels.length - 1];
          playerQualityBtn.textContent = `Qualidade: Auto (${best.height || 720}p)`;
        }
        onReadyPlay('HLS');
      });
      hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        usesDemuxedAudio = (hls.audioTracks || []).some((t) => Boolean(t.url));
      });
      hls.on(window.Hls.Events.FRAG_BUFFERED, (_e, data) => {
        const frag = data?.frag;
        if (!frag || !frag.url || frag.sn === 'initSegment') return;
        if (frag.type === 'audio') usesDemuxedAudio = true;
        const shouldCapture = usesDemuxedAudio ? frag.type === 'audio' : frag.type === 'main';
        if (!shouldCapture) return;

        const info = {
          sn: frag.sn,
          type: frag.type,
          url: frag.url,
          start: Number(frag.start || 0),
          duration: Number(frag.duration || 0)
        };
        playerState.ccRecentFrags.push(info);
        if (playerState.ccRecentFrags.length > 6) playerState.ccRecentFrags.shift();
        if (playerState.ccEnabled) enqueueFragCaption(info);
      });
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data && data.fatal) {
          setPlayerStatus('Stream indisponível • Tente outro canal', false);
        }
      });
    };

    // Use Hls.js when CC is enabled on HLS so fragments align identically with playerVideo.currentTime
    const forceHlsForCc = Boolean(isM3u8 && playerState.ccEnabled && window.Hls && window.Hls.isSupported());

    // Priority 1: Native Apple AVFoundation / VideoToolbox GPU HLS when CC is off
    if (!forceHlsForCc && (!isM3u8 || canNativeHls)) {
      let fellBack = false;
      const triggerFallback = () => {
        clearTimeout(streamFallbackTimer);
        if (isM3u8 && !fellBack && window.Hls && window.Hls.isSupported()) {
          fellBack = true;
          startHlsJs();
        } else {
          setPlayerStatus('Erro ao carregar stream', false);
        }
      };
      playerVideo.preload = 'auto';
      playerVideo.src = isM3u8 ? proxySrc : streamUrl;
      playerVideo.onloadedmetadata = () => {
        clearTimeout(streamFallbackTimer);
        if (playerVideo.videoWidth === 0 && isM3u8) {
          triggerFallback();
        } else {
          onReadyPlay('AV');
        }
      };
      playerVideo.onerror = triggerFallback;
      if (isM3u8) {
        streamFallbackTimer = setTimeout(() => {
          if (playerVideo.videoWidth === 0 && !fellBack) triggerFallback();
        }, 4000);
      }
      return;
    }

    // Priority 2: MSE Hls.js via Keep-Alive proxy (and synced CC fragment pipeline)
    startHlsJs();
  }

  let chOsdTimer = null;
  let chDigitBuffer = '';
  let chDigitTimer = null;

  function showChannelOsd(numText, nameText = '') {
    if (!playerChOsd) return;
    clearTimeout(chOsdTimer);
    playerChOsd.innerHTML = `
      <div class="player-ch-osd-num">CH ${escHtml(numText)}</div>
      ${nameText ? `<div class="player-ch-osd-name">${escHtml(nameText)}</div>` : ''}
    `;
    playerChOsd.classList.remove('hidden');
    chOsdTimer = setTimeout(() => {
      playerChOsd.classList.add('hidden');
    }, 2400);
  }

  function tuneLiveChannel(ch) {
    if (!ch) return;
    openCinemaPlayer({
      title: `${ch.num} • ${ch.name}`,
      sub: ch.program,
      appName: 'TV AO VIVO',
      bgImg: ch.iconSrc,
      streamUrl: ch.streamUrl,
      isLive: true,
      liveNum: ch.num,
      ccLang: ch.ccLang
    });
    showChannelOsd(ch.num, ch.name);
  }

  function tuneChannelByOffset(delta) {
    if (!LIVE_CHANNELS.length) return;
    const available = LIVE_CHANNELS.filter((c) => !state.offlineChannels.has(c.streamUrl));
    const list = available.length ? available : LIVE_CHANNELS;
    const curIdx = list.findIndex((c) => c.num === String(playerState.activeLiveNum || ''));
    const nextIdx = curIdx === -1
      ? 0
      : (curIdx + delta + list.length) % list.length;
    tuneLiveChannel(list[nextIdx]);
  }

  function commitChannelDigits() {
    clearTimeout(chDigitTimer);
    const numStr = String(Number(chDigitBuffer) || chDigitBuffer).trim();
    chDigitBuffer = '';
    if (!numStr) return;
    const match = LIVE_CHANNELS.find((c) => String(c.num) === numStr || String(Number(c.num)) === numStr);
    if (match) {
      tuneLiveChannel(match);
    } else {
      showChannelOsd(numStr, 'Canal não encontrado');
      playUiSound('back');
    }
  }

  function handleChannelDigitKey(digit) {
    clearTimeout(chDigitTimer);
    chDigitBuffer = (chDigitBuffer + digit).slice(0, 4);
    showChannelOsd(chDigitBuffer, 'Sintonizando...');
    playUiSound('move');
    chDigitTimer = setTimeout(commitChannelDigits, 950);
  }

  const m3uOverlay = document.getElementById('m3u-overlay');
  const m3uUrlInput = document.getElementById('m3u-url-input');
  const m3uImportUrlBtn = document.getElementById('m3u-import-url-btn');
  const m3uFileBtn = document.getElementById('m3u-file-btn');
  const m3uFileInput = document.getElementById('m3u-file-input');
  const m3uResetBtn = document.getElementById('m3u-reset-btn');
  const closeM3uBtn = document.getElementById('close-m3u-btn');
  const m3uStatusMsg = document.getElementById('m3u-status-msg');

  function applyCustomM3uChannels(channels, label) {
    LIVE_CHANNELS = channels;
    try { localStorage.setItem('iristv-custom-m3u-v9', JSON.stringify(channels)); } catch (_) { }
    if (m3uStatusMsg) m3uStatusMsg.textContent = `${channels.length} canais carregados (${label})`;
    renderTab(state.activeTab);
    showToast(`${channels.length} canais carregados na TV ao Vivo`);
  }

  function openM3uModal() {
    playUiSound('select');
    if (m3uStatusMsg) m3uStatusMsg.textContent = `${LIVE_CHANNELS.length} canais ativos agora.`;
    m3uOverlay?.classList.remove('hidden');
    setTimeout(() => m3uUrlInput?.focus(), 40);
  }

  function closeM3uModal() {
    if (!m3uOverlay || m3uOverlay.classList.contains('hidden')) return;
    playUiSound('back');
    m3uOverlay.classList.add('hidden');
  }

  closeM3uBtn?.addEventListener('click', closeM3uModal);
  m3uOverlay?.addEventListener('click', (e) => { if (e.target === m3uOverlay) closeM3uModal(); });
  m3uFileBtn?.addEventListener('click', () => { playUiSound('select'); m3uFileInput?.click(); });
  m3uFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseM3uPlaylist(text);
    if (!parsed.length) {
      if (m3uStatusMsg) m3uStatusMsg.textContent = 'Nenhum canal válido encontrado nesse arquivo M3U.';
      return;
    }
    applyCustomM3uChannels(parsed, file.name);
    e.target.value = '';
  });
  m3uImportUrlBtn?.addEventListener('click', async () => {
    const url = (m3uUrlInput?.value || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      if (m3uStatusMsg) m3uStatusMsg.textContent = 'Digite uma URL http:// ou https:// válida.';
      return;
    }
    if (m3uStatusMsg) m3uStatusMsg.textContent = 'Baixando lista M3U...';
    try {
      const r = await fetch('/api/m3u/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Erro ao baixar lista');
      const parsed = parseM3uPlaylist(data.content || '');
      if (!parsed.length) throw new Error('Nenhum canal #EXTINF encontrado na URL');
      applyCustomM3uChannels(parsed, 'URL M3U');
    } catch (err) {
      if (m3uStatusMsg) m3uStatusMsg.textContent = `Erro: ${err.message}`;
    }
  });
  m3uResetBtn?.addEventListener('click', () => {
    playUiSound('back');
    try { localStorage.removeItem('iristv-custom-m3u-v9'); } catch (_) { }
    LIVE_CHANNELS = DEFAULT_LIVE_CHANNELS;
    if (m3uStatusMsg) m3uStatusMsg.textContent = `Canais padrão restaurados (${LIVE_CHANNELS.length})`;
    renderTab(state.activeTab);
    showToast('Canais padrão restaurados');
  });

  const dvrState = { activeId: null, startedAt: 0, timer: null, channelNum: null };

  function formatRecElapsed(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function syncRecButton() {
    if (!playerRecBtn) return;
    if (dvrState.activeId) {
      playerRecBtn.textContent = `Gravando ${formatRecElapsed(Date.now() - dvrState.startedAt)}`;
      playerRecBtn.style.background = 'rgba(239, 68, 68, 0.85)';
      playerRecBtn.style.color = '#fff';
      playerRecBtn.style.borderColor = 'rgba(255, 120, 120, 0.9)';
    } else {
      playerRecBtn.textContent = 'Gravar';
      playerRecBtn.style.background = '';
      playerRecBtn.style.color = '';
      playerRecBtn.style.borderColor = '';
    }
  }

  async function startDvrRecording(ch) {
    if (!ch || !ch.streamUrl) {
      showToast('Este canal não tem transmissão ao vivo gravável.');
      return;
    }
    if (dvrState.activeId) await stopDvrRecording(true);
    try {
      const sched = getChannelSchedule(ch);
      const res = await fetch('/api/dvr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamUrl: ch.streamUrl,
          channelNum: ch.num,
          channelName: ch.name,
          program: sched[0]?.title || ch.program || ch.name
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha ao gravar');
      dvrState.activeId = data.id;
      dvrState.startedAt = data.startedAt || Date.now();
      dvrState.channelNum = ch.num;
      clearInterval(dvrState.timer);
      dvrState.timer = setInterval(syncRecButton, 1000);
      syncRecButton();
      showToast(`Gravando ${ch.name}…`);
    } catch (err) {
      showToast(`Erro ao gravar: ${err.message}`);
    }
  }

  async function stopDvrRecording(silent = false) {
    if (!dvrState.activeId) return;
    const id = dvrState.activeId;
    clearInterval(dvrState.timer);
    dvrState.timer = null;
    dvrState.activeId = null;
    dvrState.channelNum = null;
    syncRecButton();
    try {
      const res = await fetch('/api/dvr/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!silent && data.ok) showToast('Gravação salva em Programação & Gravações!');
    } catch (_) { }
  }

  function getChannelSchedule(ch) {
    const now = new Date();
    const h = now.getHours();
    const pad = (x) => `${String((x + 24) % 24).padStart(2, '0')}:00`;
    const isNews = /news|cnn|uol|record|sbt/i.test(`${ch.name} ${ch.program}`);
    const isSports = /espn|fifa|sport|band/i.test(`${ch.name} ${ch.program}`);
    const isMovies = /cine|pluto|film/i.test(`${ch.name} ${ch.program}`);
    const curTitle = (ch.program || `${ch.name} • Ao Vivo`).split('•')[0].trim();
    const nextTitle = ch.next && ch.next !== 'Ao Vivo'
      ? ch.next
      : isNews ? 'Edição da Hora • Jornalismo'
        : isSports ? 'Mesa Redonda & Melhores Momentos'
          : isMovies ? 'Sessão Especial de Cinema'
            : `${ch.name} • Programação Seguinte`;
    const laterTitle = isNews ? 'Análise & Mundo'
      : isSports ? 'Compacto da Rodada'
        : isMovies ? 'Madrugada de Ação'
          : `${ch.name} • Especiais`;
    const pct = Math.round((now.getMinutes() / 60) * 100);
    return [
      { slot: `${pad(h)} – ${pad(h + 1)}`, title: curTitle, live: true, pct },
      { slot: `${pad(h + 1)} – ${pad(h + 2)}`, title: nextTitle, live: false },
      { slot: `${pad(h + 2)} – ${pad(h + 3)}`, title: laterTitle, live: false }
    ];
  }

  async function openGuideModal(initialTab = 'guide') {
    playUiSound('open');
    appStageOverlay.classList.remove('hidden');
    appStageWindow.classList.remove('is-details-mode', 'is-store-mode');
    appStageWindow.classList.add('is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', 'rgba(56, 189, 248, 0.45)');
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="logo.svg" alt="irisTV" /></div>
      <div class="app-stage-brand-title">Programação dos Canais &amp; Gravações</div>
    `;
    let activeTab = initialTab;
    let selectedChNum = LIVE_CHANNELS[0]?.num || '1';
    let selectedDayIdx = 0;
    let openScheduleKey = null;
    const epgCacheClient = new Map();

    const getEpgForChannel = async (chName) => {
      if (epgCacheClient.has(chName)) return epgCacheClient.get(chName);
      const ch = LIVE_CHANNELS.find((c) => c.name === chName) || { name: chName };
      const fallback = getChannelSchedule(ch);
      const fallbackDays = [
        { label: 'Hoje', isoDate: '', items: fallback.map((x) => ({ time: x.slot.split('–')[0].trim(), endTime: x.slot.split('–')[1]?.trim() || '', title: x.title, category: 'Ao Vivo', startTs: Date.now(), endTs: Date.now() + 3600000 })) },
        { label: 'Amanhã', isoDate: '', items: fallback.map((x) => ({ time: x.slot.split('–')[0].trim(), endTime: x.slot.split('–')[1]?.trim() || '', title: x.title, category: 'Ao Vivo', startTs: Date.now() + 86400000, endTs: Date.now() + 90000000 })) }
      ];
      // Salva fallback imediatamente no cache local para render instantâneo sem lag
      epgCacheClient.set(chName, fallbackDays);
      // Busca atualização real em segundo plano com timeout de segurança de 2s
      fetch(`/api/epg?channel=${encodeURIComponent(chName)}&days=5`, { signal: AbortSignal.timeout(2200) })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok && Array.isArray(j.days) && j.days.length) {
            epgCacheClient.set(chName, j.days);
          }
        })
        .catch(() => { });
      return fallbackDays;
    };

    const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const renderBody = async () => {
      let dvrData = { active: [], recordings: [] };
      let schedulesList = [];
      try {
        const [r1, r2] = await Promise.all([
          fetch('/api/dvr/list', { signal: AbortSignal.timeout(1800) }),
          fetch('/api/dvr/schedules', { signal: AbortSignal.timeout(1800) })
        ]);
        const j1 = await r1.json();
        const j2 = await r2.json();
        if (j1.ok) dvrData = j1;
        if (j2.ok) schedulesList = j2.schedules || [];
      } catch (_) { }

      const tabBar = `
        <div class="category-filter-bar" style="margin-bottom:18px;display:flex;flex-wrap:wrap;gap:8px;">
          <button class="cat-chip ${activeTab === 'guide' ? 'active' : ''}" data-gtab="guide">Programação (5 dias)</button>
          <button class="cat-chip ${activeTab === 'schedules' ? 'active' : ''}" data-gtab="schedules">Agendamentos (${schedulesList.length})</button>
          <button class="cat-chip ${activeTab === 'dvr' ? 'active' : ''}" data-gtab="dvr">Gravações Salvas (${dvrData.recordings.length})</button>
        </div>
      `;

      if (activeTab === 'guide') {
        // Carregamento instantâneo via cache síncrono dos canais
        const allDaysList = await Promise.all(LIVE_CHANNELS.map((c) => getEpgForChannel(c.name)));
        const refDays = allDaysList.find((d) => d && d.length) || [];
        if (selectedDayIdx >= refDays.length) selectedDayIdx = 0;

        const dayPills = `
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
            ${refDays.map((d, idx) => `
              <button class="cat-chip ${idx === selectedDayIdx ? 'active' : ''}" data-gday="${idx}">
                ${idx === 0 ? 'Hoje' : idx === 1 ? 'Amanhã' : escHtml(d.label)}
              </button>
            `).join('')}
          </div>
        `;

        // Interface limpa e intuitiva em estilo Guia de TV em Grade / Lista Simplificada
        const curCh = LIVE_CHANNELS.find((c) => String(c.num) === String(selectedChNum)) || LIVE_CHANNELS[0];
        const curChIdx = LIVE_CHANNELS.findIndex((c) => c.num === curCh.num);
        const curChDays = allDaysList[curChIdx >= 0 ? curChIdx : 0] || [];
        const curDayData = curChDays[selectedDayIdx] || { items: [] };

        const guideLayoutHtml = `
          <div style="display:grid;grid-template-columns:260px 1fr;gap:18px;max-height:64vh;">
            <!-- Coluna de Canais -->
            <div style="background:rgba(12,16,26,0.95);border-radius:14px;border:1px solid rgba(255,255,255,0.1);overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;">
              ${LIVE_CHANNELS.map((ch) => `
                <button type="button" class="btn-glass ${ch.num === curCh.num ? 'active' : ''}" data-sel-chnum="${escHtml(ch.num)}" style="text-align:left;padding:10px 14px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;width:100%;${ch.num === curCh.num ? 'background:rgba(56,189,248,0.22);border-color:#38bdf8;' : ''}">
                  <div style="min-width:0;">
                    <div style="font-size:0.7rem;color:rgba(255,255,255,0.5);">Canal ${escHtml(ch.num)}</div>
                    <strong style="font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${escHtml(ch.name)}</strong>
                  </div>
                  <span style="font-size:0.8rem;opacity:0.8;">▶</span>
                </button>
              `).join('')}
            </div>

            <!-- Coluna de Horários e Programas do Canal Selecionado -->
            <div style="background:rgba(8,11,18,0.9);border-radius:14px;border:1px solid rgba(255,255,255,0.1);padding:16px;display:flex;flex-direction:column;overflow-y:auto;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div>
                  <h3 style="margin:0;font-size:1.15rem;color:#f3f5f9;">Canal ${escHtml(curCh.num)} — ${escHtml(curCh.name)}</h3>
                  <small style="color:rgba(255,255,255,0.55);">${escHtml(curCh.meta || 'Ao Vivo')}</small>
                </div>
                <button class="btn-prism" type="button" data-gplay="${escHtml(curCh.num)}" style="height:34px;padding:0 16px;">▶ Assistir ao Vivo</button>
              </div>

              <div style="display:flex;flex-direction:column;gap:8px;">
                ${(curDayData.items || []).length ? curDayData.items.map((it, idx) => {
          const nowTs = Date.now();
          const isLiveNow = it.startTs && it.endTs && nowTs >= it.startTs && nowTs < it.endTs;
          const key = `${curCh.num}|${selectedDayIdx}|${idx}`;
          const isSel = openScheduleKey === key;
          return `
                    <div style="padding:12px 16px;border-radius:10px;background:${isLiveNow ? 'rgba(56,189,248,0.18)' : isSel ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isLiveNow ? '#38bdf8' : isSel ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'};display:flex;align-items:center;justify-content:space-between;gap:12px;">
                      <div style="min-width:0;flex:1;">
                        <div style="font-size:0.75rem;font-weight:700;color:${isLiveNow ? '#38bdf8' : 'rgba(255,255,255,0.6)'};margin-bottom:3px;">
                          ${isLiveNow ? '● TRANSMITINDO AGORA • ' : ''}${escHtml(it.time)}${it.endTime ? ' às ' + escHtml(it.endTime) : ''}
                        </div>
                        <strong style="font-size:0.95rem;color:#fff;display:block;">${escHtml(it.title)}</strong>
                        ${it.category ? `<span style="font-size:0.72rem;color:rgba(255,255,255,0.45);">${escHtml(it.category)}</span>` : ''}
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        ${isLiveNow ? `<button class="btn-prism" type="button" data-gplay="${escHtml(curCh.num)}" style="height:32px;padding:0 12px;font-size:0.78rem;">Assistir</button>` : ''}
                        <button class="btn-glass" type="button" data-sch-now="${escHtml(key)}" style="height:32px;padding:0 12px;font-size:0.78rem;">Gravar</button>
                      </div>
                    </div>
                  `;
        }).join('') : `
                  <div style="padding:32px;text-align:center;color:rgba(255,255,255,0.5);">Programação contínua • Sinal Ao Vivo</div>
                `}
              </div>
            </div>
          </div>
        `;

        appStageBody.innerHTML = tabBar + dayPills + guideLayoutHtml;

        appStageBody.querySelectorAll('[data-gday]').forEach((b) => {
          b.addEventListener('click', () => { selectedDayIdx = Number(b.dataset.gday); renderBody(); });
        });
        appStageBody.querySelectorAll('[data-sel-chnum]').forEach((b) => {
          b.addEventListener('click', () => { selectedChNum = b.dataset.selChnum; renderBody(); });
        });
        appStageBody.querySelectorAll('[data-sch-now]').forEach((b) => {
          b.addEventListener('click', async () => {
            const [chNum] = b.dataset.schNow.split('|');
            const chObj = LIVE_CHANNELS.find((c) => String(c.num) === String(chNum));
            if (chObj) await startDvrRecording(chObj);
            openScheduleKey = null;
            renderBody();
          });
        });
        appStageBody.querySelectorAll('[data-sch-mode]').forEach((b) => {
          b.addEventListener('click', async () => {
            const [chNum, dIdxStr, idxStr] = b.dataset.schKey.split('|');
            const cIdx = LIVE_CHANNELS.findIndex((c) => String(c.num) === String(chNum));
            const chObj = LIVE_CHANNELS[cIdx];
            const prog = (allDaysList[cIdx]?.[Number(dIdxStr)]?.items || [])[Number(idxStr)];
            if (!prog || !chObj?.streamUrl) return;
            const mode = b.dataset.schMode;
            const daysPicked = mode === 'weekdays'
              ? [...b.parentElement.querySelectorAll('.sch-dow-cb:checked')].map((x) => Number(x.value))
              : [];
            if (mode === 'weekdays' && !daysPicked.length) {
              showToast('Marque pelo menos um dia da semana.');
              return;
            }
            const durMin = prog.startTs && prog.endTs ? Math.max(10, Math.round((prog.endTs - prog.startTs) / 60000)) : 60;
            await fetch('/api/dvr/schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode,
                channelNum: chObj.num,
                channelName: chObj.name,
                program: prog.title,
                streamUrl: chObj.streamUrl,
                time: prog.time,
                startTs: prog.startTs || 0,
                durationMin: durMin,
                days: daysPicked
              })
            });
            showToast(`Agendado: ${prog.title}`);
            openScheduleKey = null;
            renderBody();
          });
        });
      } else if (activeTab === 'schedules') {
        const schHtml = schedulesList.length ? schedulesList.map((s) => {
          const ruleLabel = s.mode === 'daily'
            ? `Todos os dias às ${s.time}`
            : s.mode === 'weekdays'
              ? `${(s.days || []).map((d) => DAY_NAMES[d]).join(', ')} às ${s.time}`
              : `Programa único às ${s.time}`;
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);margin-bottom:10px;">
              <div>
                <strong>${escHtml(s.program)}</strong>
                <div style="font-size:0.82rem;color:rgba(255,255,255,0.65);">${escHtml(s.channelName)} • ${escHtml(ruleLabel)} (${s.durationMin} min)</div>
              </div>
              <button class="btn-glass" type="button" data-sch-del="${escHtml(s.id)}" style="height:34px;padding:0 12px;font-size:0.82rem;"> Cancelar</button>
            </div>
          `;
        }).join('') : '<div style="padding:32px;text-align:center;color:rgba(255,255,255,0.55);">Nenhum agendamento ainda. Escolha qualquer programa na aba Programação e clique em Gravar / Agendar.</div>';
        appStageBody.innerHTML = tabBar + schHtml;
        appStageBody.querySelectorAll('[data-sch-del]').forEach((b) => {
          b.addEventListener('click', async () => {
            await fetch('/api/dvr/schedule/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: b.dataset.schDel })
            });
            showToast('Agendamento cancelado');
            renderBody();
          });
        });
      } else {
        const activeHtml = dvrData.active.map((a) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:14px;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.4);margin-bottom:12px;">
            <div>
              <strong style="color:#fca5a5;">● Gravando agora: ${escHtml(a.channelName)}</strong>
              <div style="font-size:0.85rem;color:rgba(255,255,255,0.75);">${escHtml(a.program)}</div>
            </div>
            <button class="btn-glass" type="button" data-dvr-stop="1" style="height:36px;padding:0 14px;">Parar gravação</button>
          </div>
        `).join('');

        const savedHtml = dvrData.recordings.length ? dvrData.recordings.map((r) => {
          const mb = (r.size / (1024 * 1024)).toFixed(1);
          const dt = new Date(r.startedAt).toLocaleString('pt-BR');
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);margin-bottom:10px;">
              <div>
                <strong>${escHtml(r.program)}</strong>
                <div style="font-size:0.82rem;color:rgba(255,255,255,0.6);">${escHtml(r.channelName)} • ${dt} • ${mb} MB</div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn-prism" type="button" data-dvr-play="${escHtml(r.url)}" data-dvr-title="${escHtml(r.program)}" data-dvr-sub="${escHtml(r.channelName)}" style="height:36px;padding:0 14px;font-size:0.84rem;">▶ Assistir</button>
                <button class="btn-glass" type="button" data-dvr-del="${escHtml(r.fileName)}" style="height:36px;padding:0 12px;font-size:0.84rem;"> Excluir</button>
              </div>
            </div>
          `;
        }).join('') : '<div style="padding:32px;text-align:center;color:rgba(255,255,255,0.55);">Nenhuma gravação salva ainda. Clique em  Gravar em qualquer canal ao vivo.</div>';

        appStageBody.innerHTML = tabBar + activeHtml + savedHtml;
      }

      appStageBody.querySelectorAll('[data-gtab]').forEach((b) => {
        b.addEventListener('click', () => { activeTab = b.dataset.gtab; renderBody(); });
      });
      appStageBody.querySelectorAll('[data-gplay]').forEach((b) => {
        b.addEventListener('click', () => {
          const ch = LIVE_CHANNELS.find((c) => String(c.num) === b.dataset.gplay);
          if (ch) { closeAppStage(); tuneLiveChannel(ch); }
        });
      });
      appStageBody.querySelectorAll('[data-dvr-stop]').forEach((b) => {
        b.addEventListener('click', async () => { await stopDvrRecording(); renderBody(); });
      });
      appStageBody.querySelectorAll('[data-dvr-play]').forEach((b) => {
        b.addEventListener('click', () => {
          closeAppStage();
          openCinemaPlayer({
            title: b.dataset.dvrTitle,
            sub: `Gravação • ${b.dataset.dvrSub}`,
            appName: 'Gravações',
            streamUrl: b.dataset.dvrPlay,
            isLive: false
          });
        });
      });
      appStageBody.querySelectorAll('[data-dvr-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          await fetch('/api/dvr/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: b.dataset.dvrDel })
          });
          showToast('Gravação excluída');
          renderBody();
        });
      });
    };

    await renderBody();
    appStageOverlay.classList.remove('hidden');
  }

  function openMyChannelsFullscreen() {
    playUiSound('open');
    appStageWindow.classList.remove('is-details-mode', 'is-store-mode');
    appStageWindow.classList.add('is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', 'rgba(168, 85, 247, 0.42)');
    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="logo.svg" alt="irisTV" /></div>
      <div class="app-stage-brand-title">Meus Canais &amp; Listas M3U</div>
    `;

    const renderChannelsBody = () => {
      appStageBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:18px;margin-bottom:22px;">
          <div style="padding:20px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);">
            <h3 style="margin-bottom:8px;font-size:1.08rem;">O que é uma lista M3U?</h3>
            <p style="font-size:0.9rem;color:rgba(255,255,255,0.75);line-height:1.55;margin-bottom:12px;">
              Uma lista <strong>M3U</strong> é só um arquivo ou um link da internet que guarda vários canais de TV juntos — como uma agenda de canais. Você não precisa configurar nada complicado: é só colar o link ou escolher o arquivo que os canais aparecem prontos aqui.
            </p>
            <h4 style="margin-bottom:6px;font-size:0.94rem;">Como conseguir links gratuitos de canais?</h4>
            <ol style="padding-left:18px;font-size:0.86rem;color:rgba(255,255,255,0.72);line-height:1.65;">
              <li>Procure por listas abertas e gratuitas de TV (como o projeto público <strong>iptv-org Brasil</strong> no GitHub ou links de canais abertos).</li>
              <li>Copie o link que termina em <code>.m3u</code> ou <code>.m3u8</code>, ou baixe o arquivo para o seu computador.</li>
              <li>Cole ao lado ou clique em <strong>Escolher arquivo M3U</strong> para carregar todos os canais na hora.</li>
            </ol>
          </div>

          <div style="padding:20px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
            <div>
              <h3 style="margin-bottom:10px;font-size:1.08rem;">Adicionar sua lista</h3>
              <label style="display:block;font-size:0.82rem;color:rgba(255,255,255,0.65);margin-bottom:6px;">Colar link da lista M3U:</label>
              <div style="display:flex;gap:8px;margin-bottom:12px;">
                <input id="mc-url-input" type="url" placeholder="https://exemplo.com/canais.m3u" style="flex:1;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.35);color:#fff;padding:0 12px;font-size:0.88rem;" />
                <button id="mc-load-url-btn" class="btn-prism" type="button" style="height:40px;padding:0 16px;">Carregar</button>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="mc-file-btn" class="btn-glass" type="button" style="height:38px;padding:0 14px;">Escolher arquivo .m3u</button>
                <button id="mc-reset-btn" class="btn-glass" type="button" style="height:38px;padding:0 14px;">↺ Restaurar canais padrão</button>
                <input id="mc-file-input" type="file" accept=".m3u,.m3u8,text/plain" class="hidden" />
              </div>
            </div>
            <div id="mc-status" style="font-size:0.84rem;color:#38bdf8;">${LIVE_CHANNELS.length} canais ativos agora</div>
          </div>
        </div>

        <h3 style="margin-bottom:12px;font-size:1.05rem;">Canais disponíveis (${LIVE_CHANNELS.length})</h3>
        <div class="stage-cards-grid">
          ${LIVE_CHANNELS.map((c) => `
            <div class="stage-mini-card" data-mc-play="${escHtml(c.num)}">
              <strong>▶ ${escHtml(c.num)} • ${escHtml(c.name)}</strong>
              <span>${escHtml(c.program || 'Ao Vivo')}</span>
            </div>
          `).join('')}
        </div>
      `;

      const statusEl = appStageBody.querySelector('#mc-status');
      appStageBody.querySelector('#mc-file-btn')?.addEventListener('click', () => appStageBody.querySelector('#mc-file-input')?.click());
      appStageBody.querySelector('#mc-file-input')?.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const parsed = parseM3uPlaylist(await f.text());
        if (!parsed.length) { statusEl.textContent = 'Nenhum canal válido encontrado nesse arquivo.'; return; }
        applyCustomM3uChannels(parsed, f.name);
        renderChannelsBody();
      });
      appStageBody.querySelector('#mc-load-url-btn')?.addEventListener('click', async () => {
        const url = (appStageBody.querySelector('#mc-url-input')?.value || '').trim();
        if (!/^https?:\/\//i.test(url)) { statusEl.textContent = 'Cole um link válido começando com http:// ou https://'; return; }
        statusEl.textContent = 'Baixando lista de canais…';
        try {
          const r = await fetch('/api/m3u/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
          const d = await r.json();
          if (!r.ok || !d.ok) throw new Error(d.error || 'Falha ao carregar');
          const parsed = parseM3uPlaylist(d.content || '');
          if (!parsed.length) throw new Error('Nenhum canal encontrado nesse link');
          applyCustomM3uChannels(parsed, 'Link M3U');
          renderChannelsBody();
        } catch (err) {
          statusEl.textContent = `Erro: ${err.message}`;
        }
      });
      appStageBody.querySelector('#mc-reset-btn')?.addEventListener('click', () => {
        try { localStorage.removeItem('iristv-custom-m3u-v9'); } catch (_) { }
        LIVE_CHANNELS = DEFAULT_LIVE_CHANNELS;
        renderTab(state.activeTab);
        showToast('Canais padrão restaurados');
        renderChannelsBody();
      });
      appStageBody.querySelectorAll('[data-mc-play]').forEach((card) => {
        card.addEventListener('click', () => {
          const ch = LIVE_CHANNELS.find((c) => String(c.num) === card.dataset.mcPlay);
          if (ch) { closeAppStage(); tuneLiveChannel(ch); }
        });
      });
    };

    renderChannelsBody();
    appStageOverlay.classList.remove('hidden');
  }

  const navMoreWrap = document.getElementById('nav-more-wrap');
  const navMoreBtn = document.getElementById('nav-more-btn');
  navMoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    navMoreWrap?.classList.toggle('is-open');
  });
  document.addEventListener('click', (e) => {
    if (navMoreWrap && !navMoreWrap.contains(e.target)) navMoreWrap.classList.remove('is-open');
  });
  document.querySelectorAll('[data-more-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navMoreWrap?.classList.remove('is-open');
      const act = btn.dataset.moreAction;
      if (act === 'live') { playUiSound('select'); renderTab('live'); }
      else if (act === 'guide') openGuideModal('guide');
      else if (act === 'mychannels') openMyChannelsFullscreen();
      else if (act === 'settings') { playUiSound('select'); renderTab('settings'); }
      else if (act === 'lockscreen') { openScreensaver(); }
      else if (act === 'dev-onboarding') { playUiSound('select'); openOnboarding(true); }
    });
  });

  playerChPrevBtn?.addEventListener('click', () => { playUiSound('move'); tuneChannelByOffset(-1); });
  playerChNextBtn?.addEventListener('click', () => { playUiSound('move'); tuneChannelByOffset(1); });
  playerGuideBtn?.addEventListener('click', () => { closeCinemaPlayer(); openGuideModal('guide'); });
  playerRecBtn?.addEventListener('click', () => {
    if (dvrState.activeId) { stopDvrRecording(); return; }
    const ch = LIVE_CHANNELS.find((c) => String(c.num) === String(playerState.activeLiveNum || ''));
    if (ch) startDvrRecording(ch);
  });

  function renderZapBar(activeLiveNum) {
    if (!playerZapBar) return;
    playerZapBar.classList.add('hidden');
    if (playerChannelsBtn) {
      playerChannelsBtn.classList.toggle('hidden', !activeLiveNum);
      playerChannelsBtn.classList.remove('is-active');
    }
    playerChPrevBtn?.classList.toggle('hidden', !activeLiveNum);
    playerChNextBtn?.classList.toggle('hidden', !activeLiveNum);
    playerGuideBtn?.classList.toggle('hidden', !activeLiveNum);
    playerRecBtn?.classList.toggle('hidden', !activeLiveNum);
    syncRecButton();
    if (!activeLiveNum) {
      playerZapBar.innerHTML = '';
      return;
    }
    playerZapBar.innerHTML = LIVE_CHANNELS.map((c) => `
      <button class="player-zap-chip ${String(c.num) === String(activeLiveNum) ? 'active' : ''}" type="button" data-pzap="${escHtml(c.num)}">
        ${escHtml(c.num)} • ${escHtml(c.name)}
      </button>
    `).join('');
    playerZapBar.querySelectorAll('[data-pzap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextCh = LIVE_CHANNELS.find((c) => String(c.num) === btn.dataset.pzap);
        if (nextCh) tuneLiveChannel(nextCh);
      });
    });
  }

  function openCinemaPlayer({ title, sub, appName, bgImg, streamUrl, isLive = false, liveNum = null, ccLang = null, startProgress = 0 }) {
    playUiSound('open');
    const matchedCh = liveNum ? LIVE_CHANNELS.find((c) => String(c.num) === String(liveNum)) : null;
    playerState.isLive = Boolean(isLive);
    playerState.activeLiveNum = isLive ? (liveNum || matchedCh?.num || null) : null;
    playerState.currentStreamUrl = streamUrl || null;
    playerState.ccDefaultLang = ccLang || matchedCh?.ccLang || (isLive ? 'pt' : 'en');
    playerBgImg.src = bgImg || 'media/bg-severance.jpg';
    playerAppLabel.textContent = (appName || 'irisTV').toUpperCase();
    playerTitle.textContent = title || 'Reproduzindo';
    if (playerTitleInline) playerTitleInline.textContent = title || 'irisTV';
    playerSub.textContent = sub || 'Reproduzindo';
    playerState.playing = true;
    playerState.seconds = 0;
    playerState.total = 0;
    playerState.externalCues = [];
    playerState.audioIdx = Number(state.settings.defaultAudioTrack) || 0;
    playerAudioBtn.textContent = AUDIO_TRACKS[playerState.audioIdx] || AUDIO_TRACKS[0];
    playerMorePopover?.classList.add('hidden');

    renderZapBar(playerState.activeLiveNum);
    document.body.classList.add('player-active');
    cinemaPlayer.classList.remove('hidden', 'is-idle');
    loadVideoStream(streamUrl, isLive);
    startPlayerClockWatchdog();
    syncCcButtons();
    if (playerState.ccEnabled) startLiveCaptions();
    else stopLiveCaptions();
    if (!isLive && startProgress > 0) {
      playerVideo.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(playerVideo.duration) && playerVideo.duration > 0) {
          const targetT = (startProgress / 100) * playerVideo.duration;
          playerState.seconds = targetT;
          playerVideo.currentTime = targetT;
        }
      }, { once: true });
    }
    syncPlayerUi();
    schedulePlayerIdle(2200);
    setTimeout(() => ensureScopeFocus(playerToggleBtn), 30);
  }

  function closeCinemaPlayer() {
    if (cinemaPlayer.classList.contains('hidden')) return;
    playUiSound('back');
    clearPlayerIdleTimer();
    clearInterval(playerClockTimer);
    playerClockTimer = null;
    playerState.playing = false;
    stopLiveCaptions();
    playerVideo.pause();
    destroyHls();
    playerVideo.removeAttribute('src');
    try { playerVideo.load(); } catch (_) { }
    playerMorePopover?.classList.add('hidden');
    document.body.classList.remove('player-active');
    cinemaPlayer.classList.remove('is-playing-video', 'is-idle');
    cinemaPlayer.classList.add('hidden');
    setTimeout(() => ensureScopeFocus(), 20);
  }

  playerVideo.addEventListener('timeupdate', () => {
    const nativeCur = Number.isFinite(playerVideo.currentTime) ? playerVideo.currentTime : 0;
    if (Math.abs(nativeCur - lastPlayerNativeTime) > 0.01) {
      lastPlayerNativeTime = nativeCur;
      lastPlayerNativeMoveTs = performance.now();
      playerState.seconds = Math.max(playerState.seconds || 0, nativeCur);
    }
    syncPlayerUi();
    renderActiveCaption();
  });
  playerVideo.addEventListener('seeked', renderActiveCaption);
  playerVideo.addEventListener('play', () => {
    playerState.playing = true;
    lastPlayerClockTickTs = performance.now();
    syncPlayerUi();
  });
  playerVideo.addEventListener('pause', () => {
    if (!playerState.playing) syncPlayerUi();
  });

  document.getElementById('player-close-btn').addEventListener('click', closeCinemaPlayer);
  playerToggleBtn.addEventListener('click', () => {
    const isPlayingNow = (!playerVideo.paused && !playerVideo.ended) || playerState.playing;
    if (!isPlayingNow) {
      playerState.playing = true;
      lastPlayerClockTickTs = performance.now();
      lastPlayerNativeMoveTs = performance.now();
      playerVideo.play().catch(() => { });
    } else {
      playerState.playing = false;
      playerVideo.pause();
    }
    playUiSound('move');
    syncPlayerUi();
  });
  document.getElementById('player-rew-btn').addEventListener('click', () => {
    const step = Number(state.settings.seekStep) || 10;
    const cur = Math.max(Number(playerVideo.currentTime) || 0, playerState.seconds || 0);
    const nextT = Math.max(0, cur - step);
    playerState.seconds = nextT;
    lastPlayerNativeTime = nextT;
    lastPlayerNativeMoveTs = performance.now();
    try { playerVideo.currentTime = nextT; } catch (_) { }
    playUiSound('move');
    syncPlayerUi();
  });
  document.getElementById('player-fwd-btn').addEventListener('click', () => {
    const step = Number(state.settings.seekStep) || 10;
    const dur = (Number.isFinite(playerVideo.duration) && playerVideo.duration > 0) ? playerVideo.duration : Math.max(120, (playerState.seconds || 0) + 60);
    const cur = Math.max(Number(playerVideo.currentTime) || 0, playerState.seconds || 0);
    const nextT = Math.min(dur, cur + step);
    playerState.seconds = nextT;
    lastPlayerNativeTime = nextT;
    lastPlayerNativeMoveTs = performance.now();
    try { playerVideo.currentTime = nextT; } catch (_) { }
    playUiSound('move');
    syncPlayerUi();
  });
  document.getElementById('player-track').addEventListener('click', (e) => {
    if (playerState.isLive) return;
    const dur = (Number.isFinite(playerVideo.duration) && playerVideo.duration > 0) ? playerVideo.duration : (playerState.total || 120);
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const nextT = ratio * dur;
    playerState.seconds = nextT;
    lastPlayerNativeTime = nextT;
    lastPlayerNativeMoveTs = performance.now();
    try { playerVideo.currentTime = nextT; } catch (_) { }
    playUiSound('move');
    syncPlayerUi();
  });
  playerAudioBtn.addEventListener('click', () => {
    playerState.audioIdx = (playerState.audioIdx + 1) % AUDIO_TRACKS.length;
    playerAudioBtn.textContent = AUDIO_TRACKS[playerState.audioIdx];
    playUiSound('select');
  });
  playerCcBtn.addEventListener('click', () => {
    playerState.ccEnabled = !playerState.ccEnabled;
    playUiSound(playerState.ccEnabled ? 'select' : 'back');
    syncCcButtons();
    if (playerState.ccEnabled) startLiveCaptions();
    else stopLiveCaptions();
  });
  playerCcLangBtn.addEventListener('click', () => {
    playerState.ccLangIdx = (playerState.ccLangIdx + 1) % CC_LANGS.length;
    playUiSound('move');
    syncCcButtons();
    if (playerState.ccEnabled) startLiveCaptions();
  });
  playerChannelsBtn?.addEventListener('click', () => {
    playUiSound('move');
    const isHidden = playerZapBar.classList.toggle('hidden');
    playerChannelsBtn.classList.toggle('is-active', !isHidden);
    wakePlayerUi(3500);
  });
  playerMoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playUiSound('move');
    const isHidden = playerMorePopover.classList.toggle('hidden');
    if (isHidden) schedulePlayerIdle(2000);
    else clearPlayerIdleTimer();
  });
  document.addEventListener('click', (e) => {
    if (playerMorePopover && !playerMorePopover.classList.contains('hidden') && !e.target.closest('.player-more-wrap')) {
      playerMorePopover.classList.add('hidden');
      schedulePlayerIdle(2000);
    }
  });
  playerQualityBtn.addEventListener('click', () => {
    playUiSound('select');
    const hls = playerState.hls;
    if (!hls || !hls.levels || !hls.levels.length) {
      showToast('Qualidade automática ativa');
      return;
    }
    const nextLevel = hls.currentLevel + 1 >= hls.levels.length ? -1 : hls.currentLevel + 1;
    hls.currentLevel = nextLevel;
    playerQualityBtn.textContent = nextLevel === -1
      ? 'Qualidade: Auto'
      : `Qualidade: ${hls.levels[nextLevel].height || '?'}p`;
  });
  playerMuteBtn.addEventListener('click', () => {
    playerVideo.muted = !playerVideo.muted;
    playUiSound('move');
    syncPlayerUi();
  });
  playerVolRange.addEventListener('input', () => {
    playerVideo.muted = false;
    playerVideo.volume = Math.max(0, Math.min(1, Number(playerVolRange.value) / 100));
    syncPlayerUi();
  });
  document.getElementById('player-fs-btn').addEventListener('click', () => {
    playUiSound('select');
    if (playerVideo) {
      const isCover = playerVideo.style.objectFit === 'cover';
      playerVideo.style.objectFit = isCover ? 'contain' : 'cover';
      showToast(isCover ? 'Modo Proporção Original' : 'Modo Preencher Tela');
    }
  });
  document.getElementById('player-sub-btn')?.addEventListener('click', () => {
    playUiSound('select');
    playerMorePopover?.classList.add('hidden');
    playerMoreBtn?.setAttribute('aria-expanded', 'false');
    document.getElementById('player-sub-file')?.click();
  });
  document.getElementById('player-sub-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !window.IrisMediaPlayer) return;
    const raw = await file.text();
    const cues = window.IrisMediaPlayer.parseSrtVtt(raw);
    if (!cues.length) return showToast('Legenda inválida (.srt / .vtt)');
    playerState.externalCues = cues;
    playerState.ccEnabled = true;
    playerCcBtn?.classList.add('active');
    if (playerCaptionsMeta) playerCaptionsMeta.textContent = `Legenda: ${file.name}`;
    showToast(`Legenda carregada (${cues.length} falas)`);
    renderActiveCaption();
  });
  document.getElementById('player-local-btn').addEventListener('click', () => {
    playUiSound('select');
    playerMorePopover?.classList.add('hidden');
    playerMoreBtn?.setAttribute('aria-expanded', 'false');
    playerLocalFile.click();
  });
  playerLocalFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    destroyHls();
    const objUrl = URL.createObjectURL(file);
    playerState.localObjectUrl = objUrl;
    playerState.isLive = false;
    renderZapBar(null);
    const localTitle = file.name.replace(/\.[^.]+$/, '');
    playerAppLabel.textContent = 'ARQUIVO LOCAL';
    playerTitle.textContent = localTitle;
    if (playerTitleInline) playerTitleInline.textContent = localTitle;
    playerSub.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB • Vídeo Local`;
    playerVideo.src = objUrl;
    playerVideo.classList.remove('hidden');
    cinemaPlayer.classList.add('is-playing-video');
    playerVideo.play().catch(() => { });
    setPlayerStatus('▶ Arquivo Local', false);
    syncPlayerUi();
    wakePlayerUi();
    e.target.value = '';
  });

  /* =========================================================
     Virtual Remote & Ambient Screensaver
     ========================================================= */
  const virtualRemote = document.getElementById('virtual-remote');
  function toggleRemote() {
    playUiSound('move');
    virtualRemote.classList.toggle('hidden');
  }

  document.getElementById('vr-close').addEventListener('click', () => {
    playUiSound('back');
    virtualRemote.classList.add('hidden');
  });

  virtualRemote.querySelectorAll('[data-vr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.vr;
      if (['up', 'down', 'left', 'right'].includes(act)) moveSpatialFocus(act);
      else if (act === 'ok') activateFocusedElement();
      else if (act === 'back') handleGlobalBack();
      else if (act === 'home') {
        closeOnScreenKeyboard();
        closeCinemaPlayer();
        closeM3uModal();
        closeSearch();
        profileOverlay.classList.add('hidden');
        closeAppStage();
        renderTab('home');
        ensureScopeFocus();
      } else if (act === 'volUp') adjustSystemVolume(6, false);
      else if (act === 'volDown') adjustSystemVolume(-6, false);
      else if (act === 'mute') adjustSystemVolume(0, true);
      else if (act === 'keyboard') triggerOskForActiveScope();
      else if (act === 'search') openSearch();
    });
  });

  function activateFocusedElement() {
    const el = state.focusEl;
    if (!el || !document.body.contains(el)) return false;
    if (el.tagName === 'INPUT' && ['text', 'search', 'url', 'password'].includes(el.type)) {
      el.focus();
      const len = (el.value || '').length;
      try { el.setSelectionRange(len, len); } catch (_) { }
      return true;
    }
    if (el.tagName === 'TEXTAREA') {
      el.focus();
      const len = (el.value || '').length;
      try { el.setSelectionRange(len, len); } catch (_) { }
      return true;
    }
    el.click();
    return true;
  }

  function triggerOskForActiveScope() {
    if (irisOskEl && !irisOskEl.classList.contains('hidden')) {
      closeOnScreenKeyboard();
      return;
    }
    if (state.focusEl && ['INPUT', 'TEXTAREA'].includes(state.focusEl.tagName) && state.focusEl.type !== 'range' && state.focusEl.type !== 'file') {
      openOnScreenKeyboard(state.focusEl);
      return;
    }
    const scope = getActiveScopeRoot();
    const visibleInput = scope?.querySelector('input[type="search"]:not(.hidden), input[type="text"]:not(.hidden), textarea:not(.hidden)');
    if (visibleInput && visibleInput.offsetParent !== null) {
      openOnScreenKeyboard(visibleInput);
    } else {
      openOnScreenKeyboard(null, 'Teclado na Tela');
    }
  }

  function handleGlobalBack() {
    if (irisOskEl && !irisOskEl.classList.contains('hidden')) { closeOnScreenKeyboard(); return true; }
    if ((wifiPopover && !wifiPopover.classList.contains('hidden')) || (calendarPopover && !calendarPopover.classList.contains('hidden'))) {
      playUiSound('back');
      closeTelemetryPopovers();
      return true;
    }
    if (!screensaverOverlay.classList.contains('hidden')) { closeScreensaver(); return true; }
    if (!onboardingOverlay.classList.contains('hidden')) { closeOnboarding(); return true; }
    if (!cinemaPlayer.classList.contains('hidden')) { closeCinemaPlayer(); return true; }
    if (m3uOverlay && !m3uOverlay.classList.contains('hidden')) { closeM3uModal(); return true; }
    if (!searchOverlay.classList.contains('hidden')) { closeSearch(); return true; }
    if (!profileOverlay.classList.contains('hidden')) {
      playUiSound('back');
      profileOverlay.classList.add('hidden');
      ensureScopeFocus();
      return true;
    }
    if (!appStageOverlay.classList.contains('hidden')) {
      closeAppStage();
      return true;
    }
    if (state.activeTab !== 'home') {
      playUiSound('back');
      renderTab('home');
      ensureScopeFocus();
      return true;
    }
    return false;
  }

  window.__irisHwEvent = (action) => {
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      if (!cinemaPlayer.classList.contains('hidden') && playerState.isLive && (action === 'up' || action === 'down')) {
        tuneChannelByOffset(action === 'up' ? 1 : -1);
      } else {
        moveSpatialFocus(action);
      }
    } else if (action === 'ok') {
      activateFocusedElement();
    } else if (action === 'back' || action === 'menu') {
      handleGlobalBack();
    } else if (action === 'volUp') {
      adjustSystemVolume(6, false);
    } else if (action === 'volDown') {
      adjustSystemVolume(-6, false);
    } else if (action === 'mute') {
      adjustSystemVolume(0, true);
    } else if (action === 'playPause') {
      if (!cinemaPlayer.classList.contains('hidden')) playerToggleBtn.click();
    } else if (action === 'next') {
      if (!cinemaPlayer.classList.contains('hidden') && playerState.isLive) tuneChannelByOffset(1);
    } else if (action === 'prev') {
      if (!cinemaPlayer.classList.contains('hidden') && playerState.isLive) tuneChannelByOffset(-1);
    } else if (action === 'keyboard') {
      triggerOskForActiveScope();
    }
  };

  // Bluetooth Gamepad & Remote polling (starts only when a controller connects)
  let prevGpState = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, lb: false, rb: false };
  let gpAxisCooldown = 0;
  let gpPolling = false;
  function pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const activePad = Array.from(pads || []).find(Boolean);
    if (!activePad) {
      gpPolling = false;
      return;
    }
    const now = performance.now();
    const gp = activePad;
    const axX = gp.axes?.[0] || 0;
    const axY = gp.axes?.[1] || 0;
    const cur = {
      up: Boolean(gp.buttons?.[12]?.pressed) || axY < -0.55,
      down: Boolean(gp.buttons?.[13]?.pressed) || axY > 0.55,
      left: Boolean(gp.buttons?.[14]?.pressed) || axX < -0.55,
      right: Boolean(gp.buttons?.[15]?.pressed) || axX > 0.55,
      a: Boolean(gp.buttons?.[0]?.pressed),
      b: Boolean(gp.buttons?.[1]?.pressed),
      x: Boolean(gp.buttons?.[2]?.pressed),
      y: Boolean(gp.buttons?.[3]?.pressed),
      lb: Boolean(gp.buttons?.[4]?.pressed),
      rb: Boolean(gp.buttons?.[5]?.pressed)
    };
    if ((cur.up && !prevGpState.up) || (axY < -0.65 && now - gpAxisCooldown > 210)) { gpAxisCooldown = now; window.__irisHwEvent('up'); }
    if ((cur.down && !prevGpState.down) || (axY > 0.65 && now - gpAxisCooldown > 210)) { gpAxisCooldown = now; window.__irisHwEvent('down'); }
    if ((cur.left && !prevGpState.left) || (axX < -0.65 && now - gpAxisCooldown > 210)) { gpAxisCooldown = now; window.__irisHwEvent('left'); }
    if ((cur.right && !prevGpState.right) || (axX > 0.65 && now - gpAxisCooldown > 210)) { gpAxisCooldown = now; window.__irisHwEvent('right'); }
    if (cur.a && !prevGpState.a) window.__irisHwEvent('ok');
    if (cur.b && !prevGpState.b) window.__irisHwEvent('back');
    if (cur.x && !prevGpState.x) window.__irisHwEvent('playPause');
    if (cur.y && !prevGpState.y) window.__irisHwEvent('keyboard');
    if (cur.lb && !prevGpState.lb) window.__irisHwEvent('volDown');
    if (cur.rb && !prevGpState.rb) window.__irisHwEvent('volUp');
    prevGpState = cur;
    requestAnimationFrame(pollGamepads);
  }
  window.addEventListener('gamepadconnected', () => {
    if (!gpPolling) { gpPolling = true; requestAnimationFrame(pollGamepads); }
  });
  if (navigator.getGamepads && Array.from(navigator.getGamepads()).some(Boolean)) {
    gpPolling = true;
    requestAnimationFrame(pollGamepads);
  }

  virtualRemote.querySelectorAll('[data-vr-app]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const app = APPS.find((a) => a.id === btn.dataset.vrApp);
      if (app) launchApp(app);
    });
  });

  /* =========================================================
     Cinematic 4K Lock Screen & Wallpaper Engine
     ========================================================= */
  const screensaverOverlay = document.getElementById('screensaver-overlay');
  const ssClock = document.getElementById('ss-clock');
  const ssClockSec = document.getElementById('ss-clock-seconds');
  const ssDate = document.getElementById('ss-date');
  const ssWpBgA = document.getElementById('ss-wallpaper-bg-a');
  const ssWpBgB = document.getElementById('ss-wallpaper-bg-b');
  const ssWpTitle = document.getElementById('ss-wallpaper-title');
  const ssWpLocation = document.getElementById('ss-wallpaper-location');
  const ssWpPrev = document.getElementById('ss-wp-prev');
  const ssWpNext = document.getElementById('ss-wp-next');
  const ssPlayerCapsule = document.getElementById('ss-player-capsule');
  const ssCapsuleTitle = document.getElementById('ss-capsule-title');
  const ssCapsuleArtist = document.getElementById('ss-capsule-artist');
  const ssWifiSsid = document.getElementById('ss-wifi-ssid');

  const ssShowInfo = document.getElementById('ss-show-info');
  const ssShowTitle = document.getElementById('ss-show-title');
  const ssShowSub = document.getElementById('ss-show-sub');
  const ssShowWatchBtn = document.getElementById('ss-show-watch-btn');

  let ssTimer = null;
  let ssWpRotateTimer = null;
  let ssActiveBg = 'a';
  let ssCurrentWpIndex = 0;
  let ssShowIndex = 0;
  let ssCurrentShowObj = null;

  const EXTRA_SHOW_BANNERS = [
    { id: 'dune-2', title: 'Duna: Parte Dois', genre: 'scifi', appName: 'Max', bgImg: 'media/bg-dune-2.jpg', poster: 'media/poster-dune-2.jpg', sub: 'Filme Sci-Fi • 4K HDR' },
    { id: 'oppenheimer', title: 'Oppenheimer', genre: 'drama', appName: 'Prime Video', bgImg: 'media/bg-oppenheimer.jpg', poster: 'media/poster-oppenheimer.jpg', sub: 'Drama Histórico • Oscar' },
    { id: 'interstellar', title: 'Interestelar', genre: 'scifi', appName: 'Max', bgImg: 'media/bg-interstellar.jpg', poster: 'media/poster-interstellar.jpg', sub: 'Ficção Científica • 4K' },
    { id: 'the-batman', title: 'Batman', genre: 'action', appName: 'Max', bgImg: 'media/bg-the-batman.jpg', poster: 'media/poster-the-batman.jpg', sub: 'Ação & Mistério • 4K HDR' },
    { id: 'blade-runner-2049', title: 'Blade Runner 2049', genre: 'scifi', appName: 'Netflix', bgImg: 'media/bg-blade-runner-2049.jpg', poster: 'media/poster-blade-runner-2049.jpg', sub: 'Sci-Fi Cyberpunk • 4K' },
    { id: 'ted-lasso', title: 'Ted Lasso', genre: 'drama', appName: 'Apple TV+', bgImg: 'media/bg-ted-lasso.jpg', poster: 'media/poster-ted-lasso.jpg', sub: 'Comédia & Drama • Emmy' },
    { id: 'silo', title: 'Silo', genre: 'scifi', appName: 'Apple TV+', bgImg: 'media/bg-silo.jpg', poster: 'media/poster-silo.jpg', sub: 'Mistério Sci-Fi • 4K Dolby' },
    { id: '3-body-problem', title: 'O Problema dos 3 Corpos', genre: 'scifi', appName: 'Netflix', bgImg: 'media/bg-3-body-problem.jpg', poster: 'media/poster-3-body-problem.jpg', sub: 'Ficção Científica • Netflix' },
    { id: 'the-penguin', title: 'Pinguim', genre: 'drama', appName: 'Max', bgImg: 'media/bg-the-penguin.jpg', poster: 'media/poster-the-penguin.jpg', sub: 'Crime & Drama • HBO' },
    { id: 'white-lotus', title: 'The White Lotus', genre: 'drama', appName: 'Max', bgImg: 'media/bg-white-lotus.jpg', poster: 'media/poster-white-lotus.jpg', sub: 'Drama & Sátira • HBO' },
    { id: 'mandalorian', title: 'O Mandaloriano', genre: 'scifi', appName: 'Disney+', bgImg: 'media/bg-mandalorian.jpg', poster: 'media/poster-mandalorian.jpg', sub: 'Star Wars • Disney+' },
    { id: 'peaky-blinders', title: 'Peaky Blinders', genre: 'drama', appName: 'Netflix', bgImg: 'media/bg-peaky-blinders.jpg', poster: 'media/poster-peaky-blinders.jpg', sub: 'Crime Histórico • 6 Temporadas' },
    { id: 'black-mirror', title: 'Black Mirror', genre: 'scifi', appName: 'Netflix', bgImg: 'media/bg-black-mirror.jpg', poster: 'media/poster-black-mirror.jpg', sub: 'Antologia Sci-Fi • Netflix' },
    { id: 'game-of-thrones', title: 'Game of Thrones', genre: 'action', appName: 'Max', bgImg: 'media/bg-game-of-thrones.jpg', poster: 'media/poster-game-of-thrones.jpg', sub: 'Fantasia Épica • HBO' },
    { id: 'spider-verse-2', title: 'Homem-Aranha: Através do Aranhaverso', genre: 'anime', appName: 'Max', bgImg: 'media/bg-spider-verse-2.jpg', poster: 'media/poster-spider-verse-2.jpg', sub: 'Animação • 4K HDR' },
    { id: 'top-gun-maverick', title: 'Top Gun: Maverick', genre: 'action', appName: 'Paramount+', bgImg: 'media/bg-top-gun-maverick.jpg', poster: 'media/poster-top-gun-maverick.jpg', sub: 'Ação • Dolby Vision' },
    { id: 'john-wick-4', title: 'John Wick: Capítulo 4', genre: 'action', appName: 'Prime Video', bgImg: 'media/bg-john-wick-4.jpg', poster: 'media/poster-john-wick-4.jpg', sub: 'Ação • 4K HDR' },
    { id: 'avatar-2', title: 'Avatar: O Caminho da Água', genre: 'scifi', appName: 'Disney+', bgImg: 'media/bg-avatar-2.jpg', poster: 'media/poster-avatar-2.jpg', sub: 'Ficção Científica • 4K' }
  ];

  function getAllShowBannersPool() {
    const merged = [
      ...TRENDING_SHOWS,
      ...EXTRA_SHOW_BANNERS,
      ...(Array.isArray(state.catalogItems) ? state.catalogItems : []),
      ...(Array.isArray(state.recommendedItems) ? state.recommendedItems : [])
    ];
    const seen = new Set();
    return merged.filter((s) => {
      if (!s || !s.bgImg) return false;
      if (s.id === 'severance' || /severance|ruptura/i.test(s.title || '')) return false;
      if (s.bgImg === s.poster || /\/poster\/|poster-/.test(s.bgImg)) return false;
      const key = String(s.title || s.id).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  let ssWpCleanupTimer = null;

  function applyScreensaverShow(index) {
    const shows = getAllShowBannersPool();
    if (!shows.length) return;
    ssShowIndex = ((index % shows.length) + shows.length) % shows.length;
    const show = shows[ssShowIndex];
    ssCurrentShowObj = show;
    if (ssShowTitle) ssShowTitle.textContent = show.title;
    if (ssShowSub) ssShowSub.textContent = show.sub || show.appName || '';
    const nextBg = ssActiveBg === 'a' ? ssWpBgB : ssWpBgA;
    const currBg = ssActiveBg === 'a' ? ssWpBgA : ssWpBgB;
    if (nextBg && currBg) {
      clearTimeout(ssWpCleanupTimer);
      nextBg.style.backgroundImage = `url("${show.bgImg}")`;
      nextBg.classList.add('is-active');
      currBg.classList.remove('is-active');
      ssActiveBg = ssActiveBg === 'a' ? 'b' : 'a';
      ssWpCleanupTimer = setTimeout(() => {
        if (!currBg.classList.contains('is-active')) {
          currBg.style.backgroundImage = 'none';
        }
      }, 1250);
    }
  }

  ssShowWatchBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const targetShow = ssCurrentShowObj;
    closeScreensaver();
    if (targetShow) {
      openMediaDetails(targetShow);
    }
  });

  function applyWallpaper(index, immediate = false) {
    if (!activeWallpapersList.length) return;
    if (index < 0) index = activeWallpapersList.length - 1;
    if (index >= activeWallpapersList.length) index = 0;
    ssCurrentWpIndex = index;
    const wp = activeWallpapersList[ssCurrentWpIndex];

    if (ssWpTitle) {
      ssWpTitle.textContent = wp.location ? `${wp.title} • ${wp.location}` : (wp.title || 'irisTV 4K');
    }

    const nextBg = ssActiveBg === 'a' ? ssWpBgB : ssWpBgA;
    const currBg = ssActiveBg === 'a' ? ssWpBgA : ssWpBgB;

    if (!nextBg || !currBg) return;

    clearTimeout(ssWpCleanupTimer);
    nextBg.style.backgroundImage = `url("${wp.path}")`;
    nextBg.classList.add('is-active');
    currBg.classList.remove('is-active');

    ssActiveBg = ssActiveBg === 'a' ? 'b' : 'a';
    ssWpCleanupTimer = setTimeout(() => {
      if (!currBg.classList.contains('is-active')) {
        currBg.style.backgroundImage = 'none';
      }
    }, 1250);
  }

  function syncScreensaverClock() {
    const now = new Date();
    if (ssClock) ssClock.textContent = formatTvTime(now);
    if (ssDate) ssDate.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function openScreensaver() {
    playUiSound('select');
    syncScreensaverClock();

    const showMode = !!state.settings.showBannersAsWallpaper;
    screensaverOverlay.classList.toggle('is-show-mode', showMode);
    if (ssShowInfo) ssShowInfo.classList.toggle('hidden', !showMode);

    clearInterval(ssTimer);
    ssTimer = setInterval(syncScreensaverClock, 1000);
    clearInterval(ssWpRotateTimer);

    if (showMode) {
      applyScreensaverShow(ssShowIndex);
      ssWpRotateTimer = setInterval(() => {
        applyScreensaverShow(ssShowIndex + 1);
      }, 60000);
    } else {
      const activeId = state.settings.activeWallpaperId;
      const foundIdx = activeWallpapersList.findIndex((w) => w.id === activeId);
      if (foundIdx !== -1) {
        ssCurrentWpIndex = foundIdx;
      }
      applyWallpaper(ssCurrentWpIndex, true);
      if (state.settings.wallpaperAutoRotate !== false) {
        ssWpRotateTimer = setInterval(() => {
          applyWallpaper(ssCurrentWpIndex + 1);
        }, 60000);
      }
    }

    screensaverOverlay.classList.remove('hidden');
  }

  function closeScreensaver() {
    if (screensaverOverlay.classList.contains('hidden')) return;
    playUiSound('back');
    clearInterval(ssTimer);
    clearInterval(ssWpRotateTimer);
    clearTimeout(ssWpCleanupTimer);
    screensaverOverlay.classList.add('hidden');
    // Liberar memoria de texturas do screensaver imediatamente
    if (ssWpBgA) ssWpBgA.style.backgroundImage = 'none';
    if (ssWpBgB) ssWpBgB.style.backgroundImage = 'none';
  }

  screensaverOverlay.addEventListener('click', () => {
    closeScreensaver();
  });

  /* =========================================
     Smart TV Onboarding Experience
     ========================================= */
  const onboardingOverlay = document.getElementById('onboarding-overlay');
  const obGreetingStage = document.getElementById('ob-greeting-stage');
  const obWordOla = document.getElementById('ob-word-ola');
  const obWelcomeBox = document.getElementById('ob-welcome-box');
  const obStartBtn = document.getElementById('ob-start-btn');

  const obWizardCard = document.getElementById('ob-wizard-card');
  const obStepBody = document.getElementById('ob-step-body');
  const obDots = document.querySelectorAll('#ob-dots .ob-dot');
  const obBackBtn = document.getElementById('ob-back-btn');
  const obNextBtn = document.getElementById('ob-next-btn');
  const obSkipBtn = document.getElementById('ob-skip-btn');

  const obPrepStage = document.getElementById('ob-prep-stage');
  const obPrepStatus = document.getElementById('ob-prep-status');
  const obPrepBarFill = document.getElementById('ob-prep-bar-fill');
  const obPrepPct = document.getElementById('ob-prep-pct');

  const obAudio = document.getElementById('onboarding-audio');
  const obAudioToggle = document.getElementById('ob-audio-toggle');
  const obAudioIcon = document.getElementById('ob-audio-icon');
  const obAudioLabel = document.getElementById('ob-audio-label');

  let obAudioPlaying = false;
  let obAudioFadeInTimer = null;

  function ensureOnboardingMusicPlaying() {
    if (!obAudio) return;
    if (obAudio.muted) return;
    if (!obAudio.paused && obAudioPlaying) return;
    obAudio.volume = 0.72;
    const p = obAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        obAudioPlaying = true;
      }).catch(() => {});
    }
  }

  function startOnboardingAudio() {
    if (!obAudio) return;
    clearInterval(obAudioFadeInTimer);
    try {
      if (!obAudio.getAttribute('src') || obAudio.error) {
        obAudio.src = '/assets/audio/onboarding.mp3';
      }
      obAudio.currentTime = 0;
      obAudio.muted = false;
    } catch (_) { }
    obAudio.volume = 0.72;
    if (obAudioLabel) obAudioLabel.textContent = 'Música Ativa';
    if (obAudioToggle) obAudioToggle.classList.remove('muted', 'is-muted');

    const attachAutoResume = () => {
      const resumeOnAction = () => {
        if (onboardingOverlay && !onboardingOverlay.classList.contains('hidden') && !obAudio.muted) {
          obAudio.volume = 0.72;
          obAudio.play().then(() => {
            obAudioPlaying = true;
          }).catch(() => {});
        }
        window.removeEventListener('pointerdown', resumeOnAction, true);
        window.removeEventListener('click', resumeOnAction, true);
        window.removeEventListener('keydown', resumeOnAction, true);
      };
      window.addEventListener('pointerdown', resumeOnAction, true);
      window.addEventListener('click', resumeOnAction, true);
      window.addEventListener('keydown', resumeOnAction, true);
    };

    const playPromise = obAudio.play();
    if (playPromise) {
      playPromise.then(() => {
        obAudioPlaying = true;
        obAudio.volume = 0.72;
      }).catch(() => {
        attachAutoResume();
      });
    } else {
      attachAutoResume();
    }
  }

  function fadeOutOnboardingAudio(durationMs = 2400) {
    if (!obAudio) return;
    let v = obAudio.volume;
    const step = v / (durationMs / 50);
    const fadeOut = setInterval(() => {
      v = Math.max(0, v - step);
      obAudio.volume = v;
      if (v <= 0) {
        clearInterval(fadeOut);
        obAudio.pause();
        obAudio.currentTime = 0;
        obAudioPlaying = false;
      }
    }, 50);
  }

  obAudioToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!obAudio) return;
    if (obAudio.muted || obAudio.paused) {
      obAudio.muted = false;
      obAudio.play().catch(() => {});
      obAudioToggle.classList.remove('muted');
      if (obAudioLabel) obAudioLabel.textContent = 'Música Ativa';
      if (obAudioIcon) {
        obAudioIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
      }
    } else {
      obAudio.muted = true;
      obAudioToggle.classList.add('muted');
      if (obAudioLabel) obAudioLabel.textContent = 'Sem Música';
      if (obAudioIcon) {
        obAudioIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
      }
    }
  });

  const obState = {
    step: 0,
    name: localStorage.getItem('iristv-user-name') || state.currentProfile.name,
    pickedApps: new Set(JSON.parse(localStorage.getItem('iristv-pinned-apps') || '[]'))
  };

  function applyUserPreferences() {
    const cleanName = (obState.name || 'Usuário').trim() || 'Usuário';
    state.currentProfile.name = cleanName;
    state.currentProfile.initial = cleanName[0].toUpperCase();
    currentAvatar.textContent = state.currentProfile.initial;
    localStorage.setItem('iristv-user-name', cleanName);

    const pinned = Array.from(obState.pickedApps);
    localStorage.setItem('iristv-pinned-apps', JSON.stringify(pinned));

    APPS.sort((a, b) => {
      const aPin = obState.pickedApps.has(a.id) ? 0 : 1;
      const bPin = obState.pickedApps.has(b.id) ? 0 : 1;
      return aPin - bPin;
    });
    renderTab(state.activeTab);
    setSpotlightItem({ type: 'show', data: TRENDING_SHOWS.find((s) => s.id !== 'severance') || TRENDING_SHOWS[1] });
    setTimeout(() => ensureScopeFocus(), 30);
  }

  function getNaturalLandscapeWallpapers() {
    const all = (Array.isArray(state.wallpapers) && state.wallpapers.length) ? state.wallpapers : DEFAULT_4K_WALLPAPERS;
    const natural = all.filter((w) => {
      const key = `${w.id || ''} ${w.file || ''} ${w.title || ''}`.toLowerCase();
      return !key.includes('cyberpunk') && !key.includes('nebula') && !key.includes('space') && !key.includes('tokyo');
    });
    return natural.length ? natural : DEFAULT_4K_WALLPAPERS.slice(0, 5);
  }

  function pickOnboardingWallpaper(wpObj) {
    const obBgWp = document.getElementById('ob-bg-wallpaper');
    const naturalPool = getNaturalLandscapeWallpapers();
    const chosen = wpObj || naturalPool[Math.floor(Math.random() * naturalPool.length)] || DEFAULT_4K_WALLPAPERS[0];
    if (chosen && chosen.path) {
      if (obBgWp) {
        obBgWp.style.backgroundImage = `url('${chosen.path}')`;
      }
      if (chosen.id && typeof applyWallpaperById === 'function') {
        applyWallpaperById(chosen.id, false);
      }
    }
  }

  let obSeqTimer1 = null;
  let obSeqTimer2 = null;

  function startGreetingSequence() {
    clearTimeout(obSeqTimer1);
    clearTimeout(obSeqTimer2);
    document.documentElement.classList.remove('reduce-motion');
    pickOnboardingWallpaper();
    startOnboardingAudio();

    if (obGreetingStage) {
      obGreetingStage.classList.remove('hidden', 'is-side-expanded', 'is-sub-visible');
      if (obWordOla) {
        obWordOla.style.animation = 'none';
        void obWordOla.offsetWidth;
        obWordOla.style.animation = '';
      }
      void obGreetingStage.offsetWidth;
    }
    if (obWizardCard) obWizardCard.classList.add('hidden');
    if (obPrepStage) obPrepStage.classList.add('hidden');

    // Passo 1: "Olá," aparece sozinho; após 2.2s sai DO LADO dele "Bem-vindo ao irisTV!"
    obSeqTimer1 = setTimeout(() => {
      if (onboardingOverlay.classList.contains('hidden')) return;
      if (obGreetingStage) obGreetingStage.classList.add('is-side-expanded');
      playUiSound('open');

      // Passo 2: Após mais 1.6s, aparece o subtítulo e o botão EMBAIXO
      obSeqTimer2 = setTimeout(() => {
        if (onboardingOverlay.classList.contains('hidden')) return;
        if (obGreetingStage) obGreetingStage.classList.add('is-sub-visible');
        playUiSound('focus');
        setTimeout(() => {
          if (obStartBtn) obStartBtn.focus();
        }, 450);
      }, 1600);
    }, 2200);
  }

  obStartBtn?.addEventListener('click', () => {
    ensureOnboardingMusicPlaying();
    playUiSound('select');
    if (obGreetingStage) obGreetingStage.classList.add('hidden');
    if (obWizardCard) {
      obWizardCard.classList.remove('hidden');
      obWizardCard.style.animation = 'none';
      void obWizardCard.offsetWidth;
      obWizardCard.style.animation = '';
    }
    obState.step = 0;
    renderOnboardingStep();
  });

  const PREP_STEPS = [
    { pct: 12, text: 'Inicializando compositor gráfico e filtros de imagem...' },
    { pct: 26, text: 'Aplicando papel de parede natural 4K e atmosfera visual...' },
    { pct: 42, text: 'Sincronizando canais de TV ao vivo e guia EPG...' },
    { pct: 58, text: 'Indexando catálogo de filmes, séries e aplicativos...' },
    { pct: 74, text: 'Calibrando motor de áudio espacial e efeitos sonoros...' },
    { pct: 89, text: 'Otimizando alocação de memória e taxa de quadros...' },
    { pct: 100, text: 'Tudo pronto. Bem-vindo ao irisTV!' }
  ];

  function startIrisTvPreparation() {
    ensureOnboardingMusicPlaying();
    if (obWizardCard) obWizardCard.classList.add('hidden');
    if (obPrepStage) {
      obPrepStage.classList.remove('hidden');
      obPrepStage.style.animation = 'none';
      void obPrepStage.offsetWidth;
      obPrepStage.style.animation = '';
    }
    playUiSound('select');

    let stepIdx = 0;
    function runNextStep() {
      if (stepIdx >= PREP_STEPS.length) {
        setTimeout(cinematicInterfaceAssembly, 900);
        return;
      }
      const st = PREP_STEPS[stepIdx++];
      if (obPrepBarFill) obPrepBarFill.style.width = `${st.pct}%`;
      if (obPrepPct) obPrepPct.textContent = `${st.pct}%`;
      if (obPrepStatus) {
        obPrepStatus.style.opacity = '0';
        setTimeout(() => {
          obPrepStatus.textContent = st.text;
          obPrepStatus.style.opacity = '1';
          playUiSound('focus');
        }, 140);
      }
      const delay = stepIdx === PREP_STEPS.length ? 1200 : 950;
      setTimeout(runNextStep, delay);
    }
    setTimeout(runNextStep, 250);
  }

  function cinematicInterfaceAssembly() {
    localStorage.setItem('iristv-onboarded', '1');
    fetch('/api/os/ui-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarded: true })
    }).catch(() => {});
    document.documentElement.classList.remove('reduce-motion');
    applyUserPreferences();

    const tvShell = document.getElementById('tv-shell') || document.querySelector('.tv-shell');
    if (tvShell) {
      tvShell.classList.remove('is-hidden', 'is-assembling');
    }
    document.body.classList.remove('is-assembling');

    onboardingOverlay.style.transition = 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
    onboardingOverlay.style.opacity = '0';
    fadeOutOnboardingAudio(2400);

    // Esconde o overlay e dispara a montagem de todos os elementos da tela inicial
    setTimeout(() => {
      onboardingOverlay.classList.add('hidden');
      onboardingOverlay.style.opacity = '1';

      if (tvShell) {
        void tvShell.offsetWidth;
        document.body.classList.add('is-assembling');
        tvShell.classList.add('is-assembling');
        setTimeout(() => {
          document.body.classList.remove('is-assembling');
          tvShell.classList.remove('is-assembling');
        }, 3800);
      }
      playUiSound('chime');
      showToast(`Bem-vindo, ${state.currentProfile.name}!`);
      ensureScopeFocus();
    }, 420);
  }

  function closeOnboarding() {
    cinematicInterfaceAssembly();
  }

  const TOTAL_OB_STEPS = 5;

  function renderOnboardingStep() {
    if (obStepBody) {
      obStepBody.classList.remove('is-step-entering');
      void obStepBody.offsetWidth;
      obStepBody.classList.add('is-step-entering');
    }
    const allDots = document.querySelectorAll('#ob-dots .ob-dot');
    allDots.forEach((d, i) => d.classList.toggle('active', i === obState.step));
    setTimeout(() => {
      if (obNextBtn) obNextBtn.focus();
    }, 50);
    obBackBtn.classList.toggle('hidden', obState.step === 0);
    obSkipBtn.classList.toggle('hidden', obState.step === TOTAL_OB_STEPS - 1);

    if (obState.step === 0) {
      obNextBtn.textContent = 'Continuar →';
      obStepBody.innerHTML = `
        <div class="ob-step-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h2 class="ob-title">Como devemos chamar você?</h2>
        <p class="ob-sub">Personalize seu perfil principal para recomendações e saudações no irisTV.</p>
        <input id="ob-name-input" class="ob-name-input focusable" type="text" maxlength="20" value="${escHtml(obState.name)}" placeholder="Digite seu nome" autocomplete="off" />
      `;
      const nameInp = document.getElementById('ob-name-input');
      nameInp?.addEventListener('input', (e) => {
        obState.name = e.target.value;
      });
      setTimeout(() => nameInp?.focus(), 80);
    } else if (obState.step === 1) {
      obNextBtn.textContent = 'Continuar →';
      const wpList = getNaturalLandscapeWallpapers().slice(0, 6);
      obStepBody.innerHTML = `
        <div class="ob-step-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        </div>
        <h2 class="ob-title">Cenário de Fundo 4K</h2>
        <p class="ob-sub">Escolha a paisagem que dará vida ao fundo da sua TV.</p>
        <div class="ob-apps-grid" style="grid-template-columns: repeat(3, 1fr); gap: 12px;">
          ${wpList.map((w) => `
            <button class="ob-app-pick focusable ${state.activeWallpaperId === w.id ? 'selected' : ''}" data-ob-wp="${w.id}" type="button" style="padding: 8px; flex-direction: column; height: auto;">
              <div style="width: 100%; height: 68px; border-radius: 10px; background: url('${w.path}') center/cover no-repeat; margin-bottom: 6px;"></div>
              <span style="font-size: 0.78rem; font-weight: 600;">${escHtml(w.title)}</span>
            </button>
          `).join('')}
        </div>
      `;
      obStepBody.querySelectorAll('[data-ob-wp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          playUiSound('move');
          const wpId = btn.dataset.obWp;
          const found = wpList.find((x) => x.id === wpId);
          if (found) {
            applyWallpaperById(found.id, false);
            pickOnboardingWallpaper(found);
          }
          renderOnboardingStep();
        });
      });
    } else if (obState.step === 2) {
      obNextBtn.textContent = 'Continuar →';
      const themes = [
        { id: 'prism', name: 'Prism', sub: 'Padrão Vibrante', cls: 'tp-prism' },
        { id: 'light', name: 'Claro', sub: 'Apple White', cls: 'tp-light' },
        { id: 'oled', name: 'Preto Puro', sub: 'Contraste OLED', cls: 'tp-oled' },
        { id: 'aurora', name: 'Aurora', sub: 'Verde Nórdico', cls: 'tp-aurora' }
      ];
      obStepBody.innerHTML = `
        <div class="ob-step-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.5c2.5 0 4.5-2 4.5-4.5C22 6 17.5 2 12 2z"/></svg>
        </div>
        <h2 class="ob-title">Escolha o Estilo Visual</h2>
        <p class="ob-sub">Selecione a atmosfera de iluminação que melhor combina com a sua sala.</p>
        <div class="ob-theme-grid">
          ${themes.map((t) => `
            <button class="ob-theme-card focusable ${state.theme === t.id ? 'active' : ''}" data-ob-theme="${t.id}" type="button">
              <span class="ob-theme-swatch ${t.cls}"></span>
              <strong>${t.name}</strong>
              <small>${t.sub}</small>
            </button>
          `).join('')}
        </div>
      `;
      obStepBody.querySelectorAll('[data-ob-theme]').forEach((btn) => {
        btn.addEventListener('click', () => {
          playUiSound('move');
          applyTheme(btn.dataset.obTheme, false);
          renderOnboardingStep();
        });
      });
    } else if (obState.step === 3) {
      obNextBtn.textContent = 'Continuar →';
      const accents = Object.entries(ACCENT_COLORS);
      obStepBody.innerHTML = `
        <div class="ob-step-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
        </div>
        <h2 class="ob-title">Cor de Destaque e Brilho</h2>
        <p class="ob-sub">Personalize o tom luminoso do anel de foco e dos indicadores da interface.</p>
        <div class="ob-apps-grid" style="grid-template-columns: repeat(4, 1fr); gap: 10px;">
          ${accents.map(([key, val]) => `
            <button class="ob-app-pick focusable ${state.accentColor === key ? 'selected' : ''}" data-ob-accent="${key}" type="button" style="padding: 12px 10px;">
              <span style="width: 22px; height: 22px; border-radius: 50%; background: ${val.hex}; box-shadow: 0 0 12px ${val.glow}; display: inline-block;"></span>
              <span>${val.label}</span>
            </button>
          `).join('')}
        </div>
      `;
      obStepBody.querySelectorAll('[data-ob-accent]').forEach((btn) => {
        btn.addEventListener('click', () => {
          playUiSound('move');
          applyAccentColor(btn.dataset.obAccent, false);
          renderOnboardingStep();
        });
      });
    } else {
      obNextBtn.textContent = 'Concluir & Preparar Sistema →';
      const quickApps = APPS.slice(0, 12);
      obStepBody.innerHTML = `
        <div class="ob-step-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>
        </div>
        <h2 class="ob-title">Aplicativos Essenciais</h2>
        <p class="ob-sub">Marque quais você deseja destacar na fileira principal da tela inicial.</p>
        <div class="ob-apps-grid">
          ${quickApps.map((a) => `
            <button class="ob-app-pick focusable ${obState.pickedApps.has(a.id) ? 'selected' : ''}" data-ob-app="${a.id}" type="button">
              <img src="${a.iconSrc}" alt="${a.name}" />
              <span>${a.name}</span>
            </button>
          `).join('')}
        </div>
      `;
      obStepBody.querySelectorAll('[data-ob-app]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.obApp;
          if (obState.pickedApps.has(id)) obState.pickedApps.delete(id);
          else obState.pickedApps.add(id);
          btn.classList.toggle('selected', obState.pickedApps.has(id));
          playUiSound('move');
        });
      });
    }
    setTimeout(() => ensureScopeFocus(obNextBtn), 20);
  }

  function openOnboarding(reset = false) {
    if (reset) {
      localStorage.removeItem('iristv-onboarded');
    }
    navMoreWrap?.classList.remove('is-open');
    if (appStageOverlay && !appStageOverlay.classList.contains('hidden')) {
      closeAppStage();
    }
    if (cinemaPlayer && !cinemaPlayer.classList.contains('hidden')) {
      closeCinemaPlayer();
    }
    obState.step = 0;
    if (obWizardCard) obWizardCard.classList.add('hidden');
    if (obPrepStage) obPrepStage.classList.add('hidden');
    if (obPrepBarFill) obPrepBarFill.style.width = '0%';
    if (obPrepPct) obPrepPct.textContent = '0%';
    if (onboardingOverlay) {
      onboardingOverlay.style.transition = '';
      onboardingOverlay.style.opacity = '1';
      onboardingOverlay.classList.remove('hidden');
    }
    startGreetingSequence();
  }

  obNextBtn.addEventListener('click', () => {
    ensureOnboardingMusicPlaying();
    playUiSound('select');
    if (obState.step < TOTAL_OB_STEPS - 1) {
      obState.step += 1;
      renderOnboardingStep();
    } else {
      startIrisTvPreparation();
    }
  });

  obBackBtn.addEventListener('click', () => {
    playUiSound('back');
    if (obState.step > 0) {
      obState.step -= 1;
      renderOnboardingStep();
    }
  });

  obSkipBtn.addEventListener('click', () => {
    startIrisTvPreparation();
  });

  window.addEventListener('keydown', (e) => {
    // Block all Chromium browser function keys (F1 Help, F3 Find, F5 Reload, F6, F7, F11 Fullscreen, F12 DevTools)
    if (/^F([1-9]|1[0-2])$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Block Chromium browser tab/window/print/history/save shortcuts
    if ((e.ctrlKey || e.metaKey) && ['t', 'n', 'w', 'h', 'j', 'p', 'u', 'g', 'd', 'l', 'o'].includes(e.key.toLowerCase())) {
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        e.stopPropagation();
        openOnboarding(true);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const isTextActive = Boolean(
      document.activeElement &&
      (document.activeElement.tagName === 'TEXTAREA' ||
        (document.activeElement.tagName === 'INPUT' &&
          document.activeElement.type !== 'range' &&
          document.activeElement.type !== 'file'))
    );
    const isWifiInputVisible = Boolean(
      (wifiPopover && !wifiPopover.classList.contains('hidden') && wifiPopover.querySelector('.wifi-pass-input')) ||
      (offlineGateOverlay && !offlineGateOverlay.classList.contains('hidden') && offlineGateOverlay.querySelector('.wifi-pass-input'))
    );
    const hasModifier = Boolean(e.ctrlKey || e.metaKey || (!isTextActive && !isWifiInputVisible && e.shiftKey));

    // Global hardware / media keys
    if (e.key === 'AudioVolumeUp' || e.key === 'XF86AudioRaiseVolume' || e.key === 'VolumeUp' || e.keyCode === 175) {
      e.preventDefault();
      if (Date.now() - lastHwVolAt > 300) adjustSystemVolume(6, false);
      return;
    }
    if (e.key === 'AudioVolumeDown' || e.key === 'XF86AudioLowerVolume' || e.key === 'VolumeDown' || e.keyCode === 174) {
      e.preventDefault();
      if (Date.now() - lastHwVolAt > 300) adjustSystemVolume(-6, false);
      return;
    }
    if (e.key === 'AudioVolumeMute' || e.key === 'XF86AudioMute' || e.key === 'VolumeMute' || e.keyCode === 173) {
      e.preventDefault();
      if (Date.now() - lastHwVolAt > 300) adjustSystemVolume(0, true);
      return;
    }
    if (e.key === 'BrowserBack') { e.preventDefault(); handleGlobalBack(); return; }
    if (e.key === 'Home' && !isTextActive) { e.preventDefault(); virtualRemote.querySelector('[data-vr="home"]')?.click(); return; }

    // Modifier-only shortcuts (Ctrl or Shift) for Teclado, Controle, Mudo, Busca, Screensaver, Onboarding
    if (hasModifier) {
      const kLower = e.key.toLowerCase();
      if (kLower === 'o') { e.preventDefault(); e.stopPropagation(); openOnboarding(true); return; }
      if (kLower === 'k') { e.preventDefault(); e.stopPropagation(); triggerOskForActiveScope(); return; }
      if (kLower === 'r') { e.preventDefault(); e.stopPropagation(); toggleRemote(); return; }
      if (kLower === 'm') { e.preventDefault(); e.stopPropagation(); adjustSystemVolume(0, true); return; }
      if (kLower === 'f') { e.preventDefault(); e.stopPropagation(); openSearch(); return; }
      if (kLower === 's') { e.preventDefault(); e.stopPropagation(); openScreensaver(); return; }
    } else if (!isTextActive && !isWifiInputVisible) {
      const kLower = e.key.toLowerCase();
      if (kLower === 's') { e.preventDefault(); e.stopPropagation(); openScreensaver(); return; }
      if (kLower === 'o' && e.shiftKey) { e.preventDefault(); e.stopPropagation(); openOnboarding(true); return; }
    }

    // Screen saver & boot priority
    if (!screensaverOverlay.classList.contains('hidden')) {
      e.preventDefault();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        playUiSound('focus');
        applyWallpaper(ssCurrentWpIndex - 1);
        if (state.settings.wallpaperAutoRotate !== false) {
          clearInterval(ssWpRotateTimer);
          ssWpRotateTimer = setInterval(() => applyWallpaper(ssCurrentWpIndex + 1), 60000);
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        playUiSound('focus');
        applyWallpaper(ssCurrentWpIndex + 1);
        if (state.settings.wallpaperAutoRotate !== false) {
          clearInterval(ssWpRotateTimer);
          ssWpRotateTimer = setInterval(() => applyWallpaper(ssCurrentWpIndex + 1), 60000);
        }
        return;
      }
      closeScreensaver();
      return;
    }
    if (!bootScreen.classList.contains('hidden') && !bootScreen.classList.contains('fade-out')) {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') finishBoot(false);
      return;
    }

    // Onboarding Setup Wizard priority (Enter, Space, Arrows, Escape)
    if (onboardingOverlay && !onboardingOverlay.classList.contains('hidden') && !isTextActive) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement && (document.activeElement === obSkipBtn || document.activeElement === obNextBtn)) {
          document.activeElement.click();
        } else {
          obNextBtn.click();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        obSkipBtn.click();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        obSkipBtn.focus();
        playUiSound('move');
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        obNextBtn.focus();
        playUiSound('move');
        return;
      }
    }

    // Custom On-Screen Keyboard priority
    if (irisOskEl && !irisOskEl.classList.contains('hidden')) {
      if (e.key === 'Escape') { e.preventDefault(); closeOnScreenKeyboard(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveSpatialFocus('left'); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); moveSpatialFocus('right'); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSpatialFocus('up'); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSpatialFocus('down'); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.focusEl && irisOskEl.contains(state.focusEl)) state.focusEl.click();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setOskValue(getOskValue().slice(0, -1));
        playUiSound('back');
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOskValue(getOskValue() + e.key);
        playUiSound('move');
        return;
      }
      return;
    }

    // If Wi-Fi popover or Offline Gate has a password field open and user starts typing normal keys, auto-focus the password field!
    if (!isTextActive && isWifiInputVisible && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const wifiInp = (offlineGateOverlay && !offlineGateOverlay.classList.contains('hidden') && offlineGateOverlay.querySelector('.wifi-pass-input')) ||
        wifiPopover?.querySelector('.wifi-pass-input');
      if (wifiInp) {
        wifiInp.focus();
        const len = (wifiInp.value || '').length;
        try { wifiInp.setSelectionRange(len, len); } catch (_) { }
        return;
      }
    }

    // Active native text input typing (allow natural typing of ALL normal keys, Shift+keys, Space, Backspace, Left/Right)
    if (isTextActive) {
      if (e.key === 'Escape') { e.preventDefault(); document.activeElement.blur(); setFocus(e.target, false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); document.activeElement.blur(); setFocus(e.target, false); moveSpatialFocus('down'); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); document.activeElement.blur(); setFocus(e.target, false); moveSpatialFocus('up'); return; }
      return;
    }

    // Cinema Video Player priority
    if (!cinemaPlayer.classList.contains('hidden')) {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeCinemaPlayer(); return; }
      if (e.key === ' ') { e.preventDefault(); playerToggleBtn.click(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); playerCcBtn.click(); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); adjustSystemVolume(6, false); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); adjustSystemVolume(-6, false); return; }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); handleChannelDigitKey(e.key); return; }
      if (e.key === 'Enter' && chDigitBuffer) { e.preventDefault(); commitChannelDigits(); return; }
      if (e.key === 'PageUp' || e.key === ']') { e.preventDefault(); tuneChannelByOffset(1); return; }
      if (e.key === 'PageDown' || e.key === '[') { e.preventDefault(); tuneChannelByOffset(-1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveSpatialFocus('left'); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); moveSpatialFocus('right'); return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (playerState.isLive && (!state.focusEl || !cinemaPlayer.querySelector('.player-dock')?.contains(state.focusEl))) {
          tuneChannelByOffset(1);
        } else {
          moveSpatialFocus('up');
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (playerState.isLive && (!state.focusEl || !cinemaPlayer.querySelector('.player-dock')?.contains(state.focusEl))) {
          tuneChannelByOffset(-1);
        } else {
          moveSpatialFocus('down');
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!activateFocusedElement()) playerToggleBtn.click();
        return;
      }
      return;
    }

    // Universal Back / Escape across all overlays & sub-tabs
    if (e.key === 'Escape') {
      if (handleGlobalBack()) {
        e.preventDefault();
        return;
      }
    }

    const isCalculatorOpen = !appStageOverlay.classList.contains('hidden') && Boolean(appStageBody.querySelector('.calc-keypad'));

    // Universal Arrow Navigation across ALL layers
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveSpatialFocus('left'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSpatialFocus('right'); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSpatialFocus('up'); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSpatialFocus('down'); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const scope = getActiveScopeRoot();
      const items = getScopeFocusableElements(scope);
      if (items.length) {
        const idx = items.indexOf(state.focusEl);
        const nextIdx = e.shiftKey ? (idx - 1 + items.length) % items.length : (idx + 1) % items.length;
        setFocus(items[nextIdx]);
        playUiSound('move');
      }
      return;
    }
    if (e.key === 'Enter') {
      const focused = ensureScopeFocus();
      if (focused) {
        e.preventDefault();
        activateFocusedElement();
        return;
      }
    }

    // Typing directly onto a spatially-focused input focuses it natively so characters go straight in
    if (state.focusEl && ['INPUT', 'TEXTAREA'].includes(state.focusEl.tagName) && state.focusEl.type !== 'range' && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !isCalculatorOpen) {
      state.focusEl.focus();
      const len = (state.focusEl.value || '').length;
      try { state.focusEl.setSelectionRange(len, len); } catch (_) { }
    }
  }, true);

  /* =========================================================
     Initialize
     ========================================================= */
  var homeMounted = false;
  function mountHomeNow() {
    if (homeMounted) return;
    homeMounted = true;
    applyTheme(state.theme, false);
    loadDefaultThemeFromJson();
    applyAllSettings();
    if (localStorage.getItem('iristv-onboarded') === '1') {
      applyUserPreferences();
    } else {
      renderTab('home');
      setSpotlightItem({ type: 'show', data: TRENDING_SHOWS.find((s) => s.id !== 'severance') || TRENDING_SHOWS[1] });
    }
  }

  if (window.matchMedia) {
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkMq.addEventListener?.('change', () => {
      if (state.settings.autoSystemTheme) applyAllSettings();
    });
  }

  // Cinematic 3.0-second hardware-accelerated boot sequence:
  // Runs at solid 60 FPS without layout or decode contention.
  // Mount the Home DOM at 2.7s right under the boot screen,
  // then smoothly dissolve the boot screen at 3.0s.
  const BOOT_DURATION_MS = 3000;
  setTimeout(() => {
    mountHomeNow();
  }, BOOT_DURATION_MS - 300);

  setTimeout(() => {
    requestAnimationFrame(() => finishBoot(false));
  }, BOOT_DURATION_MS);

  const bgStartupDelay = BOOT_DURATION_MS + 200;
  setTimeout(() => {
    prefetchDefaultShowsCatalog();
    const isTvProfile = Boolean(window.IrisWebOS?.isWebOS || /Web0S|webOS/i.test(navigator.userAgent || ''));
    if (!isTvProfile) {
      setTimeout(() => refreshWifiStatus(false, true), 150);
      setInterval(() => {
        if (document.hidden) return;
        const busy = Boolean(
          wifiConnecting ||
          wifiSelectedSsid ||
          (irisOskEl && !irisOskEl.classList.contains('hidden')) ||
          (document.activeElement && document.activeElement.tagName === 'INPUT')
        );
        if (!busy) refreshWifiStatus(false, false);
      }, 15000);
      setTimeout(() => checkChannelsHealth(), 400);
      setInterval(() => {
        if (!document.hidden) checkChannelsHealth();
      }, 45000);
    }
    setTimeout(() => {
      fetch('/api/news').then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d?.items?.length) {
          state.newsItems = d.items;
          state.newsUpdatedAt = d.updatedAt || Date.now();
          newsClientCache.set('all|all|', { ts: Date.now(), updatedAt: state.newsUpdatedAt, items: d.items });
        }
      }).catch(() => { });
    }, 300);
  }, bgStartupDelay);

  // CPU/RAM Hygiene: Pausa animacoes secundarias e timers quando a TV desliga a tela ou muda de HDMI
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.body.classList.add('is-tv-idle');
    } else {
      document.body.classList.remove('is-tv-idle');
      updateClock();
    }
  });

  // Telemetria em tempo real (?debug=1): Heap JS, nos do DOM, FPS e perfil
  if (location.search.includes('debug=1') || localStorage.getItem('iristv_debug_overlay') === '1') {
    const hud = document.createElement('div');
    hud.id = 'iris-debug-hud';
    hud.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;background:rgba(8,12,20,0.85);border:1px solid rgba(56,189,248,0.4);border-radius:10px;padding:6px 12px;font:11px/1.4 monospace;color:#38bdf8;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.6);';
    document.body.appendChild(hud);
    let frames = 0, lastFpsTs = performance.now(), curFps = 60;
    const calcFps = (now) => {
      frames++;
      if (now - lastFpsTs >= 1000) {
        curFps = Math.round((frames * 1000) / (now - lastFpsTs));
        frames = 0;
        lastFpsTs = now;
      }
      requestAnimationFrame(calcFps);
    };
    requestAnimationFrame(calcFps);
    setInterval(() => {
      const heapMb = window.performance?.memory?.usedJSHeapSize
        ? (window.performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB'
        : 'N/A';
      const domCount = document.getElementsByTagName('*').length;
      hud.innerHTML = `irisTV TV-Profile<br/>Heap: <b>${heapMb}</b> | DOM: <b>${domCount}</b> | FPS: <b>${curFps}</b>`;
    }, 1000);
  }

  window.syncInstalledApps = syncInstalledApps;

  /* Global Developer Debug Tools */
  window.IrisDev = {
    redoOnboarding: (reset = true) => openOnboarding(reset),
    resetOnboardingFlag: () => {
      localStorage.removeItem('iristv-onboarded');
      fetch('/api/os/ui-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboarded: false }) }).catch(() => {});
      showToast('Flag de onboarding removida!');
    },
    testAssembly: () => cinematicInterfaceAssembly(),
    rebootClean: () => {
      localStorage.removeItem('iristv-onboarded');
      sessionStorage.removeItem('irisos-booted');
      fetch('/api/os/ui-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboarded: false }) }).catch(() => {});
      window.location.reload();
    }
  };
})();

/* =========================================================
   Perf: pausa animações infinitas de tudo que NÃO está visível
   (fechado, display:none, fora da tela ou aba oculta)
   ========================================================= */
(() => {
  const SEL = '.boot-glow,.browser-loading-bar,.eq-bar,.iris-app-splash-spinner,.iris-img-loading-box,.mini-iris-spin,.iris-ring-outer,.live-dot,.mp-disc-stage,.mp-header,.mp-vinyl-disc,.ob-bg-wallpaper,.ob-logo,.ob-prep-orb-core,.ob-prep-orb-glow,.osk-cursor,.player-bg-img,.spotlight-kicker,.spotlight-visual,.ss-wallpaper-bg,.tab-progress-fill,.wifi-rescan-btn';
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('iris-paused', !e.isIntersecting);
  }, { rootMargin: '100px' });
  const seen = new WeakSet();
  const watch = (root) => {
    if (root.nodeType !== 1) return;
    const list = root.matches?.(SEL) ? [root] : [];
    root.querySelectorAll?.(SEL).forEach((n) => list.push(n));
    for (const n of list) if (!seen.has(n)) { seen.add(n); io.observe(n); }
  };
  watch(document.body);
  let queue = [];
  let scheduled = false;
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => queue.push(n));
    if (scheduled) return;
    scheduled = true;
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => {
      scheduled = false;
      const q = queue; queue = [];
      q.forEach((n) => { if (n.isConnected) watch(n); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();

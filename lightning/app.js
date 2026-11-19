/**
 * irisTV Lightning — Master Application Root & State Machine
 * 
 * 100% Canvas / WebGL hardware-accelerated user interface.
 * Zero DOM reflows, zero CSS blur lag, rock-solid 60 FPS on Smart TVs.
 * Standalone VanillaJS without Vite, Webpack or build steps.
 */
(function () {
  'use strict';

  if (!window.lng) {
    console.error('[irisTV] LightningJS (window.lng) não encontrado!');
    return;
  }

  const { Application } = window.lng;

  class IrisLightningApp extends Application {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        // Root Wallpaper Layer (GPU Texture)
        Wallpaper: {
          w: 1920,
          h: 1080,
          src: 'media/wallpapers/patagonia-fitzroy-sunset.jpg'
        },
        // Global Dark Tint Overlay to ensure text readability
        DarkVignette: {
          w: 1920,
          h: 1080,
          rect: true,
          color: 0x88060911
        },
        // Views Stack
        Views: {
          w: 1920,
          h: 1080,
          Home: { type: window.IrisHomeView, alpha: 1, visible: true },
          Details: { type: window.IrisDetailsView, alpha: 0, visible: false },
          LiveTv: { type: window.IrisLiveTvView, alpha: 0, visible: false },
          Media: { type: window.IrisMediaView, alpha: 0, visible: false },
          News: { type: window.IrisNewsView, alpha: 0, visible: false },
          Vault: { type: window.IrisVaultView, alpha: 0, visible: false },
          Dvr: { type: window.IrisDvrView, alpha: 0, visible: false },
          Settings: { type: window.IrisSettingsView, alpha: 0, visible: false },
          Onboarding: { type: window.IrisOnboardingView, alpha: 0, visible: false }
        },
        // Fullscreen Video Player HUD Overlay
        PlayerOverlay: {
          type: window.IrisVideoPlayer,
          alpha: 0,
          visible: false
        },
        // Virtual Keyboard Overlay
        KeyboardOverlay: {
          type: window.IrisVirtualKeyboard,
          alpha: 0,
          visible: false
        },
        // Global Floating Toast Notification
        Toast: {
          x: 960,
          y: 980,
          mount: 0.5,
          alpha: 0,
          w: 600,
          h: 60,
          rect: true,
          color: 0xee0f172a,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 30, stroke: 1, strokeColor: 0xff38bdf8 },
          Label: {
            x: 300,
            y: 16,
            mountX: 0.5,
            text: { text: '', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
          }
        }
      };
    }

    static _states() {
      return [
        class Home extends this {
          _getFocused() { return this.tag('Views').tag('Home'); }
        },
        class Details extends this {
          _getFocused() { return this.tag('Views').tag('Details'); }
        },
        class LiveTv extends this {
          _getFocused() { return this.tag('Views').tag('LiveTv'); }
        },
        class Media extends this {
          _getFocused() { return this.tag('Views').tag('Media'); }
        },
        class News extends this {
          _getFocused() { return this.tag('Views').tag('News'); }
        },
        class Vault extends this {
          _getFocused() { return this.tag('Views').tag('Vault'); }
        },
        class Dvr extends this {
          _getFocused() { return this.tag('Views').tag('Dvr'); }
        },
        class Settings extends this {
          _getFocused() { return this.tag('Views').tag('Settings'); }
        },
        class Onboarding extends this {
          _getFocused() { return this.tag('Views').tag('Onboarding'); }
        },
        class Player extends this {
          _getFocused() { return this.tag('PlayerOverlay'); }
        },
        class Keyboard extends this {
          _getFocused() { return this.tag('KeyboardOverlay'); }
        }
      ];
    }

    _init() {
      console.log('[irisTV] Inicializando interface LightningJS 100% Canvas WebGL...');
      this._history = [];
      this._keyboardCallback = null;

      // Check onboarding
      let completed = false;
      try {
        completed = localStorage.getItem('iristv_onboarding_completed') === 'true';
      } catch (e) {}

      if (!completed) {
        this._switchState('Onboarding');
      } else {
        this._setState('Home');
      }
    }

    _switchState(targetState) {
      const views = this.tag('Views');
      const allViews = ['Home', 'Details', 'LiveTv', 'Media', 'News', 'Vault', 'Dvr', 'Settings', 'Onboarding'];

      allViews.forEach(vName => {
        const v = views.tag(vName);
        if (vName === targetState) {
          v.visible = true;
          v.patch({ smooth: { alpha: [1, { duration: 0.25 }] } });
        } else {
          v.patch({ smooth: { alpha: [0, { duration: 0.25 }] } });
          setTimeout(() => {
            if (this._currentState !== vName) v.visible = false;
          }, 250);
        }
      });

      this._setState(targetState);
    }

    // Navigation and Action Handlers
    $goHome() {
      this._switchState('Home');
    }

    $openDetails(showData) {
      const detailsView = this.tag('Views').tag('Details');
      if (detailsView && detailsView.showItem) {
        detailsView.showItem(showData);
      }
      this._switchState('Details');
    }

    $openLiveTv(channelData) {
      this._switchState('LiveTv');
    }

    $openApp(app) {
      console.log('[irisTV] Abrindo aplicativo:', app.id, app.name);
      if (app.isInternal) {
        if (app.id === 'media') this._switchState('Media');
        else if (app.id === 'livetv') this._switchState('LiveTv');
        else if (app.id === 'news') this._switchState('News');
        else if (app.id === 'dvr') this._switchState('Dvr');
        else if (app.id === 'vault') this._switchState('Vault');
        else if (app.id === 'settings') this._switchState('Settings');
      } else {
        // External WebOS App (e.g. Netflix, YouTube)
        this.$showToast('Iniciando ' + app.name + ' via webOS Launcher...');
        if (window.webOS && window.webOS.service) {
          try {
            window.webOS.service.request('luna://com.webos.applicationManager', {
              method: 'launch',
              parameters: { id: app.webosId || app.id }
            });
          } catch (e) {
            console.warn('[irisTV] Falha ao chamar Luna API:', e);
          }
        }
      }
    }

    $playStream(streamData) {
      console.log('[irisTV] Reproduzindo stream:', streamData.title, streamData.stream);
      const player = this.tag('PlayerOverlay');
      player.visible = true;
      player.patch({ smooth: { alpha: [1, { duration: 0.3 }] } });
      player.play(streamData);
      this._previousStateBeforePlayer = this._currentState;
      this._setState('Player');
    }

    $closePlayer() {
      const player = this.tag('PlayerOverlay');
      player.patch({ smooth: { alpha: [0, { duration: 0.3 }] } });
      setTimeout(() => { player.visible = false; }, 300);
      const resume = this._previousStateBeforePlayer || 'Home';
      this._setState(resume);
    }

    $openKeyboard(options) {
      this._previousStateBeforeKeyboard = this._currentState;
      this._keyboardCallback = options.callback;
      const kb = this.tag('KeyboardOverlay');
      kb.visible = true;
      kb.patch({ smooth: { alpha: [1, { duration: 0.25 }] } });
      this._setState('Keyboard');
    }

    $onKeyboardSubmit(text) {
      const kb = this.tag('KeyboardOverlay');
      kb.patch({ smooth: { alpha: [0, { duration: 0.25 }] } });
      setTimeout(() => { kb.visible = false; }, 250);

      if (typeof this._keyboardCallback === 'function') {
        this._keyboardCallback(text);
        this._keyboardCallback = null;
      }
      const resume = this._previousStateBeforeKeyboard || 'Home';
      this._setState(resume);
    }

    $changeWallpaper(src) {
      console.log('[irisTV] Alternando papel de parede:', src);
      this.tag('Wallpaper').src = src;
      this.$showToast('Novo papel de parede aplicado com sucesso!');
    }

    $showToast(msg) {
      const toast = this.tag('Toast');
      toast.tag('Label').text.text = msg;
      toast.patch({
        smooth: {
          alpha: [1, { duration: 0.3 }],
          y: [960, { duration: 0.3, timingFunction: 'ease-out' }]
        }
      });
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.patch({
          smooth: {
            alpha: [0, { duration: 0.4 }],
            y: [990, { duration: 0.4 }]
          }
        });
      }, 3500);
    }
  }

  // Global Remote Control & Keyboard D-Pad Dispatcher
  window.addEventListener('keydown', function (e) {
    if (!window.irisLightningApp) return;
    var code = e.keyCode || e.which;
    var app = window.irisLightningApp;
    var focused = (typeof app._getFocused === 'function') ? app._getFocused() : null;

    if (code === 37) {
      if (focused && typeof focused._handleLeft === 'function') focused._handleLeft();
      else if (typeof app._handleLeft === 'function') app._handleLeft();
    } else if (code === 38) {
      if (focused && typeof focused._handleUp === 'function') focused._handleUp();
      else if (typeof app._handleUp === 'function') app._handleUp();
    } else if (code === 39) {
      if (focused && typeof focused._handleRight === 'function') focused._handleRight();
      else if (typeof app._handleRight === 'function') app._handleRight();
    } else if (code === 40) {
      if (focused && typeof focused._handleDown === 'function') focused._handleDown();
      else if (typeof app._handleDown === 'function') app._handleDown();
    } else if (code === 13 || code === 32) {
      if (focused && typeof focused._handleEnter === 'function') focused._handleEnter();
      else if (typeof app._handleEnter === 'function') app._handleEnter();
    } else if (code === 27 || code === 8 || code === 461 || code === 10009 || code === 4) {
      e.preventDefault();
      if (focused && typeof focused._handleBack === 'function') focused._handleBack();
      else if (typeof app._handleBack === 'function') app._handleBack();
    }
  });

  // Mouse, Trackpad & Pointer Event Adapter for macOS & Desktop
  function attachMouseHandlers(canvas, app) {
    if (!canvas || !app) return;

    function getStageCoords(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (1920 / rect.width),
        y: (e.clientY - rect.top) * (1080 / rect.height)
      };
    }

    canvas.addEventListener('click', function (e) {
      var coords = getStageCoords(e);
      var focused = (typeof app._getFocused === 'function') ? app._getFocused() : null;

      var kb = app.tag('KeyboardOverlay');
      if (kb && kb.visible && kb.alpha > 0.5) {
        if (typeof kb._handleClick === 'function' && kb._handleClick(coords.x, coords.y)) return;
      }

      var player = app.tag('PlayerOverlay');
      if (player && player.visible && player.alpha > 0.5) {
        if (typeof player._handleClick === 'function' && player._handleClick(coords.x, coords.y)) return;
      }

      if (focused) {
        if (typeof focused._handleClick === 'function') {
          var handled = focused._handleClick(coords.x, coords.y);
          if (handled) return;
        }
        if (typeof focused._handleEnter === 'function') {
          focused._handleEnter();
        }
      }
    });

    canvas.addEventListener('mousemove', function (e) {
      var coords = getStageCoords(e);
      var focused = (typeof app._getFocused === 'function') ? app._getFocused() : null;
      var hover = false;
      if (focused && typeof focused._isHoverable === 'function') {
        hover = focused._isHoverable(coords.x, coords.y);
      }
      canvas.style.cursor = hover ? 'pointer' : 'default';
    });

    var wheelTime = 0;
    canvas.addEventListener('wheel', function (e) {
      var now = Date.now();
      if (now - wheelTime < 130) return;
      wheelTime = now;
      var focused = (typeof app._getFocused === 'function') ? app._getFocused() : null;
      if (!focused) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        if (e.deltaX > 15 && typeof focused._handleRight === 'function') focused._handleRight();
        else if (e.deltaX < -15 && typeof focused._handleLeft === 'function') focused._handleLeft();
      } else {
        if (e.deltaY > 15 && typeof focused._handleDown === 'function') focused._handleDown();
        else if (e.deltaY < -15 && typeof focused._handleUp === 'function') focused._handleUp();
      }
    }, { passive: true });
  }

  // Launch Helper for HTML Shell
  window.launchIrisLightning = function (targetCanvas) {
    var canvas = targetCanvas || document.getElementById('lightning-canvas');
    var app = new IrisLightningApp({
      stage: {
        w: 1920,
        h: 1080,
        canvas: canvas,
        srcBasePath: '../',
        clearColor: 0x00000000,
        precision: 1
      }
    });
    window.irisLightningApp = app;
    attachMouseHandlers(canvas, app);
    return app;
  };

  window.IrisLightningApp = IrisLightningApp;
})();

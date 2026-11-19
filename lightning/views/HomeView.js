/**
 * irisTV Lightning — Main Home Screen View (Liquid Glass 60 FPS)
 * 
 * Authentic irisTV UI ported to 100% Canvas WebGL with smooth vertical
 * viewport camera scrolling, rich Hero cinema banner with backdrop art,
 * glass navigation topbar, weather/clock widget, and tactile sound FX.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component, shaders } = window.lng;

  // 1. Navigation Tab Item
  class NavTabItem extends Component {
    static _template() {
      return {
        w: 150,
        h: 44,
        rect: true,
        color: 0x00000000,
        shader: { type: shaders.RoundedRectangle, radius: 14, stroke: 0, strokeColor: 0x00000000 },
        Label: {
          x: 75,
          y: 11,
          mountX: 0.5,
          text: { text: '', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0x99cbd5e1 }
        }
      };
    }

    set tab(data) {
      this._tab = data;
      this.tag('Label').text.text = data.label;
      this._updateActive(data.active);
    }

    get tab() {
      return this._tab;
    }

    _updateActive(isActive) {
      if (isActive) {
        this.patch({
          color: 0x3300c2ff,
          shader: { stroke: 1.5, strokeColor: 0xff00c2ff }
        });
        this.tag('Label').text.textColor = 0xff00c2ff;
      } else {
        this.patch({
          color: 0x00000000,
          shader: { stroke: 0, strokeColor: 0x00000000 }
        });
        this.tag('Label').text.textColor = 0x99cbd5e1;
      }
    }

    _focus() {
      this.patch({
        color: 0x5500c2ff,
        shader: { stroke: 2, strokeColor: 0xffffffff },
        smooth: { scale: [1.08, { duration: 0.18 }] }
      });
      this.tag('Label').text.textColor = 0xffffffff;
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.18 }] }
      });
      this._updateActive(this._tab && this._tab.active);
    }
  }

  // 2. Wide Live Channel Card
  class HomeChannelCard extends Component {
    static _template() {
      return {
        w: 280,
        h: 140,
        rect: true,
        color: 0x331e293b,
        shader: { type: shaders.RoundedRectangle, radius: 18, stroke: 1, strokeColor: 0x22ffffff },
        FocusRing: {
          w: 280,
          h: 140,
          rect: true,
          color: 0x00000000,
          shader: { type: shaders.RoundedRectangle, radius: 18, stroke: 0, strokeColor: 0xff00c2ff }
        },
        LogoBox: {
          x: 20,
          y: 26,
          w: 80,
          h: 88,
          rect: true,
          color: 0x220f172a,
          shader: { type: shaders.RoundedRectangle, radius: 14 },
          Logo: {
            x: 10,
            y: 14,
            w: 60,
            h: 60,
            shader: { type: shaders.RoundedRectangle, radius: 8 }
          }
        },
        NumPill: {
          x: 114,
          y: 24,
          w: 52,
          h: 22,
          rect: true,
          color: 0x3300c2ff,
          shader: { type: shaders.RoundedRectangle, radius: 6 },
          Label: {
            x: 26,
            y: 3,
            mountX: 0.5,
            text: { text: 'CH 01', fontSize: 11, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff00c2ff }
          }
        },
        LiveBadge: {
          x: 174,
          y: 26,
          text: { text: '● AO VIVO', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff10b981 }
        },
        Name: {
          x: 114,
          y: 52,
          w: 154,
          text: { text: 'Canal', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff, maxLines: 1 }
        },
        NowPlaying: {
          x: 114,
          y: 80,
          w: 154,
          text: { text: 'Ao Vivo na TV', fontSize: 14, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8, maxLines: 2, lineHeight: 18 }
        }
      };
    }

    set channel(data) {
      this._channel = data;
      this.tag('LogoBox').tag('Logo').src = data.logo;
      this.tag('NumPill').tag('Label').text.text = 'CH ' + (data.num ? String(data.num).padStart(2, '0') : '01');
      this.tag('Name').text.text = data.name || 'Canal';
      this.tag('NowPlaying').text.text = data.now || 'Programação Ao Vivo';
    }

    get channel() {
      return this._channel;
    }

    _focus() {
      this.patch({
        smooth: { scale: [1.06, { duration: 0.22, timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }] },
        color: 0x66334155,
        FocusRing: { shader: { stroke: 3.5, strokeColor: 0xff00c2ff } }
      });
      this.tag('Name').text.textColor = 0xff00c2ff;
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.22 }] },
        color: 0x331e293b,
        FocusRing: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
      this.tag('Name').text.textColor = 0xffffffff;
    }
  }

  // 3. Movie/Show Poster Card (2:3 Cinema Ratio)
  class HomeShowCard extends Component {
    static _template() {
      return {
        w: 220,
        h: 330,
        rect: true,
        color: 0x221e293b,
        shader: { type: shaders.RoundedRectangle, radius: 18, stroke: 1, strokeColor: 0x22ffffff },
        Poster: {
          w: 220,
          h: 330,
          shader: { type: shaders.RoundedRectangle, radius: 18 }
        },
        BottomShade: {
          y: 190,
          w: 220,
          h: 140,
          rect: true,
          color: 0xd9050811,
          shader: { type: shaders.RoundedRectangle, radius: 18 }
        },
        QualityPill: {
          x: 12,
          y: 12,
          w: 58,
          h: 22,
          rect: true,
          color: 0xcc060912,
          shader: { type: shaders.RoundedRectangle, radius: 6 },
          Label: {
            x: 29,
            y: 3,
            mountX: 0.5,
            text: { text: '4K HDR', fontSize: 11, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          }
        },
        ScorePill: {
          x: 208,
          y: 12,
          mountX: 1,
          w: 54,
          h: 22,
          rect: true,
          color: 0xcc060912,
          shader: { type: shaders.RoundedRectangle, radius: 6 },
          Label: {
            x: 27,
            y: 3,
            mountX: 0.5,
            text: { text: '★ 8.9', fontSize: 11, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xfffbbf24 }
          }
        },
        Title: {
          x: 12,
          y: 264,
          w: 196,
          text: { text: '', fontSize: 17, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff, maxLines: 1 }
        },
        GenreMeta: {
          x: 12,
          y: 294,
          w: 196,
          text: { text: '', fontSize: 13, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8, maxLines: 1 }
        },
        FocusBorder: {
          w: 220,
          h: 330,
          rect: true,
          color: 0x00000000,
          shader: { type: shaders.RoundedRectangle, radius: 18, stroke: 0, strokeColor: 0xff00c2ff }
        }
      };
    }

    set show(data) {
      this._show = data;
      this.tag('Poster').src = data.poster;
      this.tag('Title').text.text = data.title;
      this.tag('GenreMeta').text.text = data.genre || 'Filme • 4K';
      if (data.score) {
        this.tag('ScorePill').tag('Label').text.text = '★ ' + data.score;
      }
    }

    get show() {
      return this._show;
    }

    _focus() {
      this.patch({
        smooth: { scale: [1.08, { duration: 0.22, timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }] },
        FocusBorder: { shader: { stroke: 3.5, strokeColor: 0xff00c2ff } }
      });
      this.tag('Title').text.textColor = 0xff00c2ff;
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.22 }] },
        FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
      this.tag('Title').text.textColor = 0xffffffff;
    }
  }

  // 4. Squircle Dock App Card
  class HomeDockCard extends Component {
    static _template() {
      return {
        w: 120,
        h: 120,
        rect: true,
        color: 0x261e293b,
        shader: { type: shaders.RoundedRectangle, radius: 24, stroke: 1, strokeColor: 0x22ffffff },
        FocusBorder: {
          w: 120,
          h: 120,
          rect: true,
          color: 0x00000000,
          shader: { type: shaders.RoundedRectangle, radius: 24, stroke: 0, strokeColor: 0xff00c2ff }
        },
        Icon: {
          x: 18,
          y: 18,
          w: 84,
          h: 84,
          shader: { type: shaders.RoundedRectangle, radius: 18 }
        },
        Label: {
          x: 60,
          y: 130,
          mountX: 0.5,
          text: { text: '', fontSize: 14, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffcbd5e1 }
        }
      };
    }

    set app(data) {
      this._app = data;
      this.tag('Icon').src = data.icon;
      this.tag('Label').text.text = data.name;
    }

    get app() {
      return this._app;
    }

    _focus() {
      this.patch({
        smooth: { scale: [1.12, { duration: 0.2, timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }] },
        color: 0x55334155,
        FocusBorder: { shader: { stroke: 3.5, strokeColor: 0xff00c2ff } }
      });
      this.tag('Label').text.textColor = 0xff00c2ff;
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.2 }] },
        color: 0x261e293b,
        FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
      this.tag('Label').text.textColor = 0xffcbd5e1;
    }
  }

  // 5. Action Button in Hero Banner
  class HeroButton extends Component {
    static _template() {
      return {
        w: 220,
        h: 54,
        rect: true,
        color: 0xff00c2ff,
        shader: { type: shaders.RoundedRectangle, radius: 27 },
        FocusBorder: {
          w: 220,
          h: 54,
          rect: true,
          color: 0x00000000,
          shader: { type: shaders.RoundedRectangle, radius: 27, stroke: 0, strokeColor: 0xffffffff }
        },
        Label: {
          x: 110,
          y: 15,
          mountX: 0.5,
          text: { text: '', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff070b12 }
        }
      };
    }

    set config(cfg) {
      this._cfg = cfg;
      this.patch({
        w: cfg.w || 220,
        color: cfg.color || 0xff00c2ff,
        FocusBorder: { w: cfg.w || 220 },
        Label: {
          x: (cfg.w || 220) / 2,
          text: { text: cfg.label, textColor: cfg.textColor || 0xff070b12 }
        }
      });
    }

    _focus() {
      this.patch({
        smooth: { scale: [1.06, { duration: 0.2 }] },
        FocusBorder: { shader: { stroke: 3.5, strokeColor: 0xffffffff } }
      });
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.2 }] },
        FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
    }
  }

  // 6. Master Home View with Viewport Scrolling
  class HomeView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        // Top Glass Navigation Bar
        TopBar: {
          x: 80,
          y: 32,
          w: 1760,
          h: 56,
          // Brand Logo
          LogoArea: {
            Logo: {
              text: { text: 'irisTV', fontSize: 34, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff00c2ff }
            },
            ProBadge: {
              x: 112,
              y: 6,
              w: 50,
              h: 22,
              rect: true,
              color: 0x3300c2ff,
              shader: { type: shaders.RoundedRectangle, radius: 7 },
              Label: {
                x: 25,
                y: 3,
                mountX: 0.5,
                text: { text: 'PRO', fontSize: 11, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff00c2ff }
              }
            }
          },
          // Navigation Tabs Center
          TabsArea: {
            x: 260,
            y: 0,
            w: 800,
            h: 56,
            TabsList: { type: Component }
          },
          // Glass Weather & Clock Widget Right
          StatusWidget: {
            x: 1760,
            mountX: 1,
            y: 0,
            w: 360,
            h: 50,
            rect: true,
            color: 0x281e293b,
            shader: { type: shaders.RoundedRectangle, radius: 25, stroke: 1, strokeColor: 0x22ffffff },
            WeatherText: {
              x: 22,
              y: 14,
              text: { text: '🌤️ 24°C • Rio de Janeiro', fontSize: 15, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffe2e8f0 }
            },
            ClockText: {
              x: 280,
              y: 13,
              text: { text: '15:10', fontSize: 17, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff00c2ff }
            }
          }
        },

        // Scrollable Content Viewport Container
        Content: {
          x: 80,
          y: 110,
          w: 1760,
          h: 1800,

          // 1. Cinema Spotlight Hero Banner
          Hero: {
            w: 1760,
            h: 420,
            rect: true,
            color: 0x330f172a,
            shader: { type: shaders.RoundedRectangle, radius: 24, stroke: 1, strokeColor: 0x22ffffff },
            // Right-side Backdrop Artwork
            BackdropArt: {
              x: 800,
              y: 0,
              w: 960,
              h: 420,
              src: '/media/bg-severance.jpg',
              shader: { type: shaders.RoundedRectangle, radius: 24 }
            },
            // Horizontal Fade Mask (Blends artwork into glass left)
            BackdropMask: {
              x: 750,
              y: 0,
              w: 300,
              h: 420,
              rect: true,
              color: 0xff0f172a,
              shader: { type: shaders.RoundedRectangle, radius: 24 }
            },
            // Left Content Stack
            TagBadge: {
              x: 48,
              y: 36,
              w: 220,
              h: 30,
              rect: true,
              color: 0xff00c2ff,
              shader: { type: shaders.RoundedRectangle, radius: 8 },
              Text: {
                x: 110,
                y: 6,
                mountX: 0.5,
                text: { text: '★ DESTAQUE DA SEMANA', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff070b12 }
              }
            },
            Title: {
              x: 48,
              y: 82,
              text: { text: 'Severance (Ruptura)', fontSize: 44, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
            },
            MetaRow: {
              x: 48,
              y: 138,
              ScorePill: {
                w: 70,
                h: 24,
                rect: true,
                color: 0x33f59e0b,
                shader: { type: shaders.RoundedRectangle, radius: 6, stroke: 1, strokeColor: 0xfff59e0b },
                Text: { x: 35, y: 4, mountX: 0.5, text: { text: '★ 8.7', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xfff59e0b } }
              },
              UhdPill: {
                x: 82,
                w: 70,
                h: 24,
                rect: true,
                color: 0x33ffffff,
                shader: { type: shaders.RoundedRectangle, radius: 6 },
                Text: { x: 35, y: 4, mountX: 0.5, text: { text: '4K HDR', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff } }
              },
              MetaDetails: {
                x: 164,
                y: 2,
                text: { text: 'Apple TV+ Original • 2 Temporadas • Suspense Sci-Fi • 2024', fontSize: 15, fontFace: 'PlusJakartaSans', textColor: 0xff00c2ff }
              }
            },
            Desc: {
              x: 48,
              y: 178,
              w: 800,
              text: { text: 'Mark lidera uma equipe de funcionários de escritório cujas memórias foram divididas cirurgicamente entre o trabalho e a vida pessoal. Ao descobrir pistas sobre a verdadeira natureza da Lumon, uma eletrizante conspiração é revelada.', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1, maxLines: 3, lineHeight: 26 }
            },
            Buttons: {
              x: 48,
              y: 310,
              WatchBtn: {
                type: HeroButton,
                config: { w: 220, label: '▶ Assistir Agora', color: 0xff00c2ff, textColor: 0xff070b12 }
              },
              DetailsBtn: {
                x: 240,
                type: HeroButton,
                config: { w: 180, label: 'ℹ Detalhes', color: 0x26ffffff, textColor: 0xffffffff }
              },
              ListBtn: {
                x: 440,
                type: HeroButton,
                config: { w: 180, label: '+ Minha Lista', color: 0x26ffffff, textColor: 0xffffffff }
              }
            }
          },

          // 2. Shelf: Canais Ao Vivo na TV Aberta
          ChannelsShelf: {
            y: 460,
            w: 1760,
            h: 230,
            Header: {
              Title: {
                text: { text: 'Canais Ao Vivo na TV Aberta', fontSize: 24, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
              },
              LiveBadge: {
                x: 320,
                y: 4,
                text: { text: '● AO VIVO', fontSize: 14, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff10b981 }
              }
            },
            List: {
              y: 45,
              w: 1760,
              h: 170,
              clipping: true,
              Items: { type: Component }
            }
          },

          // 3. Shelf: Filmes & Séries em Alta (4K HDR)
          ShowsShelf: {
            y: 720,
            w: 1760,
            h: 440,
            Header: {
              Title: {
                text: { text: 'Filmes & Séries em Alta (4K HDR)', fontSize: 24, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
              },
              Subtitle: {
                y: 30,
                text: { text: 'Sucessos do cinema e produções originais em altíssima definição', fontSize: 15, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
              }
            },
            List: {
              y: 65,
              w: 1760,
              h: 360,
              clipping: true,
              Items: { type: Component }
            }
          },

          // 4. Shelf: Aplicativos Recomendados
          DockShelf: {
            y: 1200,
            w: 1760,
            h: 240,
            Header: {
              Title: {
                text: { text: 'Aplicativos & Serviços', fontSize: 24, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
              },
              Subtitle: {
                y: 30,
                text: { text: 'Seus streamings e ferramentas favoritas integradas', fontSize: 15, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
              }
            },
            List: {
              y: 65,
              w: 1760,
              h: 160,
              clipping: true,
              Items: { type: Component }
            }
          }
        }
      };
    }

    _init() {
      // Row Navigation Index:
      // -1: TopBar Tabs
      //  0: Hero Buttons
      //  1: Channels Shelf
      //  2: Shows Shelf
      //  3: Dock Apps Shelf
      this._activeRow = 0;
      this._tabCol = 0;
      this._heroCol = 0; // 0: Watch, 1: Details, 2: List
      this._channelCol = 0;
      this._showCol = 0;
      this._dockCol = 0;

      this._tabs = [
        { id: 'home', label: 'Início', active: true },
        { id: 'livetv', label: 'Ao Vivo', active: false },
        { id: 'media', label: 'Filmes & Séries', active: false },
        { id: 'apps', label: 'Apps', active: false },
        { id: 'settings', label: 'Ajustes', active: false }
      ];

      this._shows = (window.IrisCatalog && window.IrisCatalog.shows) || [];
      this._channels = (window.IrisCatalog && window.IrisCatalog.channels) || [];
      this._apps = (window.IrisCatalog && window.IrisCatalog.apps) || [];

      this._buildTabs();
      this._buildShelves();
      this._updateClock();
      this._clockInterval = setInterval(() => this._updateClock(), 15000);
    }

    _detach() {
      if (this._clockInterval) clearInterval(this._clockInterval);
    }

    _updateClock() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      this.tag('TopBar').tag('StatusWidget').tag('ClockText').text.text = `${h}:${m}`;
    }

    _buildTabs() {
      const tabsCont = this.tag('TopBar').tag('TabsArea').tag('TabsList');
      const children = {};
      this._tabs.forEach((t, idx) => {
        children['Tab-' + idx] = {
          type: NavTabItem,
          x: idx * 155,
          tab: t
        };
      });
      tabsCont.children = children;
    }

    _buildShelves() {
      // 1. Build Channels
      const chItems = this.tag('Content').tag('ChannelsShelf').tag('List').tag('Items');
      const chChildren = {};
      this._channels.forEach((ch, idx) => {
        chChildren['Ch-' + idx] = {
          type: HomeChannelCard,
          x: idx * 295,
          channel: ch
        };
      });
      chItems.children = chChildren;

      // 2. Build Shows Posters
      const showItems = this.tag('Content').tag('ShowsShelf').tag('List').tag('Items');
      const showChildren = {};
      this._shows.forEach((sh, idx) => {
        showChildren['Show-' + idx] = {
          type: HomeShowCard,
          x: idx * 240,
          show: sh
        };
      });
      showItems.children = showChildren;

      // 3. Build Dock Apps
      const dockItems = this.tag('Content').tag('DockShelf').tag('List').tag('Items');
      const dockChildren = {};
      this._apps.forEach((app, idx) => {
        dockChildren['App-' + idx] = {
          type: HomeDockCard,
          x: idx * 145,
          app: app
        };
      });
      dockItems.children = dockChildren;
    }

    _getFocused() {
      if (this._activeRow === -1) {
        return this.tag('TopBar').tag('TabsArea').tag('TabsList').tag('Tab-' + this._tabCol);
      } else if (this._activeRow === 0) {
        const btns = this.tag('Content').tag('Hero').tag('Buttons');
        if (this._heroCol === 0) return btns.tag('WatchBtn');
        if (this._heroCol === 1) return btns.tag('DetailsBtn');
        return btns.tag('ListBtn');
      } else if (this._activeRow === 1) {
        return this.tag('Content').tag('ChannelsShelf').tag('List').tag('Items').tag('Ch-' + this._channelCol);
      } else if (this._activeRow === 2) {
        return this.tag('Content').tag('ShowsShelf').tag('List').tag('Items').tag('Show-' + this._showCol);
      } else if (this._activeRow === 3) {
        return this.tag('Content').tag('DockShelf').tag('List').tag('Items').tag('App-' + this._dockCol);
      }
      return null;
    }

    _scrollViewport() {
      const content = this.tag('Content');
      let targetY = 110;
      if (this._activeRow === -1 || this._activeRow === 0) {
        targetY = 110;
      } else if (this._activeRow === 1) {
        targetY = -80;
      } else if (this._activeRow === 2) {
        targetY = -340;
      } else if (this._activeRow === 3) {
        targetY = -660;
      }
      content.patch({
        smooth: { y: [targetY, { duration: 0.32, timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }] }
      });
    }

    _handleUp() {
      if (this._activeRow > -1) {
        this._activeRow--;
        this.fireAncestors('$playSound', 'move');
        this._scrollViewport();
      }
    }

    _handleDown() {
      if (this._activeRow < 3) {
        this._activeRow++;
        this.fireAncestors('$playSound', 'move');
        this._scrollViewport();
      }
    }

    _handleLeft() {
      if (this._activeRow === -1) {
        if (this._tabCol > 0) {
          this._tabCol--;
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 0) {
        if (this._heroCol > 0) {
          this._heroCol--;
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 1) {
        if (this._channelCol > 0) {
          this._channelCol--;
          this._scrollChannels();
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 2) {
        if (this._showCol > 0) {
          this._showCol--;
          this._scrollShows();
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 3) {
        if (this._dockCol > 0) {
          this._dockCol--;
          this._scrollDock();
          this.fireAncestors('$playSound', 'move');
        }
      }
    }

    _handleRight() {
      if (this._activeRow === -1) {
        if (this._tabCol < this._tabs.length - 1) {
          this._tabCol++;
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 0) {
        if (this._heroCol < 2) {
          this._heroCol++;
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 1) {
        if (this._channelCol < this._channels.length - 1) {
          this._channelCol++;
          this._scrollChannels();
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 2) {
        if (this._showCol < this._shows.length - 1) {
          this._showCol++;
          this._scrollShows();
          this.fireAncestors('$playSound', 'move');
        }
      } else if (this._activeRow === 3) {
        if (this._dockCol < this._apps.length - 1) {
          this._dockCol++;
          this._scrollDock();
          this.fireAncestors('$playSound', 'move');
        }
      }
    }

    _scrollChannels() {
      const items = this.tag('Content').tag('ChannelsShelf').tag('List').tag('Items');
      const targetX = -Math.max(0, (this._channelCol - 4) * 295);
      items.patch({ smooth: { x: [targetX, { duration: 0.22, timingFunction: 'ease-out' }] } });
    }

    _scrollShows() {
      const items = this.tag('Content').tag('ShowsShelf').tag('List').tag('Items');
      const targetX = -Math.max(0, (this._showCol - 5) * 240);
      items.patch({ smooth: { x: [targetX, { duration: 0.22, timingFunction: 'ease-out' }] } });
    }

    _scrollDock() {
      const items = this.tag('Content').tag('DockShelf').tag('List').tag('Items');
      const targetX = -Math.max(0, (this._dockCol - 9) * 145);
      items.patch({ smooth: { x: [targetX, { duration: 0.22, timingFunction: 'ease-out' }] } });
    }

    _handleEnter() {
      this.fireAncestors('$playSound', 'select');

      if (this._activeRow === -1) {
        const tab = this._tabs[this._tabCol];
        if (tab.id === 'livetv') {
          this.fireAncestors('$openLiveTv', this._channels[0]);
        } else if (tab.id === 'media') {
          this.fireAncestors('$openApp', { id: 'media', isInternal: true });
        } else if (tab.id === 'apps') {
          this._activeRow = 3;
          this._scrollViewport();
        } else if (tab.id === 'settings') {
          this.fireAncestors('$openApp', { id: 'settings', isInternal: true });
        }
      } else if (this._activeRow === 0) {
        const topShow = this._shows[0];
        if (this._heroCol === 0) {
          this.fireAncestors('$playStream', {
            title: topShow.title,
            sub: topShow.genre,
            stream: topShow.stream
          });
        } else if (this._heroCol === 1) {
          this.fireAncestors('$openDetails', topShow);
        } else {
          this.fireAncestors('$showToast', 'Adicionado à Minha Lista com Sucesso');
        }
      } else if (this._activeRow === 1) {
        const ch = this._channels[this._channelCol];
        if (ch) this.fireAncestors('$openLiveTv', ch);
      } else if (this._activeRow === 2) {
        const show = this._shows[this._showCol];
        if (show) this.fireAncestors('$openDetails', show);
      } else if (this._activeRow === 3) {
        const app = this._apps[this._dockCol];
        if (app) this.fireAncestors('$openApp', app);
      }
    }

    _handleClick(x, y) {
      this.fireAncestors('$playSound', 'select');
      // 1. TopBar Tabs
      if (y >= 30 && y <= 90) {
        if (x >= 260 && x <= 1000) {
          const tabIdx = Math.floor((x - 260) / 155);
          if (tabIdx >= 0 && tabIdx < this._tabs.length) {
            this._activeRow = -1;
            this._tabCol = tabIdx;
            this._handleEnter();
            return true;
          }
        }
      }

      // 2. Hero Buttons
      if (y >= 420 && y <= 480) {
        if (x >= 120 && x <= 340) {
          this._heroCol = 0;
          this._handleEnter();
          return true;
        } else if (x >= 360 && x <= 540) {
          this._heroCol = 1;
          this._handleEnter();
          return true;
        } else if (x >= 560 && x <= 740) {
          this._heroCol = 2;
          this._handleEnter();
          return true;
        }
      }

      // 3. Channels Shelf
      if (y >= 570 && y <= 720) {
        const shelfX = this.tag('Content').tag('ChannelsShelf').tag('List').tag('Items').x || 0;
        const clickX = x - 80 - shelfX;
        const chIdx = Math.floor(clickX / 295);
        if (chIdx >= 0 && chIdx < this._channels.length) {
          this._activeRow = 1;
          this._channelCol = chIdx;
          this.fireAncestors('$openLiveTv', this._channels[chIdx]);
          return true;
        }
      }

      // 4. Shows Shelf
      if (y >= 830 && y <= 1160) {
        const shelfX = this.tag('Content').tag('ShowsShelf').tag('List').tag('Items').x || 0;
        const clickX = x - 80 - shelfX;
        const shIdx = Math.floor(clickX / 240);
        if (shIdx >= 0 && shIdx < this._shows.length) {
          this._activeRow = 2;
          this._showCol = shIdx;
          this.fireAncestors('$openDetails', this._shows[shIdx]);
          return true;
        }
      }

      return false;
    }
  }

  window.IrisHomeView = HomeView;
})();

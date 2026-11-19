/**
 * irisTV Lightning — Main Home Screen View
 * 
 * Central dashboard with Hero Banner, Live Channels shelf,
 * Featured Shows shelf, and Applications Dock.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  // Channel Card
  class HomeChannelCard extends Component {
    static _template() {
      return {
        w: 220,
        h: 110,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
        FocusBorder: {
          w: 220,
          h: 110,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 10, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        Logo: {
          x: 16,
          y: 20,
          w: 70,
          h: 70,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 }
        },
        ChNum: {
          x: 100,
          y: 20,
          text: { text: '', fontSize: 22, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
        },
        Name: {
          x: 100,
          y: 48,
          w: 110,
          text: { text: '', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff, maxLines: 1 }
        },
        LiveBadge: {
          x: 100,
          y: 74,
          text: { text: '● AO VIVO', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff4ade80 }
        }
      };
    }

    set channel(data) {
      this._channel = data;
      this.tag('Logo').src = data.logo;
      this.tag('ChNum').text.text = data.num || '1';
      this.tag('Name').text.text = data.name;
    }

    get channel() {
      return this._channel;
    }

    _focus() {
      this.patch({
        color: 0x66334155,
        FocusBorder: { shader: { stroke: 3, strokeColor: 0xff38bdf8 } }
      });
      this.tag('Name').text.textColor = 0xff38bdf8;
    }

    _unfocus() {
      this.patch({
        color: 0x221e293b,
        FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
      this.tag('Name').text.textColor = 0xffffffff;
    }
  }

  // Show Poster Card
  class HomeShowCard extends Component {
    static _template() {
      return {
        w: 220,
        h: 310,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
        FocusBorder: {
          w: 220,
          h: 310,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 12, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        Poster: {
          x: 6,
          y: 6,
          w: 208,
          h: 245,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 8 }
        },
        Title: {
          x: 12,
          y: 258,
          w: 196,
          text: { text: '', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff, maxLines: 1 }
        },
        Meta: {
          x: 12,
          y: 282,
          w: 196,
          text: { text: '', fontSize: 13, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8, maxLines: 1 }
        }
      };
    }

    set show(data) {
      this._show = data;
      this.tag('Poster').src = data.poster;
      this.tag('Title').text.text = data.title;
      this.tag('Meta').text.text = (data.score ? '★ ' + data.score + ' • ' : '') + (data.year || '4K');
    }

    get show() {
      return this._show;
    }

    _focus() {
      this.patch({
        smooth: { scale: [1.05, { duration: 0.2 }] },
        FocusBorder: { shader: { stroke: 3, strokeColor: 0xff38bdf8 } }
      });
      this.tag('Title').text.textColor = 0xff38bdf8;
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.2 }] },
        FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
      this.tag('Title').text.textColor = 0xffffffff;
    }
  }

  // Dock App Card
  class HomeDockCard extends Component {
    static _template() {
      return {
        w: 110,
        h: 110,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 14 },
        FocusBorder: {
          w: 110,
          h: 110,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 14, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        Icon: {
          x: 20,
          y: 15,
          w: 70,
          h: 70,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 }
        },
        Label: {
          x: 55,
          y: 88,
          mountX: 0.5,
          text: { text: '', fontSize: 13, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffcbd5e1 }
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
        smooth: { scale: [1.12, { duration: 0.2 }] },
        color: 0x55334155,
        FocusBorder: { shader: { stroke: 3, strokeColor: 0xff38bdf8 } }
      });
      this.tag('Label').text.textColor = 0xff38bdf8;
    }

    _unfocus() {
      this.patch({
        smooth: { scale: [1.0, { duration: 0.2 }] },
        color: 0x221e293b,
        FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } }
      });
      this.tag('Label').text.textColor = 0xffcbd5e1;
    }
  }

  class HomeView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        // Top Navigation & Clock Bar
        TopBar: {
          x: 80,
          y: 36,
          w: 1760,
          h: 50,
          Logo: {
            text: { text: 'irisTV', fontSize: 32, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
          },
          OsBadge: {
            x: 120,
            y: 8,
            w: 110,
            h: 24,
            rect: true,
            color: 0x3338bdf8,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
            Text: {
              x: 55,
              y: 4,
              mountX: 0.5,
              text: { text: 'LIGHTNING', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
            }
          },
          StatusArea: {
            x: 1760,
            mountX: 1,
            Clock: {
              text: { text: '21:30', fontSize: 24, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
            },
            Date: {
              y: 28,
              text: { text: 'Quarta-feira, 18 de Nov', fontSize: 14, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
            }
          }
        },
        // Hero Spotlight Banner
        Hero: {
          x: 80,
          y: 110,
          w: 1760,
          h: 300,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 18, stroke: 1, strokeColor: 0x33334155 },
          TagBadge: {
            x: 40,
            y: 35,
            w: 170,
            h: 30,
            rect: true,
            color: 0xff0284c7,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
            Text: {
              x: 85,
              y: 6,
              mountX: 0.5,
              text: { text: '★ DESTAQUE DA SEMANA', fontSize: 12, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
            }
          },
          Title: {
            x: 40,
            y: 78,
            text: { text: 'Severance (Ruptura)', fontSize: 38, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          Meta: {
            x: 40,
            y: 126,
            text: { text: 'Apple TV+ Original • 2 Temporadas • Suspense Sci-Fi • 4K HDR • IMDb 8.7', fontSize: 17, fontFace: 'PlusJakartaSans', textColor: 0xff38bdf8 }
          },
          Desc: {
            x: 40,
            y: 160,
            w: 1100,
            text: { text: 'Mark lidera uma equipe de funcionários de escritório cujas memórias foram divididas cirurgicamente entre o trabalho e suas vidas pessoais. Quando um colega misterioso aparece fora do trabalho, inicia-se uma jornada para descobrir a verdade sobre seu emprego.', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1, maxLines: 2, lineHeight: 24 }
          },
          Buttons: {
            x: 40,
            y: 232,
            WatchBtn: {
              w: 220,
              h: 52,
              rect: true,
              color: 0xff38bdf8,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 26 },
              FocusBorder: {
                w: 220,
                h: 52,
                rect: true,
                color: 0x00000000,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 26, stroke: 0, strokeColor: 0xffffffff }
              },
              Label: {
                x: 110,
                y: 15,
                mountX: 0.5,
                text: { text: '▶ Assistir Agora', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff0f172a }
              }
            },
            DetailsBtn: {
              x: 240,
              w: 180,
              h: 52,
              rect: true,
              color: 0x33334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 26 },
              FocusBorder: {
                w: 180,
                h: 52,
                rect: true,
                color: 0x00000000,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 26, stroke: 0, strokeColor: 0xff38bdf8 }
              },
              Label: {
                x: 90,
                y: 15,
                mountX: 0.5,
                text: { text: 'ℹ Detalhes', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1 }
              }
            }
          }
        },
        // Shelf 1: Live Channels
        ChannelsShelf: {
          x: 80,
          y: 425,
          w: 1760,
          h: 160,
          Header: {
            text: { text: 'Canais Ao Vivo na TV Aberta', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          List: {
            y: 35,
            w: 1760,
            h: 120,
            clipping: true,
            Items: { type: window.lng.Component }
          }
        },
        // Shelf 2: Featured Shows
        ShowsShelf: {
          x: 80,
          y: 580,
          w: 1760,
          h: 360,
          Header: {
            text: { text: 'Filmes & Séries em Alta (4K)', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          List: {
            y: 35,
            w: 1760,
            h: 320,
            clipping: true,
            Items: { type: window.lng.Component }
          }
        },
        // Shelf 3: Dock Apps (Bottom)
        DockShelf: {
          x: 80,
          y: 950,
          w: 1760,
          h: 120,
          List: {
            w: 1760,
            h: 110,
            clipping: true,
            Items: { type: window.lng.Component }
          }
        }
      };
    }

    _init() {
      this._activeRow = 0; // 0: Hero, 1: Channels, 2: Shows, 3: Dock
      this._heroCol = 0;   // 0: Watch, 1: Details
      this._channelCol = 0;
      this._showCol = 0;
      this._dockCol = 0;

      this._shows = (window.IrisCatalog && window.IrisCatalog.shows) || [];
      this._channels = (window.IrisCatalog && window.IrisCatalog.channels) || [];
      this._apps = (window.IrisCatalog && window.IrisCatalog.apps) || [];

      this._buildShelves();
      this._updateClock();
      this._clockInterval = setInterval(() => this._updateClock(), 10000);
    }

    _detach() {
      if (this._clockInterval) clearInterval(this._clockInterval);
    }

    _updateClock() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      this.tag('TopBar').tag('StatusArea').tag('Clock').text.text = `${h}:${m}`;
    }

    _buildShelves() {
      // Build Channels
      const chItems = this.tag('ChannelsShelf').tag('List').tag('Items');
      const chChildren = {};
      this._channels.forEach((ch, idx) => {
        chChildren['Ch-' + idx] = {
          type: HomeChannelCard,
          x: idx * 240,
          channel: ch
        };
      });
      chItems.children = chChildren;

      // Build Shows
      const showItems = this.tag('ShowsShelf').tag('List').tag('Items');
      const showChildren = {};
      this._shows.forEach((sh, idx) => {
        showChildren['Show-' + idx] = {
          type: HomeShowCard,
          x: idx * 240,
          show: sh
        };
      });
      showItems.children = showChildren;

      // Build Dock
      const dockItems = this.tag('DockShelf').tag('List').tag('Items');
      const dockChildren = {};
      this._apps.forEach((app, idx) => {
        dockChildren['App-' + idx] = {
          type: HomeDockCard,
          x: idx * 130,
          app: app
        };
      });
      dockItems.children = dockChildren;
    }

    _getFocused() {
      if (this._activeRow === 0) {
        // Hero buttons
        const btn = this._heroCol === 0 ? this.tag('Hero').tag('Buttons').tag('WatchBtn') : this.tag('Hero').tag('Buttons').tag('DetailsBtn');
        return btn;
      } else if (this._activeRow === 1) {
        return this.tag('ChannelsShelf').tag('List').tag('Items').tag('Ch-' + this._channelCol);
      } else if (this._activeRow === 2) {
        return this.tag('ShowsShelf').tag('List').tag('Items').tag('Show-' + this._showCol);
      } else if (this._activeRow === 3) {
        return this.tag('DockShelf').tag('List').tag('Items').tag('App-' + this._dockCol);
      }
      return null;
    }

    _handleUp() {
      if (this._activeRow > 0) {
        this._activeRow--;
        this._updateFocusStyle();
      }
    }

    _handleDown() {
      if (this._activeRow < 3) {
        this._activeRow++;
        this._updateFocusStyle();
      }
    }

    _handleLeft() {
      if (this._activeRow === 0) {
        if (this._heroCol > 0) {
          this._heroCol--;
          this._updateFocusStyle();
        }
      } else if (this._activeRow === 1) {
        if (this._channelCol > 0) {
          this._channelCol--;
          this._scrollChannels();
        }
      } else if (this._activeRow === 2) {
        if (this._showCol > 0) {
          this._showCol--;
          this._scrollShows();
        }
      } else if (this._activeRow === 3) {
        if (this._dockCol > 0) {
          this._dockCol--;
          this._scrollDock();
        }
      }
    }

    _handleRight() {
      if (this._activeRow === 0) {
        if (this._heroCol < 1) {
          this._heroCol++;
          this._updateFocusStyle();
        }
      } else if (this._activeRow === 1) {
        if (this._channelCol < this._channels.length - 1) {
          this._channelCol++;
          this._scrollChannels();
        }
      } else if (this._activeRow === 2) {
        if (this._showCol < this._shows.length - 1) {
          this._showCol++;
          this._scrollShows();
        }
      } else if (this._activeRow === 3) {
        if (this._dockCol < this._apps.length - 1) {
          this._dockCol++;
          this._scrollDock();
        }
      }
    }

    _scrollChannels() {
      const items = this.tag('ChannelsShelf').tag('List').tag('Items');
      const targetX = -Math.max(0, (this._channelCol - 5) * 240);
      items.patch({ smooth: { x: [targetX, { duration: 0.2, timingFunction: 'ease-out' }] } });
    }

    _scrollShows() {
      const items = this.tag('ShowsShelf').tag('List').tag('Items');
      const targetX = -Math.max(0, (this._showCol - 5) * 240);
      items.patch({ smooth: { x: [targetX, { duration: 0.2, timingFunction: 'ease-out' }] } });
    }

    _scrollDock() {
      const items = this.tag('DockShelf').tag('List').tag('Items');
      const targetX = -Math.max(0, (this._dockCol - 10) * 130);
      items.patch({ smooth: { x: [targetX, { duration: 0.2, timingFunction: 'ease-out' }] } });
    }

    _updateFocusStyle() {
      const watchBtn = this.tag('Hero').tag('Buttons').tag('WatchBtn');
      const detailsBtn = this.tag('Hero').tag('Buttons').tag('DetailsBtn');

      if (this._activeRow === 0) {
        if (this._heroCol === 0) {
          watchBtn.patch({ FocusBorder: { shader: { stroke: 4, strokeColor: 0xffffffff } } });
          detailsBtn.patch({ FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } } });
        } else {
          watchBtn.patch({ FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } } });
          detailsBtn.patch({ FocusBorder: { shader: { stroke: 4, strokeColor: 0xff38bdf8 } } });
        }
      } else {
        watchBtn.patch({ FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } } });
        detailsBtn.patch({ FocusBorder: { shader: { stroke: 0, strokeColor: 0x00000000 } } });
      }
    }

    _handleEnter() {
      if (this._activeRow === 0) {
        const topShow = this._shows[0];
        if (this._heroCol === 0) {
          this.fireAncestors('$playStream', {
            title: topShow.title,
            sub: topShow.genre,
            stream: topShow.stream
          });
        } else {
          this.fireAncestors('$openDetails', topShow);
        }
      } else if (this._activeRow === 1) {
        const ch = this._channels[this._channelCol];
        if (ch) {
          this.fireAncestors('$openLiveTv', ch);
        }
      } else if (this._activeRow === 2) {
        const show = this._shows[this._showCol];
        if (show) {
          this.fireAncestors('$openDetails', show);
        }
      } else if (this._activeRow === 3) {
        const app = this._apps[this._dockCol];
        if (app) {
          this.fireAncestors('$openApp', app);
        }
      }
    }

    _handleClick(x, y) {
      // 1. Hero Buttons
      if (y >= 340 && y <= 400) {
        if (x >= 120 && x <= 340) {
          const topShow = this._shows[0];
          this.fireAncestors('$playStream', {
            title: topShow.title,
            sub: topShow.genre,
            stream: topShow.stream
          });
          return true;
        } else if (x >= 360 && x <= 540) {
          const topShow = this._shows[0];
          this.fireAncestors('$openDetails', topShow);
          return true;
        }
      }

      // 2. Channels Shelf
      if (y >= 460 && y <= 575) {
        const shelfX = this.tag('ChannelsShelf').tag('List').tag('Items').x || 0;
        const clickX = x - 80 - shelfX;
        const chIdx = Math.floor(clickX / 240);
        if (chIdx >= 0 && chIdx < this._channels.length) {
          this._channelCol = chIdx;
          this.fireAncestors('$openLiveTv', this._channels[chIdx]);
          return true;
        }
      }

      // 3. Shows Shelf
      if (y >= 615 && y <= 930) {
        const shelfX = this.tag('ShowsShelf').tag('List').tag('Items').x || 0;
        const clickX = x - 80 - shelfX;
        const shIdx = Math.floor(clickX / 240);
        if (shIdx >= 0 && shIdx < this._shows.length) {
          this._showCol = shIdx;
          this.fireAncestors('$openDetails', this._shows[shIdx]);
          return true;
        }
      }

      // 4. Dock Apps Shelf
      if (y >= 950 && y <= 1060) {
        const shelfX = this.tag('DockShelf').tag('List').tag('Items').x || 0;
        const clickX = x - 80 - shelfX;
        const appIdx = Math.floor(clickX / 130);
        if (appIdx >= 0 && appIdx < this._apps.length) {
          this._dockCol = appIdx;
          this.fireAncestors('$openApp', this._apps[appIdx]);
          return true;
        }
      }

      return false;
    }

    _isHoverable(x, y) {
      if (y >= 340 && y <= 400 && ((x >= 120 && x <= 340) || (x >= 360 && x <= 540))) return true;
      if (y >= 460 && y <= 575) return true;
      if (y >= 615 && y <= 930) return true;
      if (y >= 950 && y <= 1060) return true;
      return false;
    }
  }

  window.IrisHomeView = HomeView;
})();

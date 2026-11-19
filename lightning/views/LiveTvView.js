/**
 * irisTV Lightning — Live TV & EPG Guide View
 * 
 * Hardware-accelerated Live TV interface with channel zapping,
 * real-time EPG program guide, and digital recording triggers.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  class ChannelListItem extends Component {
    static _template() {
      return {
        w: 420,
        h: 90,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
        FocusBorder: {
          w: 420,
          h: 90,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 10, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        NumBox: {
          x: 20,
          y: 24,
          w: 42,
          h: 42,
          rect: true,
          color: 0x44334155,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
          Label: {
            x: 21,
            y: 9,
            mountX: 0.5,
            text: { text: '', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xfff8fafc }
          }
        },
        Logo: {
          x: 76,
          y: 20,
          w: 50,
          h: 50,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 }
        },
        Name: {
          x: 140,
          y: 20,
          text: { text: '', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
        },
        Now: {
          x: 140,
          y: 48,
          text: { text: '', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
        }
      };
    }

    set channel(data) {
      this._channel = data;
      this.tag('NumBox').tag('Label').text.text = data.num || '1';
      this.tag('Logo').src = data.logo;
      this.tag('Name').text.text = data.name || 'Canal';
      this.tag('Now').text.text = data.now || 'Ao Vivo';
    }

    get channel() {
      return this._channel;
    }

    _focus() {
      this.patch({
        color: 0x66334155,
        FocusBorder: {
          shader: { stroke: 3, strokeColor: 0xff38bdf8 }
        }
      });
      this.tag('Name').text.textColor = 0xff38bdf8;
    }

    _unfocus() {
      this.patch({
        color: 0x221e293b,
        FocusBorder: {
          shader: { stroke: 0, strokeColor: 0x00000000 }
        }
      });
      this.tag('Name').text.textColor = 0xffffffff;
    }
  }

  class LiveTvView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        rect: true,
        color: 0xf5060911,
        // Left Column: Channels
        Sidebar: {
          x: 100,
          y: 60,
          w: 440,
          h: 960,
          Title: {
            text: { text: 'TV Aberta & Ao Vivo', fontSize: 36, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          Subtitle: {
            y: 46,
            text: { text: '6 canais digitais sintonizados via Antena / IP', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          },
          ChannelList: {
            y: 90,
            w: 440,
            h: 820,
            clipping: true,
            Items: {
              type: window.lng.Component
            }
          }
        },
        // Right Section: Player Preview & EPG Timeline
        MainStage: {
          x: 580,
          y: 60,
          w: 1240,
          h: 960,
          // Video Preview Container
          PreviewBox: {
            w: 1240,
            h: 560,
            rect: true,
            color: 0xff0f172a,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 16 },
            LiveBadge: {
              x: 30,
              y: 30,
              w: 110,
              h: 36,
              rect: true,
              color: 0xffdc2626,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
              Dot: {
                x: 15,
                y: 13,
                w: 10,
                h: 10,
                rect: true,
                color: 0xffffffff,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 5 }
              },
              Label: {
                x: 35,
                y: 8,
                text: { text: 'AO VIVO', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
              }
            },
            QualityBadge: {
              x: 150,
              y: 30,
              w: 120,
              h: 36,
              rect: true,
              color: 0x44334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
              Label: {
                x: 60,
                y: 8,
                mountX: 0.5,
                text: { text: '1080p 60fps', fontSize: 15, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
              }
            },
            ChannelInfoOverlay: {
              x: 40,
              y: 400,
              ChNum: {
                text: { text: '1', fontSize: 48, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
              },
              ChTitle: {
                x: 60,
                y: 6,
                text: { text: 'Rede Globo HD', fontSize: 36, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
              },
              ProgTitle: {
                y: 60,
                text: { text: 'Jornal Nacional', fontSize: 26, fontFace: 'PlusJakartaSans', textColor: 0xfff8fafc }
              },
              ProgNext: {
                y: 96,
                text: { text: 'A seguir: Mania de Você (Novela das 9) • 21:20', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
              }
            }
          },
          // EPG Timeline / Schedule
          EpgSchedule: {
            y: 590,
            w: 1240,
            h: 270,
            rect: true,
            color: 0x221e293b,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 16 },
            Header: {
              x: 30,
              y: 20,
              text: { text: 'Guia de Programação (EPG)', fontSize: 22, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
            },
            Timeline: {
              x: 30,
              y: 65,
              type: window.lng.Component
            }
          },
          // Action Bar
          ActionBar: {
            y: 890,
            w: 1240,
            h: 70,
            rect: true,
            color: 0x331e293b,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
            PlayHint: {
              x: 30,
              y: 24,
              text: { text: '▶ [ENTER] Assistir em Tela Cheia', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
            },
            RecHint: {
              x: 420,
              y: 24,
              text: { text: '● [REC] Gravar no DVR', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xfff87171 }
            },
            ZapHint: {
              x: 1210,
              y: 24,
              mountX: 1,
              text: { text: '▲ ▼ Trocar Canal | [BACK] Voltar', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
            }
          }
        }
      };
    }

    _init() {
      this._selectedIndex = 0;
      this._channels = (window.IrisCatalog && window.IrisCatalog.channels) || [];
      this._buildChannels();
      this._selectChannel(0);
    }

    _buildChannels() {
      const itemsContainer = this.tag('Sidebar').tag('ChannelList').tag('Items');
      const children = {};
      this._channels.forEach((ch, idx) => {
        children['Ch-' + idx] = {
          type: ChannelListItem,
          y: idx * 100,
          channel: ch
        };
      });
      itemsContainer.children = children;
    }

    _selectChannel(idx) {
      this._selectedIndex = idx;
      const ch = this._channels[idx];
      if (!ch) return;

      const overlay = this.tag('MainStage').tag('PreviewBox').tag('ChannelInfoOverlay');
      overlay.tag('ChNum').text.text = ch.num || (idx + 1).toString();
      overlay.tag('ChTitle').text.text = ch.name;
      overlay.tag('ProgTitle').text.text = ch.now;
      overlay.tag('ProgNext').text.text = 'A seguir: ' + (ch.next || 'Programação Noturna');

      // Build EPG Timeline items
      const timeline = this.tag('MainStage').tag('EpgSchedule').tag('Timeline');
      const epg = ch.epg || [
        { time: '20:00', title: ch.now, dur: '60m' },
        { time: '21:00', title: ch.next || 'Próximo', dur: '60m' },
        { time: '22:00', title: 'Programação de Fim de Noite', dur: '120m' }
      ];

      const children = {};
      epg.forEach((prog, i) => {
        children['Prog-' + i] = {
          type: window.lng.Component,
          x: i * 390,
          w: 370,
          h: 170,
          rect: true,
          color: i === 0 ? 0x4438bdf8 : 0x22334155,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
          Time: {
            x: 20,
            y: 18,
            text: { text: prog.time + ' (' + prog.dur + ')', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: i === 0 ? 0xff38bdf8 : 0xff94a3b8 }
          },
          Title: {
            x: 20,
            y: 50,
            w: 330,
            text: { text: prog.title, fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff, maxLines: 2 }
          },
          Badge: {
            x: 20,
            y: 120,
            text: { text: i === 0 ? '● PASSANDO AGORA' : 'AGENDADO', fontSize: 14, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: i === 0 ? 0xff4ade80 : 0xff64748b }
          }
        };
      });
      timeline.children = children;
    }

    _getFocused() {
      const itemsContainer = this.tag('Sidebar').tag('ChannelList').tag('Items');
      return itemsContainer.tag('Ch-' + this._selectedIndex);
    }

    _handleUp() {
      if (this._selectedIndex > 0) {
        this._selectChannel(this._selectedIndex - 1);
        this._updateScroll();
      }
    }

    _handleDown() {
      if (this._selectedIndex < this._channels.length - 1) {
        this._selectChannel(this._selectedIndex + 1);
        this._updateScroll();
      }
    }

    _updateScroll() {
      const itemsContainer = this.tag('Sidebar').tag('ChannelList').tag('Items');
      const targetY = -Math.max(0, (this._selectedIndex - 4) * 100);
      itemsContainer.patch({
        smooth: { y: [targetY, { duration: 0.2, timingFunction: 'ease-out' }] }
      });
    }

    _handleEnter() {
      const ch = this._channels[this._selectedIndex];
      if (ch) {
        this.fireAncestors('$playStream', {
          title: ch.name + ' - ' + ch.now,
          sub: 'Canal ' + ch.num + ' • Ao Vivo',
          stream: ch.stream
        });
      }
    }

    _handleBack() {
      this.fireAncestors('$goHome');
    }
  }

  window.IrisLiveTvView = LiveTvView;
})();

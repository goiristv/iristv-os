/**
 * irisTV Lightning — DVR / PVR Recordings Manager View
 * 
 * Hardware-accelerated DVR recording browser and playback manager.
 * Allows viewing recorded broadcast streams (.ts), scheduled captures,
 * free storage space meters, and starting playback on TV.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  class DvrCard extends Component {
    static _template() {
      return {
        w: 1600,
        h: 90,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
        FocusBorder: {
          w: 1600,
          h: 90,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 12, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        RecIcon: {
          x: 30,
          y: 28,
          w: 34,
          h: 34,
          rect: true,
          color: 0xffef4444,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 17 },
          Dot: {
            x: 10,
            y: 10,
            w: 14,
            h: 14,
            rect: true,
            color: 0xffffffff,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 7 }
          }
        },
        Title: {
          x: 90,
          y: 18,
          text: { text: '', fontSize: 26, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xfff8fafc }
        },
        Meta: {
          x: 90,
          y: 52,
          text: { text: '', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
        },
        SizeBadge: {
          x: 1420,
          y: 26,
          w: 140,
          h: 38,
          rect: true,
          color: 0x33334155,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 8 },
          Label: {
            x: 70,
            y: 9,
            mountX: 0.5,
            text: { text: '', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
          }
        }
      };
    }

    set item(data) {
      this._item = data;
      this.tag('Title').text.text = data.title || 'Gravação';
      this.tag('Meta').text.text = (data.ch || 'TV') + ' • ' + (data.date || '') + ' • Duração: ' + (data.dur || '');
      this.tag('SizeBadge').tag('Label').text.text = data.size || '1.0 GB';
    }

    get item() {
      return this._item;
    }

    _focus() {
      this.patch({
        color: 0x55334155,
        FocusBorder: {
          shader: { stroke: 3, strokeColor: 0xff38bdf8 }
        }
      });
      this.tag('Title').text.textColor = 0xff38bdf8;
    }

    _unfocus() {
      this.patch({
        color: 0x221e293b,
        FocusBorder: {
          shader: { stroke: 0, strokeColor: 0x00000000 }
        }
      });
      this.tag('Title').text.textColor = 0xfff8fafc;
    }
  }

  class DvrView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        rect: true,
        color: 0xee090d16,
        Header: {
          x: 160,
          y: 80,
          Title: {
            text: { text: 'Gravador Digital DVR & PVR', fontSize: 44, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          Subtitle: {
            y: 56,
            text: { text: 'Programas gravados via antena digital e canais ao vivo armazenados na memória interna', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          }
        },
        StorageBox: {
          x: 160,
          y: 180,
          w: 1600,
          h: 80,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
          BarBg: {
            x: 30,
            y: 46,
            w: 1540,
            h: 12,
            rect: true,
            color: 0x44334155,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
            BarFill: {
              w: 1540 * 0.12, // 12% ocupado
              h: 12,
              rect: true,
              color: 0xff38bdf8,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 }
            }
          },
          LabelLeft: {
            x: 30,
            y: 16,
            text: { text: 'Disco Local: 5.1 GB usados de 64 GB disponíveis (8% ocupado)', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1 }
          },
          LabelRight: {
            x: 1570,
            y: 16,
            mountX: 1,
            text: { text: '58.9 GB Livres (~34 horas em HD)', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff10b981 }
          }
        },
        RecordingsList: {
          x: 160,
          y: 290,
          w: 1600,
          h: 560,
          clipping: true,
          Items: {
            type: window.lng.Component
          }
        },
        ActionPrompt: {
          x: 160,
          y: 920,
          w: 1600,
          h: 70,
          rect: true,
          color: 0x331e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
          IconPlay: {
            x: 30,
            y: 24,
            text: { text: '▶ [OK / ENTER] Reproduzir Gravação', fontSize: 18, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
          },
          IconRec: {
            x: 480,
            y: 24,
            text: { text: '● [REC] Agendar Nova Gravação', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xfff87171 }
          },
          IconBack: {
            x: 1570,
            y: 24,
            mountX: 1,
            text: { text: '← [VOLTAR / BACK] Retornar ao Início', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          }
        }
      };
    }

    _init() {
      this._selectedIndex = 0;
      this._loadRecordings();
    }

    _loadRecordings() {
      const dvrData = (window.IrisCatalog && window.IrisCatalog.dvr) || [];
      const itemsContainer = this.tag('RecordingsList').tag('Items');
      const children = {};

      dvrData.forEach((item, index) => {
        children['Item-' + index] = {
          type: DvrCard,
          y: index * 105,
          item: item
        };
      });

      itemsContainer.children = children;
      this._itemsCount = dvrData.length;
      this._updateScroll();
    }

    _updateScroll() {
      const itemsContainer = this.tag('RecordingsList').tag('Items');
      const targetY = -Math.max(0, (this._selectedIndex - 3) * 105);
      itemsContainer.patch({
        smooth: { y: [targetY, { duration: 0.2, timingFunction: 'ease-out' }] }
      });
    }

    _getFocused() {
      const itemsContainer = this.tag('RecordingsList').tag('Items');
      return itemsContainer.tag('Item-' + this._selectedIndex);
    }

    _handleUp() {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        this._updateScroll();
      }
    }

    _handleDown() {
      if (this._selectedIndex < this._itemsCount - 1) {
        this._selectedIndex++;
        this._updateScroll();
      }
    }

    _handleEnter() {
      const focused = this._getFocused();
      if (focused && focused.item) {
        this.fireAncestors('$playStream', {
          title: focused.item.title,
          sub: focused.item.ch + ' • ' + focused.item.dur,
          stream: focused.item.stream
        });
      }
    }

    _handleBack() {
      this.fireAncestors('$goHome');
    }
  }

  window.IrisDvrView = DvrView;
})();

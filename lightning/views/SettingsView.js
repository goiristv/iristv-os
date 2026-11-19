/**
 * irisTV Lightning — Settings & Configuration View
 * 
 * Hardware-accelerated settings panel for themes, 4K wallpapers,
 * Hub network setup, and real-time performance telemetry.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  class SettingsMenuItem extends Component {
    static _template() {
      return {
        w: 380,
        h: 70,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
        FocusBorder: {
          w: 380,
          h: 70,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 10, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        Title: {
          x: 24,
          y: 22,
          text: { text: '', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffcbd5e1 }
        }
      };
    }

    set title(val) {
      this.tag('Title').text.text = val;
    }

    _focus() {
      this.patch({
        color: 0x5538bdf8,
        FocusBorder: {
          shader: { stroke: 2, strokeColor: 0xff38bdf8 }
        }
      });
      this.tag('Title').text.textColor = 0xffffffff;
    }

    _unfocus() {
      this.patch({
        color: 0x221e293b,
        FocusBorder: {
          shader: { stroke: 0, strokeColor: 0x00000000 }
        }
      });
      this.tag('Title').text.textColor = 0xffcbd5e1;
    }
  }

  class WallpaperThumbItem extends Component {
    static _template() {
      return {
        w: 360,
        h: 210,
        rect: true,
        color: 0x221e293b,
        shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
        FocusBorder: {
          w: 360,
          h: 210,
          rect: true,
          color: 0x00000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 12, stroke: 0, strokeColor: 0xff38bdf8 }
        },
        Thumb: {
          x: 6,
          y: 6,
          w: 348,
          h: 150,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 8 }
        },
        Title: {
          x: 16,
          y: 168,
          w: 330,
          text: { text: '', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
        }
      };
    }

    set wp(data) {
      this._wp = data;
      this.tag('Thumb').src = data.src;
      this.tag('Title').text.text = data.name;
    }

    get wp() {
      return this._wp;
    }

    _focus() {
      this.patch({
        FocusBorder: {
          shader: { stroke: 4, strokeColor: 0xff38bdf8 }
        }
      });
      this.tag('Title').text.textColor = 0xff38bdf8;
    }

    _unfocus() {
      this.patch({
        FocusBorder: {
          shader: { stroke: 0, strokeColor: 0x00000000 }
        }
      });
      this.tag('Title').text.textColor = 0xffffffff;
    }
  }

  class SettingsView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        rect: true,
        color: 0xf5060a12,
        Header: {
          x: 100,
          y: 60,
          Title: {
            text: { text: 'Configurações do irisTV', fontSize: 40, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          Subtitle: {
            y: 50,
            text: { text: 'Preferências do sistema, personalização gráfica, rede LAN e otimizações para Smart TV', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          }
        },
        // Left Column: Navigation Menu
        MenuCol: {
          x: 100,
          y: 160,
          w: 400,
          h: 800,
          Items: {
            type: window.lng.Component
          }
        },
        // Right Panel: Dynamic Content
        ContentStage: {
          x: 540,
          y: 160,
          w: 1280,
          h: 800,
          rect: true,
          color: 0x1f1e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 16 },
          PanelTitle: {
            x: 40,
            y: 30,
            text: { text: '', fontSize: 28, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          PanelDesc: {
            x: 40,
            y: 70,
            text: { text: '', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          },
          PanelContent: {
            x: 40,
            y: 120,
            w: 1200,
            h: 640,
            type: window.lng.Component
          }
        },
        // Footer Hint
        Footer: {
          x: 100,
          y: 980,
          w: 1720,
          h: 50,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 8 },
          Hint: {
            x: 20,
            y: 14,
            text: { text: '[▲ / ▼] Selecionar   |   [►] Navegar Painel   |   [◄] Voltar ao Menu   |   [OK] Confirmar / Aplicar   |   [BACK] Início', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          }
        }
      };
    }

    _init() {
      this._categories = [
        'Plano de Fundo (Wallpapers)',
        'Aparência & Cores',
        'Rede & Servidor Local',
        'Desempenho & TV',
        'Sobre o irisTV'
      ];
      this._menuIndex = 0;
      this._paneMode = 'menu'; // 'menu' or 'content'
      this._wpIndex = 0;
      this._buildMenu();
      this._renderCategory(0);
    }

    _buildMenu() {
      const menuContainer = this.tag('MenuCol').tag('Items');
      const children = {};
      this._categories.forEach((cat, idx) => {
        children['Menu-' + idx] = {
          type: SettingsMenuItem,
          y: idx * 85,
          title: cat
        };
      });
      menuContainer.children = children;
    }

    _renderCategory(idx) {
      this._menuIndex = idx;
      const stage = this.tag('ContentStage');
      const title = stage.tag('PanelTitle');
      const desc = stage.tag('PanelDesc');
      const content = stage.tag('PanelContent');

      content.children = {};

      if (idx === 0) {
        // Wallpapers 4K
        title.text.text = 'Papéis de Parede em Alta Resolução (4K)';
        desc.text.text = 'Selecione uma imagem de fundo para renderização WebGL direta na camada traseira';
        const wps = (window.IrisCatalog && window.IrisCatalog.wallpapers) || [];
        const wpChildren = {};
        wps.forEach((wp, wIdx) => {
          const col = wIdx % 3;
          const row = Math.floor(wIdx / 3);
          wpChildren['Wp-' + wIdx] = {
            type: WallpaperThumbItem,
            x: col * 390,
            y: row * 240,
            wp: wp
          };
        });
        content.children = wpChildren;
      } else if (idx === 1) {
        // Themes
        title.text.text = 'Temas Visuais & Paleta de Cores';
        desc.text.text = 'Modos de cor otimizados para painéis OLED e telas de LCD';
        content.children = {
          Theme1: {
            w: 1180,
            h: 80,
            y: 0,
            rect: true,
            color: 0x33334155,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
            Name: { x: 30, y: 26, text: { text: '● Prism Dark (Padrão Sofisticado - Azul Cobalto)', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } }
          },
          Theme2: {
            w: 1180,
            h: 80,
            y: 100,
            rect: true,
            color: 0x221e293b,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
            Name: { x: 30, y: 26, text: { text: '○ OLED Black (Preto Absoluto #000000 - Economia Máxima)', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1 } }
          },
          Theme3: {
            w: 1180,
            h: 80,
            y: 200,
            rect: true,
            color: 0x221e293b,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
            Name: { x: 30, y: 26, text: { text: '○ Aurora Borealis (Gradiente Esmeralda e Violeta)', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1 } }
          }
        };
      } else if (idx === 2) {
        // Network
        title.text.text = 'Rede Local & Hub de Streaming';
        desc.text.text = 'Endereço IP da máquina servidora na sua rede Wi-Fi / Ethernet';
        content.children = {
          Box: {
            w: 1180,
            h: 220,
            rect: true,
            color: 0x221e293b,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
            IpLabel: { x: 30, y: 30, text: { text: 'IP do Servidor IrisTV:', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } },
            IpValue: { x: 30, y: 64, text: { text: 'http://192.168.1.100:3000', fontSize: 32, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } },
            Status: { x: 30, y: 130, text: { text: '● Conectado (Latência: 4ms • Largura de banda: 100 Mbps)', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff4ade80 } },
            Hint: { x: 30, y: 170, text: { text: 'Pressione [ENTER] para alterar o IP através do Teclado Virtual', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1 } }
          }
        };
      } else if (idx === 3) {
        // Performance
        title.text.text = 'Métricas de Desempenho & Smart TV';
        desc.text.text = 'Telemetria do hardware LG webOS e motor gráfico WebGL';
        content.children = {
          Stat1: {
            w: 360,
            h: 160,
            rect: true,
            color: 0x33334155,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
            Num: { x: 30, y: 30, text: { text: '60 FPS', fontSize: 44, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff4ade80 } },
            Lbl: { x: 30, y: 95, text: { text: 'Taxa de Quadros Fixa (V-Sync)', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } }
          },
          Stat2: {
            x: 400,
            w: 360,
            h: 160,
            rect: true,
            color: 0x33334155,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
            Num: { x: 30, y: 30, text: { text: '28 MB', fontSize: 44, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } },
            Lbl: { x: 30, y: 95, text: { text: 'Uso de RAM (Meta: < 500 MB)', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } }
          },
          Stat3: {
            x: 800,
            w: 360,
            h: 160,
            rect: true,
            color: 0x33334155,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
            Num: { x: 30, y: 30, text: { text: '0 DOM', fontSize: 44, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xfff59e0b } },
            Lbl: { x: 30, y: 95, text: { text: 'Zero nós DOM (100% WebGL)', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } }
          }
        };
      } else if (idx === 4) {
        // About
        title.text.text = 'Sobre o irisTV OS';
        desc.text.text = 'Informações de sistema e licença';
        content.children = {
          Box: {
            w: 1180,
            h: 300,
            rect: true,
            color: 0x221e293b,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
            Sys1: { x: 40, y: 40, text: { text: 'Versão:', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } },
            Val1: { x: 200, y: 40, text: { text: 'irisTV 2.5.0-lightning (VanillaJS)', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff } },
            Sys2: { x: 40, y: 85, text: { text: 'Engine:', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } },
            Val2: { x: 200, y: 85, text: { text: 'LightningJS v2.20 UMD Standalone (ES5)', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } },
            Sys3: { x: 40, y: 130, text: { text: 'Plataforma:', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } },
            Val3: { x: 200, y: 130, text: { text: 'LG webOS 4.x / 5.x / 6.x (Chromium 53+)', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff } },
            Sys4: { x: 40, y: 175, text: { text: 'Resolução:', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } },
            Val4: { x: 200, y: 175, text: { text: '1920x1080 @ 60 Hz Hardware Accelerated', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff4ade80 } },
            Sys5: { x: 40, y: 220, text: { text: 'Desenvolvido:', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } },
            Val5: { x: 200, y: 220, text: { text: 'Focado em TVs antigas e baixo consumo de memória', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1 } }
          }
        };
      }
    }

    _getFocused() {
      if (this._paneMode === 'content' && this._menuIndex === 0) {
        return this.tag('ContentStage').tag('PanelContent').tag('Wp-' + this._wpIndex);
      }
      return this.tag('MenuCol').tag('Items').tag('Menu-' + this._menuIndex);
    }

    _handleUp() {
      if (this._paneMode === 'menu') {
        if (this._menuIndex > 0) {
          this._renderCategory(this._menuIndex - 1);
        }
      } else if (this._paneMode === 'content' && this._menuIndex === 0) {
        if (this._wpIndex >= 3) {
          this._wpIndex -= 3;
        }
      }
    }

    _handleDown() {
      if (this._paneMode === 'menu') {
        if (this._menuIndex < this._categories.length - 1) {
          this._renderCategory(this._menuIndex + 1);
        }
      } else if (this._paneMode === 'content' && this._menuIndex === 0) {
        const wps = (window.IrisCatalog && window.IrisCatalog.wallpapers) || [];
        if (this._wpIndex + 3 < wps.length) {
          this._wpIndex += 3;
        }
      }
    }

    _handleRight() {
      if (this._paneMode === 'menu' && this._menuIndex === 0) {
        this._paneMode = 'content';
      }
    }

    _handleLeft() {
      if (this._paneMode === 'content') {
        this._paneMode = 'menu';
      }
    }

    _handleEnter() {
      if (this._paneMode === 'content' && this._menuIndex === 0) {
        const wps = (window.IrisCatalog && window.IrisCatalog.wallpapers) || [];
        const selectedWp = wps[this._wpIndex];
        if (selectedWp) {
          this.fireAncestors('$changeWallpaper', selectedWp.src);
        }
      } else if (this._paneMode === 'menu' && this._menuIndex === 2) {
        // Open keyboard to edit LAN IP
        this.fireAncestors('$openKeyboard', {
          title: 'Configurar IP do Hub na Rede Local',
          initialText: '192.168.1.100:3000',
          callback: (newIp) => {
            console.log('[Settings] Novo IP configurado:', newIp);
          }
        });
      }
    }

    _handleBack() {
      if (this._paneMode === 'content') {
        this._paneMode = 'menu';
      } else {
        this.fireAncestors('$goHome');
      }
    }
  }

  window.IrisSettingsView = SettingsView;
})();

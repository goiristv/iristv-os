/**
 * irisTV Lightning — First-Time TV Onboarding Setup Wizard
 * 
 * Hardware-accelerated welcome flow for new Smart TV installations.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  class OnboardingView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        rect: true,
        color: 0xf5060a12,
        Card: {
          x: 960,
          y: 540,
          mount: 0.5,
          w: 1100,
          h: 680,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 24, stroke: 1, strokeColor: 0x3338bdf8 },
          LogoText: {
            x: 550,
            y: 70,
            mountX: 0.5,
            text: { text: 'irisTV OS', fontSize: 44, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
          },
          WelcomeTitle: {
            x: 550,
            y: 130,
            mountX: 0.5,
            text: { text: 'Bem-vindo à Sua Nova Experiência em Smart TV', fontSize: 32, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          WelcomeDesc: {
            x: 550,
            y: 180,
            mountX: 0.5,
            w: 900,
            text: { text: 'Interface ultraveloz reescrita em LightningJS com renderização direta via WebGL. Fluidez garantida de 60 quadros por segundo e consumo inferior a 50 MB de memória RAM.', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xffcbd5e1, lineHeight: 28 }
          },
          FeaturesRow: {
            x: 100,
            y: 280,
            w: 900,
            Feat1: {
              w: 280,
              h: 180,
              rect: true,
              color: 0x22334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
              Icon: { x: 30, y: 30, text: { text: '⚡', fontSize: 32 } },
              Title: { x: 30, y: 80, text: { text: '60 FPS Estáveis', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } },
              Sub: { x: 30, y: 115, w: 220, text: { text: 'Zero travamentos em CPUs fracas e TVs antigas', fontSize: 14, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } }
            },
            Feat2: {
              x: 310,
              w: 280,
              h: 180,
              rect: true,
              color: 0x22334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
              Icon: { x: 30, y: 30, text: { text: '📺', fontSize: 32 } },
              Title: { x: 30, y: 80, text: { text: 'TV Aberta & DVR', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } },
              Sub: { x: 30, y: 115, w: 220, text: { text: 'Canais ao vivo, EPG e gravações digitais', fontSize: 14, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } }
            },
            Feat3: {
              x: 620,
              w: 280,
              h: 180,
              rect: true,
              color: 0x22334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 12 },
              Icon: { x: 30, y: 30, text: { text: '🔒', fontSize: 32 } },
              Title: { x: 30, y: 80, text: { text: 'Cofre & Segurança', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 } },
              Sub: { x: 30, y: 115, w: 220, text: { text: 'Senhas de streaming e Wi-Fi protegidas por PIN', fontSize: 14, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 } }
            }
          },
          StartButton: {
            x: 550,
            y: 530,
            mountX: 0.5,
            w: 420,
            h: 70,
            rect: true,
            color: 0xff38bdf8,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 35 },
            FocusBorder: {
              w: 420,
              h: 70,
              rect: true,
              color: 0x00000000,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 35, stroke: 4, strokeColor: 0xffffffff }
            },
            Label: {
              x: 210,
              y: 20,
              mountX: 0.5,
              text: { text: 'COMEÇAR A USAR O IRISTV', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff0f172a }
            }
          }
        }
      };
    }

    _focus() {
      this.tag('Card').tag('StartButton').patch({
        color: 0xff0284c7,
        FocusBorder: {
          shader: { stroke: 4, strokeColor: 0xffffffff }
        }
      });
    }

    _unfocus() {
      this.tag('Card').tag('StartButton').patch({
        color: 0xff38bdf8,
        FocusBorder: {
          shader: { stroke: 0, strokeColor: 0x00000000 }
        }
      });
    }

    _handleEnter() {
      try {
        localStorage.setItem('iristv_onboarding_completed', 'true');
      } catch (e) {}
      this.fireAncestors('$goHome');
    }

    _handleClick(x, y) {
      // Start button bounds: 750 <= x <= 1170, 730 <= y <= 800 (or click anywhere on the card)
      if ((x >= 700 && x <= 1220 && y >= 700 && y <= 830) || (x >= 410 && x <= 1510 && y >= 200 && y <= 880)) {
        this._handleEnter();
        return true;
      }
      return false;
    }

    _isHoverable(x, y) {
      return (x >= 700 && x <= 1220 && y >= 700 && y <= 830);
    }

    _handleBack() {
      this.fireAncestors('$goHome');
    }
  }

  window.IrisOnboardingView = OnboardingView;
})();

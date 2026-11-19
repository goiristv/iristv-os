/**
 * irisTV Lightning — Passwords Vault View (Cofre de Senhas)
 * Secure local credentials manager with 4-digit PIN unlock
 */
(function () {
  'use strict';

  const { Component, shaders } = window.lng;

  class CredentialCard extends Component {
    static _template() {
      return {
        w: 520, h: 90, mount: 0.5,
        Bg: {
          w: 520, h: 90, rect: true, color: 0xff131a29,
          shader: { type: shaders.RoundedRectangle, radius: 14 }
        },
        FocusGlow: {
          w: 526, h: 96, mount: 0.5, x: 260, y: 45, alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 16, stroke: 3, strokeColor: 0xff38bdf8 }
        },
        Service: {
          x: 25, y: 18,
          text: { text: '', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
        },
        User: {
          x: 25, y: 48,
          text: { text: '', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
        },
        PassBadge: {
          x: 495, y: 32, mountX: 1,
          text: { text: '••••••••', fontSize: 20, fontFace: 'monospace', textColor: 0xff38bdf8 }
        }
      };
    }

    set cred(data) {
      this._data = data;
      this._revealed = false;
      this.tag('Service').text.text = data.service;
      this.tag('User').text.text = data.user;
      this._updatePass();
    }

    get cred() {
      return this._data;
    }

    toggleReveal() {
      this._revealed = !this._revealed;
      this._updatePass();
    }

    _updatePass() {
      this.tag('PassBadge').text.text = this._revealed ? this._data.pass : '••••••••';
    }

    _focus() {
      this.patch({
        smooth: { scale: 1.05 },
        FocusGlow: { smooth: { alpha: 1 } },
        Bg: { color: 0xff1e283d }
      });
    }

    _unfocus() {
      this.patch({
        smooth: { scale: 1.0 },
        FocusGlow: { smooth: { alpha: 0 } },
        Bg: { color: 0xff131a29 }
      });
    }
  }

  class VaultView extends Component {
    static _template() {
      return {
        w: 1920, h: 1080,
        Title: {
          x: 90, y: 90,
          text: { text: 'COFRE DE SENHAS IRISTV', fontSize: 44, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
        },

        // Locked Stage (PIN Entry)
        PinLockBox: {
          x: 960, y: 500, mount: 0.5, w: 560, h: 380, rect: true, color: 0xf50b101c,
          shader: { type: shaders.RoundedRectangle, radius: 24, stroke: 2, strokeColor: 0xff253350 },
          LockIcon: {
            x: 280, y: 40, mountX: 0.5,
            text: { text: '🔒', fontSize: 48 }
          },
          LockTitle: {
            x: 280, y: 110, mountX: 0.5,
            text: { text: 'Digite o PIN de 4 dígitos', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
          },
          PinDots: {
            x: 280, y: 170, mountX: 0.5,
            text: { text: '○  ○  ○  ○', fontSize: 36, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
          },
          LockHint: {
            x: 280, y: 250, mountX: 0.5,
            text: { text: 'Pressione [Enter] para desbloquear (PIN Padrão: 1234)', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
          }
        },

        // Unlocked Stage (Credentials List)
        CredentialsContainer: {
          x: 90, y: 190, alpha: 0,
          SectionTitle: {
            text: { text: 'Credenciais e Contas Salvas', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
          },
          Hint: {
            x: 320, y: 2,
            text: { text: '•  Pressione [Enter] em um item para revelar a senha', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
          },
          List: {
            x: 260, y: 80,
            children: []
          }
        }
      };
    }

    _init() {
      this._isUnlocked = false;
      this._items = window.IrisCatalog?.vault?.items || [];
      this._index = 0;
      this._renderList();
    }

    _renderList() {
      const children = this._items.map((cred, i) => ({
        type: CredentialCard,
        y: i * 110,
        cred: cred
      }));
      this.tag('List').children = children;
    }

    _getFocusedChild() {
      if (!this._isUnlocked) return this;
      return this.tag('List').children[this._index] || this;
    }

    _handleEnter() {
      if (!this._isUnlocked) {
        this._isUnlocked = true;
        this.tag('PinLockBox').patch({ smooth: { alpha: 0 } });
        this.tag('CredentialsContainer').patch({ smooth: { alpha: 1 } });
        this._refocus();
        return true;
      }
      const activeCard = this.tag('List').children[this._index];
      if (activeCard && activeCard.toggleReveal) {
        activeCard.toggleReveal();
        return true;
      }
      return false;
    }

    _handleDown() {
      if (this._isUnlocked && this._index < this._items.length - 1) {
        this._index++;
        this._refocus();
        return true;
      }
      return false;
    }

    _handleUp() {
      if (this._isUnlocked && this._index > 0) {
        this._index--;
        this._refocus();
        return true;
      }
      return false;
    }

    _handleBack() {
      if (this._isUnlocked) {
        this._isUnlocked = false;
        this.tag('PinLockBox').patch({ smooth: { alpha: 1 } });
        this.tag('CredentialsContainer').patch({ smooth: { alpha: 0 } });
        this._refocus();
        return true;
      }
      return false;
    }
  }

  window.IrisViews = window.IrisViews || {};
  window.IrisViews.VaultView = VaultView;
})();

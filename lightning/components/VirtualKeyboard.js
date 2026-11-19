/**
 * irisTV Lightning — On-Screen Virtual Keyboard (OSK)
 * QWERTY keyboard for Smart TV search with remote control D-pad
 */
(function () {
  'use strict';

  const { Component, shaders } = window.lng;

  const KEYBOARD_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ['ESPAÇO', 'APAGAR', 'LIMPAR', 'CONCLUÍDO']
  ];

  class KeyButton extends Component {
    static _template() {
      return {
        w: 60, h: 54, mount: 0.5,
        Bg: {
          w: 60, h: 54, rect: true, color: 0xff161e30,
          shader: { type: shaders.RoundedRectangle, radius: 10 }
        },
        FocusGlow: {
          w: 64, h: 58, mount: 0.5, x: 30, y: 27, alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 12, stroke: 3, strokeColor: 0xff38bdf8 }
        },
        Label: {
          x: 30, y: 15, mountX: 0.5,
          text: { text: '', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
        }
      };
    }

    set keyVal(val) {
      this._val = val;
      const isAction = val.length > 1;
      const w = isAction ? (val === 'ESPAÇO' ? 220 : 130) : 60;
      this.patch({
        w: w,
        Bg: { w: w },
        FocusGlow: { w: w + 4, x: w / 2 },
        Label: { x: w / 2, text: { text: val, fontSize: isAction ? 17 : 22 } }
      });
    }

    get keyVal() {
      return this._val;
    }

    _focus() {
      this.patch({
        smooth: { scale: 1.1 },
        FocusGlow: { smooth: { alpha: 1 } },
        Bg: { color: 0xff253352 }
      });
    }

    _unfocus() {
      this.patch({
        smooth: { scale: 1.0 },
        FocusGlow: { smooth: { alpha: 0 } },
        Bg: { color: 0xff161e30 }
      });
    }
  }

  class VirtualKeyboard extends Component {
    static _template() {
      return {
        w: 800, h: 420, mount: 0.5,
        BoxBg: {
          w: 800, h: 420, rect: true, color: 0xf50a0f1d,
          shader: { type: shaders.RoundedRectangle, radius: 24 }
        },
        Header: {
          x: 400, y: 35, mountX: 0.5,
          text: { text: 'BUSCAR FILMES, SÉRIES OU CANAIS', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
        },
        InputBox: {
          x: 400, y: 80, mountX: 0.5, w: 720, h: 56, rect: true, color: 0xff121826,
          shader: { type: shaders.RoundedRectangle, radius: 14, stroke: 2, strokeColor: 0xff26344d },
          QueryText: {
            x: 25, y: 14,
            text: { text: 'Digite para pesquisar...', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
          }
        },
        KeysContainer: {
          x: 400, y: 165, mountX: 0.5,
          children: []
        }
      };
    }

    _init() {
      this._query = '';
      this._row = 0;
      this._col = 0;
      this._renderKeys();
    }

    _renderKeys() {
      const rows = [];
      KEYBOARD_ROWS.forEach((rowKeys, rIdx) => {
        let xOffset = 0;
        const rowChildren = rowKeys.map((k, cIdx) => {
          const w = k === 'ESPAÇO' ? 220 : (k.length > 1 ? 130 : 60);
          const x = xOffset + w / 2;
          xOffset += w + 12;
          return {
            type: KeyButton,
            x: x,
            keyVal: k
          };
        });
        const totalW = xOffset - 12;
        rows.push({
          type: Component,
          y: rIdx * 62,
          x: -totalW / 2,
          children: rowChildren
        });
      });
      this.tag('KeysContainer').children = rows;
    }

    _getFocusedChild() {
      const rowComp = this.tag('KeysContainer').children[this._row];
      if (rowComp && rowComp.children) {
        return rowComp.children[this._col];
      }
      return this;
    }

    _handleLeft() {
      const maxCol = KEYBOARD_ROWS[this._row].length - 1;
      if (this._col > 0) {
        this._col--;
        this._refocus();
        return true;
      }
      return false;
    }

    _handleRight() {
      const maxCol = KEYBOARD_ROWS[this._row].length - 1;
      if (this._col < maxCol) {
        this._col++;
        this._refocus();
        return true;
      }
      return false;
    }

    _handleDown() {
      if (this._row < KEYBOARD_ROWS.length - 1) {
        this._row++;
        this._col = Math.min(this._col, KEYBOARD_ROWS[this._row].length - 1);
        this._refocus();
        return true;
      }
      return false;
    }

    _handleUp() {
      if (this._row > 0) {
        this._row--;
        this._col = Math.min(this._col, KEYBOARD_ROWS[this._row].length - 1);
        this._refocus();
        return true;
      }
      return false;
    }

    _handleEnter() {
      const key = KEYBOARD_ROWS[this._row][this._col];
      if (key === 'CONCLUÍDO') {
        this.fireAncestors('$onKeyboardSubmit', this._query);
        return true;
      }
      if (key === 'LIMPAR') {
        this._query = '';
      } else if (key === 'APAGAR') {
        this._query = this._query.slice(0, -1);
      } else if (key === 'ESPAÇO') {
        this._query += ' ';
      } else {
        this._query += key;
      }

      this._updateInputDisplay();
      this.fireAncestors('$onKeyboardChange', this._query);
      return true;
    }

    _updateInputDisplay() {
      const q = this._query;
      this.tag('QueryText').text.text = q ? `${q}_` : 'Digite para pesquisar...';
      this.tag('QueryText').text.textColor = q ? 0xffffffff : 0x88ffffff;
    }

    reset() {
      this._query = '';
      this._row = 0;
      this._col = 0;
      this._updateInputDisplay();
      this._refocus();
    }
  }

  window.IrisComponents = window.IrisComponents || {};
  window.IrisComponents.VirtualKeyboard = VirtualKeyboard;
})();

/**
 * irisTV Lightning — Video Player HUD & OSD Overlay
 * 
 * Hardware-accelerated Video Player HUD for TV remote control.
 * Controls stream playback, shows timeline, audio/subtitle status,
 * and auto-hides controls after inactivity.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  class VideoPlayer extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        rect: true,
        color: 0xee000000,
        // Top Header Info
        TopBar: {
          x: 80,
          y: 60,
          w: 1760,
          h: 120,
          Title: {
            text: { text: '', fontSize: 36, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          Subtitle: {
            y: 48,
            text: { text: '', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff38bdf8 }
          },
          Badges: {
            x: 1560,
            y: 10,
            w: 200,
            h: 36,
            rect: true,
            color: 0x33ffffff,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 6 },
            Text: {
              x: 100,
              y: 8,
              mountX: 0.5,
              text: { text: '4K • HDR • 5.1', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffcbd5e1 }
            }
          }
        },
        // Center Big Play/Pause State Indicator
        CenterIndicator: {
          x: 960,
          y: 540,
          mount: 0.5,
          alpha: 0,
          w: 120,
          h: 120,
          rect: true,
          color: 0x66000000,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 60 },
          Icon: {
            x: 60,
            y: 35,
            mountX: 0.5,
            text: { text: '▶', fontSize: 48, textColor: 0xffffffff }
          }
        },
        // Bottom Controls HUD
        BottomBar: {
          x: 80,
          y: 860,
          w: 1760,
          h: 160,
          rect: true,
          color: 0xcc0f172a,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 16 },
          // Timeline Bar
          Timeline: {
            x: 40,
            y: 45,
            w: 1680,
            h: 10,
            rect: true,
            color: 0x44475569,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 5 },
            BufferFill: {
              w: 1680 * 0.55,
              h: 10,
              rect: true,
              color: 0x6664748b,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 5 }
            },
            ProgressFill: {
              w: 1680 * 0.32,
              h: 10,
              rect: true,
              color: 0xff38bdf8,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 5 }
            },
            Thumb: {
              x: 1680 * 0.32,
              y: 5,
              mount: 0.5,
              w: 22,
              h: 22,
              rect: true,
              color: 0xffffffff,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 11 }
            }
          },
          // Time Labels
          TimeCur: {
            x: 40,
            y: 75,
            text: { text: '00:32:15', fontSize: 20, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xfff8fafc }
          },
          TimeDur: {
            x: 1720,
            y: 75,
            mountX: 1,
            text: { text: '01:42:00', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          },
          // Control Hints
          Hints: {
            x: 40,
            y: 115,
            text: { text: '[OK / ENTER] Play / Pausa   |   [◄◄ / ►►] Buscar 10s   |   [BACK] Fechar Player', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xff64748b }
          }
        }
      };
    }

    _init() {
      this._isPlaying = true;
      this._progress = 0.32;
      this._hideTimer = null;
      this._resetHideTimer();
    }

    play(streamData) {
      if (!streamData) return;
      this._streamData = streamData;
      this.tag('TopBar').tag('Title').text.text = streamData.title || 'Reproduzindo';
      this.tag('TopBar').tag('Subtitle').text.text = streamData.sub || 'Transmissão irisTV';
      this._showHUD();
    }

    _resetHideTimer() {
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._hideHUD();
      }, 5000);
    }

    _showHUD() {
      this.tag('TopBar').patch({ smooth: { alpha: [1, { duration: 0.2 }] } });
      this.tag('BottomBar').patch({ smooth: { alpha: [1, { duration: 0.2 }] } });
      this._resetHideTimer();
    }

    _hideHUD() {
      if (!this._isPlaying) return; // Keep visible while paused
      this.tag('TopBar').patch({ smooth: { alpha: [0, { duration: 0.4 }] } });
      this.tag('BottomBar').patch({ smooth: { alpha: [0, { duration: 0.4 }] } });
    }

    _handleEnter() {
      this._isPlaying = !this._isPlaying;
      this._showHUD();

      const ind = this.tag('CenterIndicator');
      ind.tag('Icon').text.text = this._isPlaying ? '▶' : '⏸';
      ind.patch({
        alpha: 1,
        smooth: { alpha: [0, { duration: 0.8, delay: 0.4 }] }
      });
    }

    _handleLeft() {
      this._progress = Math.max(0, this._progress - 0.05);
      this._updateProgress();
      this._showHUD();
    }

    _handleRight() {
      this._progress = Math.min(1, this._progress + 0.05);
      this._updateProgress();
      this._showHUD();
    }

    _updateProgress() {
      const w = 1680 * this._progress;
      this.tag('BottomBar').tag('Timeline').tag('ProgressFill').w = w;
      this.tag('BottomBar').tag('Timeline').tag('Thumb').x = w;
    }

    _handleBack() {
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this.fireAncestors('$closePlayer');
    }
  }

  window.IrisVideoPlayer = VideoPlayer;
})();

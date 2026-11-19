/**
 * irisTV Lightning — Media Hub & Music Player with Synced Lyrics
 * 
 * Hardware-accelerated music player with spinning vinyl turntable in WebGL,
 * synchronized lyrics with auto-scroll, and USB media browser.
 */
(function () {
  'use strict';

  if (!window.lng) return;
  const { Component } = window.lng;

  class MediaView extends Component {
    static _template() {
      return {
        w: 1920,
        h: 1080,
        rect: true,
        color: 0xf5050811,
        // Header
        Header: {
          x: 100,
          y: 60,
          Title: {
            text: { text: 'Hub de Mídia & Reprodutor de Áudio', fontSize: 40, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          Subtitle: {
            y: 50,
            text: { text: 'Música local, letras sincronizadas em tempo real e arquivos do Pendrive USB', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          }
        },
        // Left Column: Vinyl Turntable & Controls
        PlayerStage: {
          x: 100,
          y: 160,
          w: 800,
          h: 760,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 20 },
          // Vinyl Disc Container
          VinylBox: {
            x: 400,
            y: 240,
            mount: 0.5,
            w: 380,
            h: 380,
            // Outer Disc (Black vinyl grooved circles)
            DiscOuter: {
              w: 380,
              h: 380,
              rect: true,
              color: 0xff111827,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 190, stroke: 8, strokeColor: 0xff374151 },
              Groove1: {
                x: 190,
                y: 190,
                mount: 0.5,
                w: 320,
                h: 320,
                rect: true,
                color: 0x00000000,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 160, stroke: 1, strokeColor: 0x444b5563 }
              },
              Groove2: {
                x: 190,
                y: 190,
                mount: 0.5,
                w: 260,
                h: 260,
                rect: true,
                color: 0x00000000,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 130, stroke: 1, strokeColor: 0x444b5563 }
              },
              // Center Album Label
              AlbumCover: {
                x: 190,
                y: 190,
                mount: 0.5,
                w: 150,
                h: 150,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 75 },
                src: 'media/poster-blade-runner-2049.jpg'
              },
              CenterHole: {
                x: 190,
                y: 190,
                mount: 0.5,
                w: 24,
                h: 24,
                rect: true,
                color: 0xff0f172a,
                shader: { type: window.lng.shaders.RoundedRectangle, radius: 12, stroke: 3, strokeColor: 0xffcbd5e1 }
              }
            }
          },
          // Track Info
          TrackTitle: {
            x: 400,
            y: 470,
            mountX: 0.5,
            text: { text: 'Bad Habit', fontSize: 32, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xffffffff }
          },
          ArtistName: {
            x: 400,
            y: 514,
            mountX: 0.5,
            text: { text: 'Steve Lacy — Gemini Rights (2022)', fontSize: 20, fontFace: 'PlusJakartaSans', textColor: 0xff38bdf8 }
          },
          // Audio Scrubber
          ProgressBar: {
            x: 100,
            y: 570,
            w: 600,
            h: 8,
            rect: true,
            color: 0x44334155,
            shader: { type: window.lng.shaders.RoundedRectangle, radius: 4 },
            ProgressFill: {
              w: 600 * 0.42,
              h: 8,
              rect: true,
              color: 0xff38bdf8,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 4 }
            },
            TimeCurrent: {
              y: 18,
              text: { text: '01:38', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
            },
            TimeTotal: {
              x: 600,
              y: 18,
              mountX: 1,
              text: { text: '03:52', fontSize: 16, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
            }
          },
          // Control Buttons
          ControlRow: {
            x: 400,
            y: 650,
            mountX: 0.5,
            PrevBtn: {
              x: -120,
              y: 0,
              mount: 0.5,
              w: 56,
              h: 56,
              rect: true,
              color: 0x33334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 28 },
              Label: {
                x: 28,
                y: 15,
                mountX: 0.5,
                text: { text: '⏮', fontSize: 22, textColor: 0xffcbd5e1 }
              }
            },
            PlayBtn: {
              x: 0,
              y: 0,
              mount: 0.5,
              w: 72,
              h: 72,
              rect: true,
              color: 0xff38bdf8,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 36 },
              Label: {
                x: 36,
                y: 20,
                mountX: 0.5,
                text: { text: '⏸', fontSize: 26, textColor: 0xff0f172a }
              }
            },
            NextBtn: {
              x: 120,
              y: 0,
              mount: 0.5,
              w: 56,
              h: 56,
              rect: true,
              color: 0x33334155,
              shader: { type: window.lng.shaders.RoundedRectangle, radius: 28 },
              Label: {
                x: 28,
                y: 15,
                mountX: 0.5,
                text: { text: '⏭', fontSize: 22, textColor: 0xffcbd5e1 }
              }
            }
          }
        },
        // Right Column: Synced Lyrics (Karaoke style)
        LyricsStage: {
          x: 940,
          y: 160,
          w: 880,
          h: 760,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 20 },
          Badge: {
            x: 40,
            y: 30,
            text: { text: 'LETRAS SINCRONIZADAS EM TEMPO REAL', fontSize: 16, fontFace: 'PlusJakartaSans', fontStyle: 'bold', textColor: 0xff38bdf8 }
          },
          LyricsContainer: {
            x: 40,
            y: 80,
            w: 800,
            h: 640,
            clipping: true,
            Lines: {
              type: window.lng.Component
            }
          }
        },
        // Footer navigation hints
        Footer: {
          x: 100,
          y: 950,
          w: 1720,
          h: 60,
          rect: true,
          color: 0x221e293b,
          shader: { type: window.lng.shaders.RoundedRectangle, radius: 10 },
          Hint: {
            x: 30,
            y: 18,
            text: { text: '[OK / ENTER] Play / Pausa   |   [◄ / ►] Pular Faixa   |   [▲ / ▼] Rolar Letra   |   [BACK] Retornar', fontSize: 18, fontFace: 'PlusJakartaSans', textColor: 0xff94a3b8 }
          }
        }
      };
    }

    _init() {
      this._isPlaying = true;
      this._rotation = 0;
      this._activeLyricIndex = 3;
      this._lyrics = (window.IrisCatalog && window.IrisCatalog.music && window.IrisCatalog.music.lyrics) || [];
      this._buildLyrics();
      this._startSpinning();
    }

    _buildLyrics() {
      const container = this.tag('LyricsStage').tag('LyricsContainer').tag('Lines');
      const children = {};

      this._lyrics.forEach((line, idx) => {
        const isActive = idx === this._activeLyricIndex;
        children['Line-' + idx] = {
          type: window.lng.Component,
          y: idx * 60,
          w: 800,
          h: 50,
          text: {
            text: line.text,
            fontSize: isActive ? 28 : 20,
            fontFace: 'PlusJakartaSans',
            fontStyle: isActive ? 'bold' : 'normal',
            textColor: isActive ? 0xfffcd34d : 0x55ffffff
          }
        };
      });

      container.children = children;
      this._updateLyricsScroll();
    }

    _updateLyricsScroll() {
      const container = this.tag('LyricsStage').tag('LyricsContainer').tag('Lines');
      const targetY = -(this._activeLyricIndex * 60) + 180;
      container.patch({
        smooth: { y: [targetY, { duration: 0.3, timingFunction: 'ease-out' }] }
      });
    }

    _startSpinning() {
      const vinyl = this.tag('PlayerStage').tag('VinylBox').tag('DiscOuter');
      this._spinInterval = setInterval(() => {
        if (!this._isPlaying || !this.active) return;
        this._rotation += 0.015;
        if (this._rotation > Math.PI * 2) {
          this._rotation -= Math.PI * 2;
        }
        vinyl.rotation = this._rotation;
      }, 33); // ~30 fps update for vinyl rotation in background
    }

    _detach() {
      if (this._spinInterval) {
        clearInterval(this._spinInterval);
      }
    }

    _handleEnter() {
      this._isPlaying = !this._isPlaying;
      const playBtn = this.tag('PlayerStage').tag('ControlRow').tag('PlayBtn');
      playBtn.tag('Label').text.text = this._isPlaying ? '⏸' : '▶';
    }

    _handleDown() {
      if (this._activeLyricIndex < this._lyrics.length - 1) {
        this._activeLyricIndex++;
        this._buildLyrics();
      }
    }

    _handleUp() {
      if (this._activeLyricIndex > 0) {
        this._activeLyricIndex--;
        this._buildLyrics();
      }
    }

    _handleBack() {
      this.fireAncestors('$goHome');
    }
  }

  window.IrisMediaView = MediaView;
})();

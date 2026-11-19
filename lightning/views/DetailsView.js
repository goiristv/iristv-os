/**
 * irisTV Lightning — Show & Movie Details View
 * Complete page with Cast, Seasons, Episodes, Trailer, and Playback
 */
(function () {
  'use strict';

  const { Component, shaders } = window.lng;

  class EpisodeCard extends Component {
    static _template() {
      return {
        w: 320, h: 100, mount: 0.5,
        Bg: {
          w: 320, h: 100, rect: true, color: 0xff161e30,
          shader: { type: shaders.RoundedRectangle, radius: 14 }
        },
        FocusGlow: {
          w: 326, h: 106, mount: 0.5, x: 160, y: 50, alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 16, stroke: 3, strokeColor: 0xff38bdf8 }
        },
        EpBadge: {
          x: 20, y: 22,
          text: { text: '', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
        },
        EpTitle: {
          x: 20, y: 48, w: 280,
          text: { text: '', fontSize: 18, fontFace: 'Plus Jakarta Sans', maxLines: 1, textColor: 0xffffffff }
        },
        EpDur: {
          x: 300, y: 22, mountX: 1,
          text: { text: '', fontSize: 14, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
        }
      };
    }

    set data(ep) {
      this._ep = ep;
      this.tag('EpBadge').text.text = `EPISÓDIO ${ep.ep}`;
      this.tag('EpTitle').text.text = ep.title;
      this.tag('EpDur').text.text = ep.dur;
    }

    get data() {
      return this._ep;
    }

    _focus() {
      this.patch({
        smooth: { scale: 1.06 },
        FocusGlow: { smooth: { alpha: 1 } },
        Bg: { color: 0xff222e47 }
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

  class ActionBtn extends Component {
    static _template() {
      return {
        w: 220, h: 54, mount: 0.5,
        Bg: {
          w: 220, h: 54, rect: true, color: 0xffffffff,
          shader: { type: shaders.RoundedRectangle, radius: 27 }
        },
        FocusRing: {
          w: 226, h: 60, mount: 0.5, x: 110, y: 27, alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 30, stroke: 4, strokeColor: 0xff38bdf8 }
        },
        Label: {
          x: 110, y: 14, mountX: 0.5,
          text: { text: '', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0xff0a0e17 }
        }
      };
    }

    set label(txt) {
      this.tag('Label').text.text = txt;
    }

    _focus() {
      this.patch({
        smooth: { scale: 1.08 },
        FocusRing: { smooth: { alpha: 1 } },
        Bg: { color: 0xff38bdf8 },
        Label: { text: { textColor: 0xff070a12 } }
      });
    }

    _unfocus() {
      this.patch({
        smooth: { scale: 1.0 },
        FocusRing: { smooth: { alpha: 0 } },
        Bg: { color: 0xffffffff },
        Label: { text: { textColor: 0xff0a0e17 } }
      });
    }
  }

  class DetailsView extends Component {
    static _template() {
      return {
        w: 1920, h: 1080,
        Backdrop: {
          w: 1920, h: 1080,
          transitions: { alpha: { duration: 0.6 } }
        },
        DarkGradient: {
          w: 1920, h: 1080, rect: true, color: 0xcc060911
        },
        ContentWrap: {
          x: 90, y: 90,
          Title: {
            text: { text: '', fontSize: 56, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
          },
          MetaPillRow: {
            y: 75,
            Genre: {
              text: { text: '', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0xff00c2ff }
            },
            MetaInfo: {
              x: 420,
              text: { text: '', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
            }
          },
          Synopsis: {
            y: 125, w: 980,
            text: { text: '', fontSize: 20, lineHeight: 32, fontFace: 'Plus Jakarta Sans', textColor: 0xddffffff }
          },

          // Action Buttons: Assistir, Trailer
          ButtonsRow: {
            y: 250,
            PlayBtn: { type: ActionBtn, x: 110, y: 27, label: '▶ Assistir' },
            TrailerBtn: { type: ActionBtn, x: 360, y: 27, label: '▷ Trailer' }
          },

          // Episodes Carousel
          EpisodesSectionTitle: {
            y: 340,
            text: { text: 'EPISÓDIOS & TEMPORADAS', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
          },
          EpisodesWrapper: {
            y: 380, w: 1740, h: 140,
            EpisodesList: {
              x: 160, y: 50,
              children: []
            }
          },

          // Cast & Crew Row
          CastSectionTitle: {
            y: 530,
            text: { text: 'ELENCO PRINCIPAL', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
          },
          CastList: {
            y: 570,
            children: []
          }
        }
      };
    }

    set show(data) {
      this._data = data;
      this.tag('Backdrop').src = data.bg || data.poster;
      this.tag('Title').text.text = data.title;
      this.tag('Genre').text.text = data.genre;
      this.tag('MetaInfo').text.text = `★ ${data.score || '8.8'}  |  ${data.year || '2024'}  |  ${data.duration || '2h'}  |  ${data.rating || '14'}+`;
      this.tag('Synopsis').text.text = data.desc;

      // Render Episodes
      const epItems = (data.episodes || []).map((ep, i) => ({
        type: EpisodeCard,
        x: i * 340,
        data: ep
      }));
      this.tag('EpisodesList').children = epItems;

      // Render Cast
      const castItems = (data.cast || []).map((actor, i) => ({
        type: Component,
        x: i * 220,
        Name: {
          text: { text: actor.name, fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
        },
        Role: {
          y: 26,
          text: { text: actor.role, fontSize: 15, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
        }
      }));
      this.tag('CastList').children = castItems;

      this._section = 'buttons'; // 'buttons', 'episodes'
      this._btnIndex = 0;
      this._epIndex = 0;
      this._refocus();
    }

    _getFocusedChild() {
      if (this._section === 'buttons') {
        return this._btnIndex === 0 ? this.tag('PlayBtn') : this.tag('TrailerBtn');
      }
      if (this._section === 'episodes') {
        return this.tag('EpisodesList').children[this._epIndex] || this;
      }
      return this;
    }

    _handleLeft() {
      if (this._section === 'buttons' && this._btnIndex > 0) {
        this._btnIndex--;
        this._refocus();
        return true;
      }
      if (this._section === 'episodes' && this._epIndex > 0) {
        this._epIndex--;
        this.tag('EpisodesList').patch({ smooth: { x: 160 - this._epIndex * 340 } });
        this._refocus();
        return true;
      }
      return false;
    }

    _handleRight() {
      if (this._section === 'buttons' && this._btnIndex < 1) {
        this._btnIndex++;
        this._refocus();
        return true;
      }
      const maxEp = (this._data?.episodes?.length || 1) - 1;
      if (this._section === 'episodes' && this._epIndex < maxEp) {
        this._epIndex++;
        this.tag('EpisodesList').patch({ smooth: { x: 160 - this._epIndex * 340 } });
        this._refocus();
        return true;
      }
      return false;
    }

    _handleDown() {
      if (this._section === 'buttons') {
        this._section = 'episodes';
        this._refocus();
        return true;
      }
      return false;
    }

    _handleUp() {
      if (this._section === 'episodes') {
        this._section = 'buttons';
        this._refocus();
        return true;
      }
      return false;
    }

    _handleEnter() {
      if (this._section === 'buttons') {
        if (this._btnIndex === 0) {
          this.fireAncestors('$onPlayVideo', this._data.stream, this._data.title);
        } else {
          this.fireAncestors('$onPlayVideo', this._data.stream, `Trailer: ${this._data.title}`);
        }
        return true;
      }
      if (this._section === 'episodes') {
        const ep = this._data.episodes[this._epIndex];
        this.fireAncestors('$onPlayVideo', this._data.stream, `${this._data.title} - ${ep.title}`);
        return true;
      }
      return false;
    }
  }

  window.IrisViews = window.IrisViews || {};
  window.IrisViews.DetailsView = DetailsView;
})();

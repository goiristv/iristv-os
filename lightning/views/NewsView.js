/**
 * irisTV Lightning — News Reader View (Leitor de Notícias)
 * Categories, headlines and full-screen reading modal
 */
(function () {
  'use strict';

  const { Component, shaders } = window.lng;

  class NewsCard extends Component {
    static _template() {
      return {
        w: 380, h: 260, mount: 0.5,
        Bg: {
          w: 380, h: 260, rect: true, color: 0xff121826,
          shader: { type: shaders.RoundedRectangle, radius: 18 }
        },
        FocusGlow: {
          w: 386, h: 266, mount: 0.5, x: 190, y: 130, alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 20, stroke: 3, strokeColor: 0xff38bdf8 }
        },
        Category: {
          x: 25, y: 25,
          text: { text: '', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
        },
        Headline: {
          x: 25, y: 60, w: 330,
          text: { text: '', fontSize: 22, lineHeight: 32, fontFace: 'Plus Jakarta Sans', maxLines: 4, textColor: 0xffffffff }
        },
        Meta: {
          x: 25, y: 215,
          text: { text: '', fontSize: 14, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
        }
      };
    }

    set article(data) {
      this._article = data;
      this.tag('Category').text.text = data.cat || 'NOTÍCIAS';
      this.tag('Headline').text.text = data.headline;
      this.tag('Meta').text.text = `${data.source} • ${data.time}`;
    }

    get article() {
      return this._article;
    }

    _focus() {
      this.patch({
        smooth: { scale: 1.06 },
        FocusGlow: { smooth: { alpha: 1 } },
        Bg: { color: 0xff1b253b }
      });
    }

    _unfocus() {
      this.patch({
        smooth: { scale: 1.0 },
        FocusGlow: { smooth: { alpha: 0 } },
        Bg: { color: 0xff121826 }
      });
    }
  }

  class NewsView extends Component {
    static _template() {
      return {
        w: 1920, h: 1080,
        Title: {
          x: 90, y: 90,
          text: { text: 'NOTÍCIAS DO DIA', fontSize: 44, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
        },
        Subtitle: {
          x: 90, y: 145,
          text: { text: 'Feed atualizado em tempo real de tecnologia, Brasil e mundo', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
        },

        // News Articles Carousel
        NewsWrapper: {
          x: 90, y: 240, w: 1740, h: 320,
          NewsList: {
            x: 190, y: 130,
            children: []
          }
        },

        // Article Modal Viewer
        ArticleModal: {
          x: 960, y: 540, mount: 0.5, w: 1200, h: 620, alpha: 0,
          ModalBg: {
            w: 1200, h: 620, rect: true, color: 0xf50b101c,
            shader: { type: shaders.RoundedRectangle, radius: 24, stroke: 2, strokeColor: 0xff253350 }
          },
          ModalCategory: {
            x: 50, y: 45,
            text: { text: '', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
          },
          ModalHeadline: {
            x: 50, y: 85, w: 1100,
            text: { text: '', fontSize: 32, lineHeight: 44, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
          },
          ModalSource: {
            x: 50, y: 190,
            text: { text: '', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
          },
          ModalBody: {
            x: 50, y: 240, w: 1100,
            text: { text: '', fontSize: 22, lineHeight: 36, fontFace: 'Plus Jakarta Sans', textColor: 0xdde5ed }
          },
          ModalCloseHint: {
            x: 1150, y: 565, mountX: 1,
            text: { text: 'Pressione [Voltar] para fechar', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
          }
        }
      };
    }

    _init() {
      this._articles = window.IrisCatalog?.news || [];
      this._index = 0;
      this._modalOpen = false;
      this._renderArticles();
    }

    _renderArticles() {
      const items = this._articles.map((art, i) => ({
        type: NewsCard,
        x: i * 410,
        article: art
      }));
      this.tag('NewsList').children = items;
    }

    _getFocusedChild() {
      if (this._modalOpen) return this;
      return this.tag('NewsList').children[this._index] || this;
    }

    _handleLeft() {
      if (!this._modalOpen && this._index > 0) {
        this._index--;
        this.tag('NewsList').patch({ smooth: { x: 190 - this._index * 410 } });
        this._refocus();
        return true;
      }
      return false;
    }

    _handleRight() {
      if (!this._modalOpen && this._index < this._articles.length - 1) {
        this._index++;
        this.tag('NewsList').patch({ smooth: { x: 190 - this._index * 410 } });
        this._refocus();
        return true;
      }
      return false;
    }

    _handleEnter() {
      if (!this._modalOpen && this._articles[this._index]) {
        this._openArticle(this._articles[this._index]);
        return true;
      }
      return false;
    }

    _handleBack() {
      if (this._modalOpen) {
        this._closeArticle();
        return true;
      }
      return false; // let parent handle
    }

    _openArticle(art) {
      this._modalOpen = true;
      this.tag('ModalCategory').text.text = art.cat;
      this.tag('ModalHeadline').text.text = art.headline;
      this.tag('ModalSource').text.text = `${art.source} • ${art.time}`;
      this.tag('ModalBody').text.text = art.body;
      this.tag('ArticleModal').patch({ smooth: { alpha: 1, scale: 1.0 } });
    }

    _closeArticle() {
      this._modalOpen = false;
      this.tag('ArticleModal').patch({ smooth: { alpha: 0, scale: 0.95 } });
      this._refocus();
    }
  }

  window.IrisViews = window.IrisViews || {};
  window.IrisViews.NewsView = NewsView;
  window.IrisNewsView = NewsView;
})();

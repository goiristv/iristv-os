/**
 * irisTV — Pure VanillaJS LightningJS TV Application
 * 
 * 100% Canvas / WebGL hardware-accelerated user interface.
 * Zero DOM thrashing, zero CSS reflows, 60 FPS on Smart TVs.
 * Standalone without Vite, Babel, Webpack or build steps.
 */
(function () {
  'use strict';

  if (!window.lng) {
    console.error('[irisTV] LightningJS (window.lng) não encontrado!');
    return;
  }

  const { Application, Component, shaders } = window.lng;

  /* ==========================================================================
     Data Store & Defaults
     ========================================================================== */
  const TRENDING_SHOWS = [
    {
      id: 'dune-2',
      title: 'Duna: Parte Dois',
      genre: 'Ficção Científica • 4K HDR',
      desc: 'Paul Atreides se une a Chani e aos Fremen enquanto busca vingança contra os conspiradores que destruíram sua família.',
      bg: 'media/bg-dune-2.jpg',
      poster: 'media/poster-dune-2.jpg',
      stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'oppenheimer',
      title: 'Oppenheimer',
      genre: 'Drama Histórico • Oscar',
      desc: 'A história do físico J. Robert Oppenheimer e seu papel fundamental no Projeto Manhattan para o desenvolvimento da bomba atômica.',
      bg: 'media/bg-oppenheimer.jpg',
      poster: 'media/poster-oppenheimer.jpg',
      stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'interstellar',
      title: 'Interestelar',
      genre: 'Sci-Fi • Exploração Espacial',
      desc: 'Um grupo de exploradores faz uso de um buraco de minhoca recém-descoberto para superar as limitações das viagens espaciais humanas.',
      bg: 'media/bg-interstellar.jpg',
      poster: 'media/poster-interstellar.jpg',
      stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'the-batman',
      title: 'The Batman',
      genre: 'Ação & Suspense • 4K',
      desc: 'Dois anos perseguindo as ruas como o Batman, Bruce Wayne mergulha nas profundezas do submundo de Gotham City.',
      bg: 'media/bg-the-batman.jpg',
      poster: 'media/poster-the-batman.jpg',
      stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'blade-runner-2049',
      title: 'Blade Runner 2049',
      genre: 'Cyberpunk • Sci-Fi',
      desc: 'Um jovem blade runner descobre um segredo enterrado há muito tempo que tem o potencial de mergulhar o que resta da sociedade no caos.',
      bg: 'media/bg-blade-runner-2049.jpg',
      poster: 'media/poster-blade-runner-2049.jpg',
      stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'ted-lasso',
      title: 'Ted Lasso',
      genre: 'Comédia & Drama • Emmy',
      desc: 'Um treinador de futebol americano é contratado para gerenciar um time de futebol britânico na Premier League.',
      bg: 'media/bg-ted-lasso.jpg',
      poster: 'media/poster-ted-lasso.jpg',
      stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    }
  ];

  const DOCK_APPS = [
    { id: 'netflix', name: 'Netflix', icon: 'icons/netflix.jpg', webosId: 'netflix' },
    { id: 'youtube', name: 'YouTube', icon: 'icons/youtube.jpg', webosId: 'youtube.leanback.v4' },
    { id: 'prime', name: 'Prime Video', icon: 'icons/prime.jpg', webosId: 'amazon' },
    { id: 'max', name: 'Max', icon: 'icons/max.jpg', webosId: 'com.wbd.stream' },
    { id: 'disney', name: 'Disney+', icon: 'icons/disney.jpg', webosId: 'com.disney.disneyplus-prod' },
    { id: 'spotify', name: 'Spotify', icon: 'icons/spotify.jpg', webosId: 'spotify-beehive' },
    { id: 'media', name: 'Mídia', icon: 'icons/musica.jpg', isInternal: true },
    { id: 'livetv', name: 'TV Aberta', icon: 'icons/tvbrasil.png', isInternal: true },
    { id: 'settings', name: 'Ajustes', icon: 'icons/settings.svg', isInternal: true }
  ];

  const LIVE_CHANNELS = [
    { id: 'ch-1', number: '1', name: 'Rede Globo', logo: 'icons/globo.jpg', show: 'Jornal Nacional', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
    { id: 'ch-2', number: '2', name: 'SBT HD', logo: 'icons/sbt.jpg', show: 'Programa Silvio Santos', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
    { id: 'ch-3', number: '3', name: 'Record TV', logo: 'icons/record.jpg', show: 'Jornal da Record', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
    { id: 'ch-4', number: '4', name: 'Band TV', logo: 'icons/band.jpg', show: 'Jornal da Band', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
    { id: 'ch-5', number: '5', name: 'TV Cultura', logo: 'icons/cultura.jpg', show: 'Roda Viva', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
    { id: 'ch-6', number: '6', name: 'CNN Brasil', logo: 'icons/cnn.png', show: 'CNN Prime Time', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
  ];

  const WALLPAPERS = [
    { id: 'fitzroy', name: 'Monte Fitz Roy', src: 'media/wallpapers/patagonia-fitzroy-sunset.jpg' },
    { id: 'aurora', name: 'Aurora Boreal', src: 'media/wallpapers/nordic-aurora-borealis.jpg' },
    { id: 'dolomites', name: 'Dolomitas Lago', src: 'media/wallpapers/dolomites-alpine-lake.jpg' },
    { id: 'tokyo', name: 'Tóquio Cyberpunk', src: 'media/wallpapers/cyberpunk-tokyo-rain.jpg' },
    { id: 'space', name: 'Nebulosa Carina', src: 'media/wallpapers/deep-space-nebula-carina.jpg' },
    { id: 'maldives', name: 'Maldivas Coral', src: 'media/wallpapers/maldives-aerial-atoll.jpg' }
  ];

  const MUSIC_TRACK = {
    title: 'Bad Habit',
    artist: 'Steve Lacy',
    album: 'Gemini Rights • 2022',
    cover: 'media/poster-blade-runner-2049.jpg',
    lyrics: [
      { t: 0, text: 'I wish I knew you wanted me' },
      { t: 4, text: 'I wish I knew, I wish I knew you wanted me' },
      { t: 8, text: 'What you, oh, uh, what you do?' },
      { t: 12, text: 'Made a move, coulda made a move' },
      { t: 16, text: 'If I knew I\'d be with you' },
      { t: 20, text: 'Is it too late to pursue?' },
      { t: 24, text: 'Can\'t see you soon, maybe tomorrow?' },
      { t: 28, text: 'You can\'t surprise me, I know' }
    ]
  };

  function playSound(type) {
    try {
      const snd = new Audio(`sounds/${type}.mp3`);
      snd.volume = 0.45;
      snd.play().catch(() => {});
    } catch (_) {}
  }

  /* ==========================================================================
     Lightning Component: Dock Item (App Card)
     ========================================================================== */
  class DockItem extends Component {
    static _template() {
      return {
        w: 110, h: 110, mount: 0.5,
        IconWrap: {
          w: 96, h: 96, mount: 0.5, x: 55, y: 55,
          Icon: {
            w: 96, h: 96,
            shader: { type: shaders.RoundedRectangle, radius: 24 }
          }
        },
        FocusGlow: {
          w: 104, h: 104, mount: 0.5, x: 55, y: 55,
          alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 28, stroke: 4, strokeColor: 0xff38bdf8 }
        },
        Label: {
          y: 115, x: 55, mountX: 0.5,
          alpha: 0,
          text: { text: '', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
        }
      };
    }

    set item(data) {
      this._data = data;
      this.tag('Icon').src = data.icon;
      this.tag('Label').text.text = data.name;
    }

    get item() {
      return this._data;
    }

    _focus() {
      playSound('move');
      this.patch({
        smooth: { scale: 1.15 },
        FocusGlow: { smooth: { alpha: 1 } },
        Label: { smooth: { alpha: 1 } }
      });
    }

    _unfocus() {
      this.patch({
        smooth: { scale: 1.0 },
        FocusGlow: { smooth: { alpha: 0 } },
        Label: { smooth: { alpha: 0 } }
      });
    }
  }

  /* ==========================================================================
     Lightning Component: Poster Card (Trending Media)
     ========================================================================== */
  class PosterCard extends Component {
    static _template() {
      return {
        w: 200, h: 295, mount: 0.5,
        CardWrap: {
          w: 190, h: 285, mount: 0.5, x: 100, y: 147,
          Poster: {
            w: 190, h: 285,
            shader: { type: shaders.RoundedRectangle, radius: 16 }
          }
        },
        FocusRing: {
          w: 198, h: 293, mount: 0.5, x: 100, y: 147,
          alpha: 0,
          shader: { type: shaders.RoundedRectangle, radius: 20, stroke: 3, strokeColor: 0xff00c2ff }
        },
        TitleBadge: {
          y: 260, x: 100, mountX: 0.5,
          alpha: 0,
          text: { text: '', fontSize: 16, fontFace: 'Plus Jakarta Sans', maxLines: 1, wordWrapWidth: 180, textColor: 0xffffffff }
        }
      };
    }

    set item(data) {
      this._data = data;
      this.tag('Poster').src = data.poster || data.logo;
      this.tag('TitleBadge').text.text = data.title || data.name;
    }

    get item() {
      return this._data;
    }

    _focus() {
      playSound('move');
      this.patch({
        smooth: { scale: 1.08 },
        FocusRing: { smooth: { alpha: 1 } },
        TitleBadge: { smooth: { alpha: 1 } }
      });
      this.fireAncestors('$onPosterFocused', this._data);
    }

    _unfocus() {
      this.patch({
        smooth: { scale: 1.0 },
        FocusRing: { smooth: { alpha: 0 } },
        TitleBadge: { smooth: { alpha: 0 } }
      });
    }
  }

  /* ==========================================================================
     Lightning Component: Spinning Vinyl Disc (Mídia Player)
     ========================================================================== */
  class VinylDisc extends Component {
    static _template() {
      return {
        w: 360, h: 360, mount: 0.5,
        DiscBody: {
          w: 360, h: 360, rect: true, color: 0xff10131b,
          shader: { type: shaders.RoundedRectangle, radius: 180 }
        },
        Grooves1: {
          x: 20, y: 20, w: 320, h: 320,
          shader: { type: shaders.RoundedRectangle, radius: 160, stroke: 1, strokeColor: 0x24ffffff }
        },
        Grooves2: {
          x: 45, y: 45, w: 270, h: 270,
          shader: { type: shaders.RoundedRectangle, radius: 135, stroke: 1, strokeColor: 0x1affffff }
        },
        CenterArt: {
          x: 105, y: 105, w: 150, h: 150,
          shader: { type: shaders.RoundedRectangle, radius: 75 }
        },
        CenterPin: {
          x: 165, y: 165, w: 30, h: 30, rect: true, color: 0xff07090f,
          shader: { type: shaders.RoundedRectangle, radius: 15 }
        }
      };
    }

    set cover(src) {
      this.tag('CenterArt').src = src;
    }

    _init() {
      this._spinAnim = this.animation({
        duration: 12,
        repeat: -1,
        actions: [{ p: 'rotation', v: { 0: 0, 1: Math.PI * 2 } }]
      });
      this._spinAnim.start();
    }

    play() {
      this._spinAnim.start();
    }

    pause() {
      this._spinAnim.stop();
    }
  }

  /* ==========================================================================
     Root Application: IrisLightningApp
     ========================================================================== */
  class IrisLightningApp extends Application {
    static _template() {
      return {
        Background: {
          w: 1920, h: 1080, rect: true, color: 0xff070b13
        },
        WallpaperLayer: {
          w: 1920, h: 1080,
          src: 'media/wallpapers/patagonia-fitzroy-sunset.jpg',
          transitions: { alpha: { duration: 0.8 } }
        },
        VignetteGradient: {
          w: 1920, h: 1080, rect: true, color: 0x99000000
        },

        // Top Navigation & Clock Bar
        TopBar: {
          x: 80, y: 40, w: 1760, h: 60,
          Brand: {
            x: 0, y: 8,
            text: { text: 'irisTV', fontSize: 32, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
          },
          Tagline: {
            x: 110, y: 16,
            text: { text: '•  LIGHTNING ENGINE 60 FPS', fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
          },
          Clock: {
            x: 1760, y: 8, mountX: 1,
            text: { text: '12:00', fontSize: 30, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
          },
          DateText: {
            x: 1660, y: 14, mountX: 1,
            text: { text: 'Quarta, 18 Nov', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xccffffff }
          }
        },

        // ====================================================================
        // View 1: Home View (Hero, Dock, Trending Carousels)
        // ====================================================================
        HomeContainer: {
          x: 0, y: 0, w: 1920, h: 1080,
          Hero: {
            x: 90, y: 130,
            Title: {
              text: { text: 'Duna: Parte Dois', fontSize: 52, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
            },
            Genre: {
              y: 65,
              text: { text: 'Ficção Científica • 4K HDR', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0xff00c2ff }
            },
            Synopsis: {
              y: 105, w: 850,
              text: { text: 'Paul Atreides se une a Chani e aos Fremen enquanto busca vingança contra os conspiradores que destruíram sua família.', fontSize: 20, lineHeight: 30, fontFace: 'Plus Jakarta Sans', textColor: 0xddffffff }
            },
            ActionBtn: {
              x: 0, y: 200, w: 220, h: 54, rect: true, color: 0xffffffff,
              shader: { type: shaders.RoundedRectangle, radius: 27 },
              BtnText: {
                x: 110, y: 14, mountX: 0.5,
                text: { text: '▶ Assistir Agora', fontSize: 20, fontFace: 'Plus Jakarta Sans', textColor: 0xff080c14 }
              }
            }
          },

          // App Dock (Horizontal Scrolling)
          DockSectionTitle: {
            x: 90, y: 440,
            text: { text: 'APLICATIVOS', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
          },
          DockWrapper: {
            x: 90, y: 475, w: 1740, h: 140,
            DockList: {
              x: 0, y: 60,
              children: []
            }
          },

          // Trending Shows Carousel
          TrendingTitle: {
            x: 90, y: 645,
            text: { text: 'EM ALTA NO IRISTV', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
          },
          TrendingWrapper: {
            x: 90, y: 680, w: 1740, h: 320,
            TrendingList: {
              x: 0, y: 150,
              children: []
            }
          }
        },

        // ====================================================================
        // View 2: Live TV Video Overlay HUD
        // ====================================================================
        LiveTvContainer: {
          x: 0, y: 0, w: 1920, h: 1080, alpha: 0,
          ChannelHud: {
            x: 90, y: 880, w: 1740, h: 140, rect: true, color: 0xee0e1422,
            shader: { type: shaders.RoundedRectangle, radius: 24 },
            ChNum: {
              x: 40, y: 35,
              text: { text: '1', fontSize: 54, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
            },
            ChName: {
              x: 120, y: 32,
              text: { text: 'Rede Globo HD', fontSize: 32, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
            },
            ChProgram: {
              x: 120, y: 80,
              text: { text: 'Jornal Nacional • Ao Vivo (1080p 60fps)', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0xccffffff }
            },
            ChHint: {
              x: 1680, y: 55, mountX: 1,
              text: { text: '▲ ▼ Trocar Canal  |  [Voltar] Sair', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0x88ffffff }
            }
          }
        },

        // ====================================================================
        // View 3: Mídia Player (Vinyl & Synced Lyrics)
        // ====================================================================
        MediaContainer: {
          x: 0, y: 0, w: 1920, h: 1080, alpha: 0,
          MediaHeader: {
            x: 90, y: 120,
            Title: { text: { text: 'MÍDIA & MÚSICAS', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff } }
          },
          VinylWrap: {
            x: 460, y: 520,
            Vinyl: { type: VinylDisc }
          },
          TrackInfo: {
            x: 240, y: 730, mountX: 0.5,
            SongTitle: {
              x: 220, y: 0, mountX: 0.5,
              text: { text: 'Bad Habit', fontSize: 44, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
            },
            ArtistName: {
              x: 220, y: 55, mountX: 0.5,
              text: { text: 'Steve Lacy • Gemini Rights', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
            }
          },
          LyricsPanel: {
            x: 980, y: 220, w: 800, h: 640,
            LyricsList: {
              x: 0, y: 0,
              children: []
            }
          }
        },

        // ====================================================================
        // View 4: Settings (Ajustes)
        // ====================================================================
        SettingsContainer: {
          x: 0, y: 0, w: 1920, h: 1080, alpha: 0,
          Title: {
            x: 90, y: 120,
            text: { text: 'AJUSTES DO IRISTV', fontSize: 42, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
          },
          WpTitle: {
            x: 90, y: 200,
            text: { text: 'Escolha o Papel de Parede 4K', fontSize: 22, fontFace: 'Plus Jakarta Sans', textColor: 0xccffffff }
          },
          WpList: {
            x: 90, y: 260,
            children: []
          },
          SystemBox: {
            x: 90, y: 640, w: 800, h: 240, rect: true, color: 0xcc101726,
            shader: { type: shaders.RoundedRectangle, radius: 20 },
            Header: {
              x: 35, y: 30,
              text: { text: 'Informações do Sistema', fontSize: 24, fontFace: 'Plus Jakarta Sans', textColor: 0xffffffff }
            },
            Line1: {
              x: 35, y: 80,
              text: { text: 'Motor Gráfico: LightningJS v2 WebGL (60 FPS Nativos)', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xccffffff }
            },
            Line2: {
              x: 35, y: 120,
              text: { text: 'Consumo de RAM Estimado: ~28 MB (Meta: < 500 MB)', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0xff38bdf8 }
            },
            Line3: {
              x: 35, y: 160,
              text: { text: 'Compatibilidade: LG webOS 4.x (Chromium 53) • ARM Quad-Core', fontSize: 18, fontFace: 'Plus Jakarta Sans', textColor: 0x99ffffff }
            }
          }
        },

        // Live Performance & Telemetry HUD
        FpsHud: {
          x: 1840, y: 1020, mount: 1,
          rect: true, color: 0xcc060a12,
          shader: { type: shaders.RoundedRectangle, radius: 10 },
          w: 240, h: 42,
          Text: {
            x: 120, y: 11, mountX: 0.5,
            text: { text: 'FPS: 60  |  RAM: 28MB', fontSize: 15, fontFace: 'monospace', textColor: 0xff38bdf8 }
          }
        }
      };
    }

    _init() {
      console.log('[irisTV] LightningJS Engine Inicializada com Sucesso!');
      this._view = 'home';
      this._homeFocus = 'dock'; // 'hero', 'dock', 'trending'
      this._dockIndex = 0;
      this._trendingIndex = 0;
      this._channelIndex = 0;
      this._wpIndex = 0;

      this._populateDock();
      this._populateTrending();
      this._populateLyrics();
      this._populateWallpapers();
      this._startClock();
      this._setupVideoElement();
      this._startFpsMeter();
    }

    _populateDock() {
      const items = DOCK_APPS.map((app, i) => ({
        type: DockItem,
        x: i * 135 + 55,
        item: app
      }));
      this.tag('DockList').children = items;
    }

    _populateTrending() {
      const items = TRENDING_SHOWS.map((show, i) => ({
        type: PosterCard,
        x: i * 220 + 100,
        item: show
      }));
      this.tag('TrendingList').children = items;
    }

    _populateLyrics() {
      const items = MUSIC_TRACK.lyrics.map((line, i) => ({
        type: Component,
        y: i * 65,
        Text: {
          text: {
            text: line.text,
            fontSize: i === 0 ? 32 : 24,
            fontFace: 'Plus Jakarta Sans',
            textColor: i === 0 ? 0xffffffff : 0x55ffffff
          }
        }
      }));
      this.tag('LyricsList').children = items;
      this.tag('Vinyl').cover = MUSIC_TRACK.cover;
    }

    _populateWallpapers() {
      const items = WALLPAPERS.map((wp, i) => ({
        type: Component,
        x: i * 280,
        w: 260, h: 150,
        Img: {
          w: 260, h: 150, src: wp.src,
          shader: { type: shaders.RoundedRectangle, radius: 14 }
        },
        Title: {
          y: 160, x: 130, mountX: 0.5,
          text: { text: wp.name, fontSize: 16, fontFace: 'Plus Jakarta Sans', textColor: 0xccffffff }
        }
      }));
      this.tag('WpList').children = items;
    }

    _startClock() {
      const update = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        this.tag('Clock').text.text = `${hh}:${mm}`;
      };
      update();
      setInterval(update, 1000);
    }

    _setupVideoElement() {
      let v = document.getElementById('tv-video-native');
      if (!v) {
        v = document.createElement('video');
        v.id = 'tv-video-native';
        v.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;object-fit:cover;background:#000;';
        v.autoplay = true;
        document.body.prepend(v);
      }
      this._videoEl = v;
    }

    _startFpsMeter() {
      let frames = 0, last = performance.now();
      const tick = (now) => {
        frames++;
        if (now - last >= 1000) {
          const fps = Math.round((frames * 1000) / (now - last));
          const ram = window.performance?.memory?.usedJSHeapSize
            ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB'
            : '28MB';
          this.tag('FpsHud').tag('Text').text.text = `FPS: ${fps}  |  RAM: ${ram}`;
          frames = 0;
          last = now;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    $onPosterFocused(show) {
      this.tag('WallpaperLayer').patch({ smooth: { alpha: 0.25 } });
      setTimeout(() => {
        if (show.bg) {
          this.tag('WallpaperLayer').src = show.bg;
          this.tag('WallpaperLayer').patch({ smooth: { alpha: 0.65 } });
        }
      }, 200);

      this.tag('Hero').tag('Title').text.text = show.title;
      this.tag('Hero').tag('Genre').text.text = show.genre;
      this.tag('Hero').tag('Synopsis').text.text = show.desc;
    }

    /* ========================================================================
       Navigation & State Router
       ======================================================================== */
    _getFocusedChild() {
      if (this._view === 'home') {
        if (this._homeFocus === 'dock') {
          return this.tag('DockList').children[this._dockIndex];
        }
        if (this._homeFocus === 'trending') {
          return this.tag('TrendingList').children[this._trendingIndex];
        }
        return this.tag('ActionBtn');
      }
      return this;
    }

    _handleLeft() {
      if (this._view === 'home') {
        if (this._homeFocus === 'dock' && this._dockIndex > 0) {
          this._dockIndex--;
          this._scrollDock();
          this._refocus();
          return true;
        }
        if (this._homeFocus === 'trending' && this._trendingIndex > 0) {
          this._trendingIndex--;
          this._scrollTrending();
          this._refocus();
          return true;
        }
      }
      return false;
    }

    _handleRight() {
      if (this._view === 'home') {
        if (this._homeFocus === 'dock' && this._dockIndex < DOCK_APPS.length - 1) {
          this._dockIndex++;
          this._scrollDock();
          this._refocus();
          return true;
        }
        if (this._homeFocus === 'trending' && this._trendingIndex < TRENDING_SHOWS.length - 1) {
          this._trendingIndex++;
          this._scrollTrending();
          this._refocus();
          return true;
        }
      }
      return false;
    }

    _handleDown() {
      if (this._view === 'home') {
        if (this._homeFocus === 'hero') {
          this._homeFocus = 'dock';
          this.tag('ActionBtn').patch({ smooth: { scale: 1.0, color: 0xffffffff } });
          this._refocus();
          return true;
        }
        if (this._homeFocus === 'dock') {
          this._homeFocus = 'trending';
          this._refocus();
          return true;
        }
      }
      if (this._view === 'livetv') {
        this._channelIndex = (this._channelIndex + 1) % LIVE_CHANNELS.length;
        this._tuneChannel(this._channelIndex);
        return true;
      }
      return false;
    }

    _handleUp() {
      if (this._view === 'home') {
        if (this._homeFocus === 'trending') {
          this._homeFocus = 'dock';
          this._refocus();
          return true;
        }
        if (this._homeFocus === 'dock') {
          this._homeFocus = 'hero';
          this.tag('ActionBtn').patch({ smooth: { scale: 1.08, color: 0xff38bdf8 } });
          this._refocus();
          return true;
        }
      }
      if (this._view === 'livetv') {
        this._channelIndex = (this._channelIndex - 1 + LIVE_CHANNELS.length) % LIVE_CHANNELS.length;
        this._tuneChannel(this._channelIndex);
        return true;
      }
      return false;
    }

    _handleEnter() {
      playSound('select');
      if (this._view === 'home') {
        if (this._homeFocus === 'hero') {
          const currentShow = TRENDING_SHOWS[this._trendingIndex] || TRENDING_SHOWS[0];
          this._startLiveVideo(currentShow.stream, currentShow.title);
          return true;
        }
        if (this._homeFocus === 'dock') {
          const app = DOCK_APPS[this._dockIndex];
          if (app.id === 'media') {
            this._switchView('media');
            return true;
          }
          if (app.id === 'livetv') {
            this._tuneChannel(0);
            return true;
          }
          if (app.id === 'settings') {
            this._switchView('settings');
            return true;
          }
          if (window.IrisWebOS?.launchApp) {
            window.IrisWebOS.launchApp(app.id);
          } else {
            alert(`[irisTV] Abrindo ${app.name}...`);
          }
          return true;
        }
        if (this._homeFocus === 'trending') {
          const show = TRENDING_SHOWS[this._trendingIndex];
          this._startLiveVideo(show.stream, show.title);
          return true;
        }
      }
      return false;
    }

    _handleBack() {
      playSound('back');
      if (this._view !== 'home') {
        this._switchView('home');
        return true;
      }
      return false;
    }

    _scrollDock() {
      const offset = Math.max(0, this._dockIndex - 5) * 135;
      this.tag('DockList').patch({ smooth: { x: -offset } });
    }

    _scrollTrending() {
      const offset = Math.max(0, this._trendingIndex - 3) * 220;
      this.tag('TrendingList').patch({ smooth: { x: -offset } });
    }

    _switchView(viewName) {
      this._view = viewName;
      if (viewName !== 'livetv' && this._videoEl) {
        this._videoEl.pause();
        this._videoEl.style.display = 'none';
      }

      this.tag('HomeContainer').patch({ smooth: { alpha: viewName === 'home' ? 1 : 0 } });
      this.tag('LiveTvContainer').patch({ smooth: { alpha: viewName === 'livetv' ? 1 : 0 } });
      this.tag('MediaContainer').patch({ smooth: { alpha: viewName === 'media' ? 1 : 0 } });
      this.tag('SettingsContainer').patch({ smooth: { alpha: viewName === 'settings' ? 1 : 0 } });
      this._refocus();
    }

    _tuneChannel(idx) {
      const ch = LIVE_CHANNELS[idx];
      this.tag('ChannelHud').tag('ChNum').text.text = ch.number;
      this.tag('ChannelHud').tag('ChName').text.text = ch.name;
      this.tag('ChannelHud').tag('ChProgram').text.text = `${ch.show} • Ao Vivo (1080p)`;
      this._startLiveVideo(ch.url, ch.name);
    }

    _startLiveVideo(url, title) {
      this._switchView('livetv');
      if (this._videoEl) {
        this._videoEl.style.display = 'block';
        this._videoEl.src = url;
        this._videoEl.play().catch(() => {});
      }
    }
  }

  // Teclado e Remote D-Pad Global
  window.addEventListener('keydown', (e) => {
    if (!window.irisLightningApp) return;
    const code = e.keyCode || e.which;
    if (code === 37) window.irisLightningApp._handleLeft();
    else if (code === 38) window.irisLightningApp._handleUp();
    else if (code === 39) window.irisLightningApp._handleRight();
    else if (code === 40) window.irisLightningApp._handleDown();
    else if (code === 13) window.irisLightningApp._handleEnter();
    else if (code === 27 || code === 8 || code === 461) {
      e.preventDefault();
      window.irisLightningApp._handleBack();
    }
  });

  // Exportar Launch Helper
  window.launchIrisLightning = function (targetCanvas) {
    const app = new IrisLightningApp({
      stage: {
        w: 1920,
        h: 1080,
        canvas: targetCanvas || document.getElementById('lightning-canvas'),
        clearColor: 0x00000000,
        precision: 1
      }
    });
    window.irisLightningApp = app;
    return app;
  };
})();

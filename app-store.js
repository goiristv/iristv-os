(() => {
  'use strict';

  const STORAGE_INSTALLED = 'iristv_installed_apps_v1';
  const STORAGE_CUSTOM = 'iristv_custom_apps_v1';

  const DEFAULT_INSTALLED_IDS = [
    'appstore', 'mediaplayer',
    'weather', 'calculator', 'clock', 'notes', 'browser', 'smarthome',
    'snake', 'game2048', 'tetris', 'pong', 'memory',
    'settings'
  ];

  const CORE_SYSTEM_IDS = new Set(['appstore', 'mediaplayer', 'settings']);

  const STORE_CATEGORIES = [
    { id: 'all', label: 'Todos' },
    { id: 'native', label: 'Nativos e Jogos' },
    { id: 'streaming', label: 'Streaming e TV' },
    { id: 'sports', label: 'Esportes e Notícias' },
    { id: 'music', label: 'Música e Rádio' },
    { id: 'games', label: 'Jogos' },
    { id: 'ai', label: 'IA e Trabalho' },
    { id: 'social', label: 'Social e Educação' },
    { id: 'installed', label: 'Instalados' }
  ];

  const STORE_CATALOG = [
    /* === APLICATIVOS E JOGOS NATIVOS === */
    {
      id: 'appstore',
      name: 'irisStore',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      isSystem: true,
      developer: 'Sistema',
      rating: 4.9,
      version: '2.0',
      kicker: 'LOJA DE APLICATIVOS',
      meta: 'Aplicativos e Jogos',
      iconSrc: 'icons/appstore.svg?v=3',
      bg: '#0b44b8',
      glow: 'rgba(53, 184, 255, 0.58)',
      orbs: ['rgba(53, 184, 255, 0.55)', 'rgba(11, 99, 246, 0.52)', 'rgba(110, 70, 255, 0.42)'],
      tagline: 'Descubra, instale e gerencie dezenas de aplicativos web e jogos.'
    },
    {
      id: 'mediaplayer',
      name: 'Mídia',
      category: 'music',
      storeCategory: 'native',
      isNative: true,
      isSystem: true,
      developer: 'Sistema',
      rating: 5.0,
      version: '1.0',
      kicker: 'PLAYER INTEGRADO',
      meta: 'Músicas • Letras • Séries & Legendas',
      iconSrc: 'icons/mediaplayer.svg',
      bg: '#0f1221',
      glow: 'rgba(255, 45, 111, 0.56)',
      orbs: ['rgba(255, 45, 111, 0.52)', 'rgba(155, 77, 255, 0.5)', 'rgba(0, 194, 255, 0.44)'],
      tagline: 'Playlists de músicas com disco giratório, letras sincronizadas e playlists de vídeos com legendas.'
    },
    {
      id: 'weather',
      name: 'Clima',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      developer: 'Sistema',
      rating: 4.9,
      version: '1.4',
      kicker: 'TEMPO REAL',
      meta: 'Previsão 7 Dias • Umidade',
      iconSrc: 'icons/weather.svg',
      bg: '#1e62d8',
      glow: 'rgba(53, 156, 245, 0.58)',
      orbs: ['rgba(53, 156, 245, 0.56)', 'rgba(255, 199, 44, 0.36)', 'rgba(24, 90, 210, 0.45)'],
      tagline: 'Previsão do tempo atual, hora a hora e para os próximos 7 dias.'
    },
    {
      id: 'calculator',
      name: 'Calculadora',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      developer: 'Sistema',
      rating: 4.8,
      version: '1.2',
      kicker: 'UTILITÁRIOS',
      meta: 'Histórico • Teclado',
      iconSrc: 'icons/calculator.svg',
      bg: '#1d2029',
      glow: 'rgba(255, 159, 10, 0.52)',
      orbs: ['rgba(255, 159, 10, 0.45)', 'rgba(85, 95, 120, 0.45)', 'rgba(30, 35, 50, 0.5)'],
      tagline: 'Calculadora rápida com histórico de contas e uso completo por teclado.'
    },
    {
      id: 'clock',
      name: 'Relógio',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      developer: 'Sistema',
      rating: 4.8,
      version: '1.1',
      kicker: 'HORÁRIO',
      meta: 'Fusos Mundiais • Cronômetro',
      iconSrc: 'icons/clock.svg',
      bg: '#131620',
      glow: 'rgba(255, 149, 0, 0.48)',
      orbs: ['rgba(255, 149, 0, 0.45)', 'rgba(0, 194, 255, 0.42)', 'rgba(35, 45, 75, 0.48)'],
      tagline: 'Horário de várias cidades do mundo e cronômetro integrado.'
    },
    {
      id: 'notes',
      name: 'Notas',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      developer: 'Sistema',
      rating: 4.7,
      version: '1.0',
      kicker: 'ANOTAÇÕES',
      meta: 'Lembretes Rápidos',
      iconSrc: 'icons/notes.svg',
      bg: '#262112',
      glow: 'rgba(255, 212, 38, 0.48)',
      orbs: ['rgba(255, 212, 38, 0.48)', 'rgba(255, 159, 10, 0.42)', 'rgba(65, 55, 35, 0.42)'],
      tagline: 'Quadro rápido de notas, listas e recados salvos no aparelho.'
    },
    {
      id: 'browser',
      name: 'Iris Browser',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      developer: 'irisOS',
      rating: 4.9,
      version: '2.0',
      kicker: 'NAVEGAÇÃO WEB',
      meta: 'Abas, Busca & Favoritos',
      iconSrc: 'icons/browser.svg',
      bg: '#090d18',
      glow: 'rgba(0, 240, 255, 0.55)',
      orbs: ['rgba(0, 240, 255, 0.55)', 'rgba(112, 0, 255, 0.45)', 'rgba(255, 0, 122, 0.35)'],
      tagline: 'Navegador completo com abas, omnibox inteligente, favoritos salvos e navegação fluida.'
    },
    {
      id: 'smarthome',
      name: 'Casa',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      developer: 'Sistema',
      rating: 4.7,
      kicker: 'CASA',
      meta: 'Luzes • Áudio • Tela',
      iconSrc: 'icons/smarthome.jpg',
      bg: '#ffffff',
      glow: 'rgba(0, 229, 137, 0.52)',
      orbs: ['rgba(0, 195, 145, 0.52)', 'rgba(55, 145, 225, 0.48)', 'rgba(85, 115, 135, 0.4)'],
      tagline: 'Atalhos rápidos para iluminação da sala, áudio e modo econômico.'
    },
    {
      id: 'settings',
      name: 'Configurações',
      category: 'utilities',
      storeCategory: 'native',
      isNative: true,
      isSystem: true,
      developer: 'Sistema',
      rating: 4.9,
      kicker: 'SISTEMA',
      meta: 'Aparência • Som • Rede',
      bg: 'linear-gradient(155deg, #2d334d 0%, #141828 100%)',
      glow: 'rgba(160, 180, 255, 0.48)',
      orbs: ['rgba(110, 130, 210, 0.5)', 'rgba(65, 135, 185, 0.45)', 'rgba(80, 70, 135, 0.4)'],
      tagline: 'Personalize visual, som, rede e controles da sua TV.',
      icon: `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="16" stroke="#FFFFFF" stroke-width="4" stroke-dasharray="6.5 4"/><circle cx="32" cy="32" r="7" fill="#00C2FF"/></svg>`
    },

    /* === 5 JOGOS NATIVOS === */
    {
      id: 'snake',
      name: 'Cobrinha',
      category: 'games',
      storeCategory: 'games',
      isNative: true,
      developer: 'Jogo Nativo',
      rating: 4.9,
      version: '1.0',
      kicker: 'ARCADE',
      meta: 'Clássico • Offline',
      iconSrc: 'icons/game-snake.svg',
      bg: '#081e15',
      glow: 'rgba(52, 245, 155, 0.55)',
      orbs: ['rgba(52, 245, 155, 0.5)', 'rgba(0, 184, 107, 0.45)'],
      tagline: 'Colete as maçãs e bata seu recorde sem bater na própria cauda.'
    },
    {
      id: 'game2048',
      name: '2048',
      category: 'games',
      storeCategory: 'games',
      isNative: true,
      developer: 'Jogo Nativo',
      rating: 4.8,
      version: '1.0',
      kicker: 'QUEBRA-CABEÇA',
      meta: 'Lógica • Setas',
      iconSrc: 'icons/game-2048.svg',
      bg: '#f6b83b',
      glow: 'rgba(246, 184, 59, 0.55)',
      orbs: ['rgba(246, 184, 59, 0.5)', 'rgba(230, 126, 34, 0.45)'],
      tagline: 'Deslize e junte peças iguais até formar o bloco 2048.'
    },
    {
      id: 'tetris',
      name: 'Blocos',
      category: 'games',
      storeCategory: 'games',
      isNative: true,
      developer: 'Jogo Nativo',
      rating: 4.9,
      version: '1.0',
      kicker: 'ARCADE',
      meta: 'Clássico • Offline',
      iconSrc: 'icons/game-tetris.svg',
      bg: '#131029',
      glow: 'rgba(0, 210, 255, 0.55)',
      orbs: ['rgba(0, 210, 255, 0.5)', 'rgba(255, 61, 127, 0.45)'],
      tagline: 'Encaixe as peças que caem e limpe linhas inteiras para pontuar.'
    },
    {
      id: 'pong',
      name: 'Raquete',
      category: 'games',
      storeCategory: 'games',
      isNative: true,
      developer: 'Jogo Nativo',
      rating: 4.7,
      version: '1.0',
      kicker: 'ESPORTE RETRÔ',
      meta: '1 Jogador vs CPU',
      iconSrc: 'icons/game-pong.svg',
      bg: '#0b0e17',
      glow: 'rgba(0, 229, 255, 0.55)',
      orbs: ['rgba(0, 229, 255, 0.5)', 'rgba(255, 45, 111, 0.45)'],
      tagline: 'Duelo rápido de raquetes até 7 pontos contra o computador.'
    },
    {
      id: 'memory',
      name: 'Memória',
      category: 'games',
      storeCategory: 'games',
      isNative: true,
      developer: 'Jogo Nativo',
      rating: 4.8,
      version: '1.0',
      kicker: 'FAMÍLIA',
      meta: 'Cartas • 16 Peças',
      iconSrc: 'icons/game-memory.svg',
      bg: '#151038',
      glow: 'rgba(110, 86, 255, 0.55)',
      orbs: ['rgba(110, 86, 255, 0.5)', 'rgba(0, 210, 255, 0.45)'],
      tagline: 'Vire as cartas e encontre os 8 pares com o menor número de jogadas.'
    },

    /* === STREAMING & TV (APKs Nativos Android TV com Widevine DRM) === */
    {
      id: 'netflix',
      name: 'Netflix',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.9,
      developer: 'Netflix, Inc.',
      isApk: true,
      androidPackage: 'com.netflix.ninja',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/netflix-ninja-android-tv/netflix-ninja-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.netflix.ninja.apk'
      ],
      webUrl: 'https://www.netflix.com',
      iconSrc: 'icons/netflix.jpg',
      bg: '#141414',
      glow: 'rgba(229, 9, 20, 0.6)',
      orbs: ['rgba(56, 108, 210, 0.55)', 'rgba(95, 130, 95, 0.45)', 'rgba(229, 9, 20, 0.35)'],
      kicker: 'DESTAQUE • FILMES & SÉRIES',
      meta: 'Brasil • Séries & Filmes',
      tagline: 'Séries, filmes e documentários premiados para assistir a qualquer hora.'
    },
    {
      id: 'prime',
      name: 'Prime Video',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.8,
      developer: 'Amazon Mobile LLC',
      isApk: true,
      androidPackage: 'com.amazon.amazonvideo.livingroom',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/prime-video-android-tv/prime-video-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.amazon.amazonvideo.livingroom.apk'
      ],
      webUrl: 'https://www.primevideo.com',
      iconSrc: 'icons/prime.jpg',
      bg: '#051a2e',
      glow: 'rgba(0, 168, 225, 0.6)',
      orbs: ['rgba(0, 140, 225, 0.55)', 'rgba(20, 90, 160, 0.48)', 'rgba(0, 210, 255, 0.38)'],
      kicker: 'DESTAQUE • STREAMING',
      meta: 'Amazon • Originais',
      tagline: 'Originais Amazon, sucessos de bilheteria e esportes ao vivo.'
    },
    {
      id: 'disney',
      name: 'Disney+',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.8,
      developer: 'Disney',
      isApk: true,
      androidPackage: 'com.disney.disneyplus',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/disney-plus-android-tv/disney-plus-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.disney.disneyplus.apk'
      ],
      webUrl: 'https://www.disneyplus.com',
      iconSrc: 'icons/disney.jpg',
      bg: '#041236',
      glow: 'rgba(0, 194, 255, 0.6)',
      orbs: ['rgba(0, 160, 240, 0.58)', 'rgba(20, 80, 200, 0.5)', 'rgba(0, 229, 180, 0.35)'],
      kicker: 'DESTAQUE • FAMÍLIA & CINEMA',
      meta: 'Disney • Pixar • Marvel • ESPN',
      tagline: 'Histórias da Disney, Pixar, Marvel, Star Wars e transmissões ESPN.'
    },
    {
      id: 'max',
      name: 'Max',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.8,
      developer: 'Warner Bros. Discovery',
      isApk: true,
      androidPackage: 'com.wbd.stream',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/max-android-tv/max-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.wbd.stream.apk'
      ],
      webUrl: 'https://play.max.com',
      iconSrc: 'icons/max.jpg',
      bg: '#050a30',
      glow: 'rgba(30, 100, 255, 0.62)',
      orbs: ['rgba(30, 90, 255, 0.58)', 'rgba(110, 70, 240, 0.48)', 'rgba(10, 35, 120, 0.5)'],
      kicker: 'DESTAQUE • HBO & WARNER',
      meta: 'HBO • DC • Champions League',
      tagline: 'Séries icônicas da HBO, filmes da Warner Bros. e esportes ao vivo.'
    },
    {
      id: 'smarttube',
      name: 'SmartTube',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 5.0,
      developer: 'Yuliskov (Open Source)',
      isApk: true,
      androidPackage: 'com.teamsmart.videomanager.tv',
      drm: 'Sem Anúncios • 4K 60FPS HDR',
      apkMirrors: [
        'https://github.com/yuliskov/SmartTube/releases/latest/download/smarttube_stable.apk',
        'https://github.com/yuliskov/SmartTube/releases/download/21.85/smarttube_stable.apk'
      ],
      webUrl: 'https://www.youtube.com/tv',
      iconSrc: 'icons/youtube.svg',
      bg: '#b91c1c',
      glow: 'rgba(239, 68, 68, 0.65)',
      orbs: ['rgba(239, 68, 68, 0.55)', 'rgba(185, 28, 28, 0.5)'],
      kicker: 'APK NATIVO • RECOMENDADO',
      meta: 'YouTube TV Sem Anúncios • SponsorBlock • 4K',
      tagline: 'O melhor cliente YouTube para Android TV com SponsorBlock e zero anúncios.'
    },
    {
      id: 'kodi',
      name: 'Kodi Media Center',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.9,
      developer: 'Team Kodi',
      isApk: true,
      androidPackage: 'org.xbmc.kodi',
      drm: 'Add-ons & Widevine InputStream',
      apkMirrors: [
        'https://mirrors.kodi.tv/releases/android/x86_64/kodi-21.1-Omega-x86_64.apk',
        'https://mirrors.kodi.tv/releases/android/arm64-v8a/kodi-21.1-Omega-arm64-v8a.apk'
      ],
      webUrl: 'https://kodi.tv',
      iconSrc: 'icons/mediaplayer.svg',
      bg: '#0284c7',
      glow: 'rgba(2, 132, 199, 0.6)',
      orbs: ['rgba(2, 132, 199, 0.55)', 'rgba(14, 165, 233, 0.45)'],
      kicker: 'CENTRAL MULTIMÍDIA',
      meta: 'APK Oficial • Suporte a Add-ons & DRM',
      tagline: 'Central multimídia poderosa com suporte a plugins de streaming e IPTV.'
    },
    {
      id: 'stremio',
      name: 'Stremio TV',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.9,
      developer: 'Stremio',
      isApk: true,
      androidPackage: 'com.stremio.one',
      drm: 'Torrents & Add-ons Integrados',
      apkMirrors: [
        'https://dl.strem.io/android/v1.6.12-arm64-v8a/stremio-1.6.12-arm64.apk',
        'https://dl.strem.io/android/v1.6.11-arm64-v8a/stremio-1.6.11-arm64.apk'
      ],
      webUrl: 'https://web.stremio.com',
      iconSrc: 'icons/mediaplayer.svg',
      bg: '#581c87',
      glow: 'rgba(139, 92, 246, 0.6)',
      orbs: ['rgba(139, 92, 246, 0.55)', 'rgba(168, 85, 247, 0.45)'],
      kicker: 'AGREGADOR DE STREAMING',
      meta: 'APK Android TV • Catálogo Unificado',
      tagline: 'Assista filmes, séries e animes organizados com add-ons comunitários.'
    },
    {
      id: 'vlc',
      name: 'VLC for Android',
      category: 'streaming',
      storeCategory: 'streaming',
      rating: 4.8,
      developer: 'VideoLAN',
      isApk: true,
      androidPackage: 'org.videolan.vlc',
      drm: 'Todos os Codecs • Aceleração de Hardware',
      apkMirrors: [
        'https://get.videolan.org/vlc-android/3.5.4/VLC-Android-3.5.4-arm64-v8a.apk',
        'https://download.videolan.org/pub/videolan/vlc-android/3.5.4/VLC-Android-3.5.4-arm64-v8a.apk'
      ],
      webUrl: 'https://www.videolan.org',
      iconSrc: 'icons/mediaplayer.svg',
      bg: '#ea580c',
      glow: 'rgba(234, 88, 12, 0.6)',
      orbs: ['rgba(234, 88, 12, 0.55)', 'rgba(249, 115, 22, 0.45)'],
      kicker: 'PLAYER UNIVERSAL',
      meta: 'APK Oficial • MKV, MP4, Áudio e Legendas',
      tagline: 'Reproduz qualquer formato de arquivo de vídeo ou rede local sem travar.'
    },
    {
      id: 'globoplay',
      name: 'Globoplay',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.7,
      developer: 'Grupo Globo',
      isApk: true,
      androidPackage: 'com.globo.globotv',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/globoplay-android-tv/globoplay-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.globo.globotv.apk'
      ],
      webUrl: 'https://globoplay.globo.com',
      iconSrc: 'icons/globoplay.jpg',
      bg: '#1c060e',
      glow: 'rgba(255, 70, 95, 0.58)',
      orbs: ['rgba(235, 65, 90, 0.55)', 'rgba(230, 120, 45, 0.44)', 'rgba(80, 35, 95, 0.45)'],
      kicker: 'BRASIL',
      meta: 'Novelas • Séries • TV Ao Vivo',
      tagline: 'Novelas, séries nacionais, Big Brother, jornalismo e canais ao vivo.'
    },
    {
      id: 'appletv',
      name: 'Apple TV+',
      category: 'streaming',
      storeCategory: 'streaming',
      featured: true,
      rating: 4.9,
      developer: 'Apple Inc.',
      isApk: true,
      androidPackage: 'com.apple.atve.androidtv.appletv',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/apple-tv-android-tv/apple-tv-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.apple.atve.androidtv.appletv.apk'
      ],
      webUrl: 'https://tv.apple.com',
      iconSrc: 'icons/appletv.jpg',
      bg: '#1c1c1e',
      glow: 'rgba(255, 255, 255, 0.4)',
      orbs: ['rgba(120, 150, 210, 0.5)', 'rgba(70, 110, 175, 0.44)', 'rgba(50, 65, 110, 0.45)'],
      kicker: 'APPLE ORIGINALS',
      meta: 'Séries & Filmes Premiados',
      tagline: 'Produções originais Apple com qualidade cinematográfica.'
    },
    {
      id: 'paramount',
      name: 'Paramount+',
      category: 'streaming',
      storeCategory: 'streaming',
      rating: 4.6,
      developer: 'Paramount',
      isApk: true,
      androidPackage: 'com.cbs.app',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/paramount-plus-android-tv/paramount-plus-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.cbs.app.apk'
      ],
      webUrl: 'https://www.paramountplus.com',
      iconSrc: 'icons/paramount.jpg',
      bg: '#02163b',
      glow: 'rgba(0, 110, 255, 0.58)',
      orbs: ['rgba(0, 100, 255, 0.58)', 'rgba(0, 180, 255, 0.45)', 'rgba(20, 50, 140, 0.48)'],
      kicker: 'ENTRETENIMENTO',
      meta: 'Paramount • Showtime • Libertadores',
      tagline: 'Cinema, séries exclusivas e grandes torneios de futebol.'
    },
    {
      id: 'crunchyroll',
      name: 'Crunchyroll',
      category: 'streaming',
      storeCategory: 'streaming',
      rating: 4.8,
      developer: 'Crunchyroll, LLC',
      isApk: true,
      androidPackage: 'com.crunchyroll.crunchyroid',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/crunchyroll-android-tv/crunchyroll-android-tv.apk',
        'https://mirror.apk-cloud.com/apks/com.crunchyroll.crunchyroid.apk'
      ],
      webUrl: 'https://www.crunchyroll.com',
      iconSrc: 'icons/crunchyroll.jpg',
      bg: '#1c120b',
      glow: 'rgba(244, 117, 33, 0.62)',
      orbs: ['rgba(244, 117, 33, 0.58)', 'rgba(190, 95, 35, 0.45)', 'rgba(70, 50, 80, 0.42)'],
      kicker: 'ANIME',
      meta: 'Simulcast • Dublado & Legendado',
      tagline: 'O maior catálogo de animes do mundo direto do Japão.'
    },
    {
      id: 'plutotv',
      name: 'Pluto TV',
      category: 'streaming',
      storeCategory: 'streaming',
      rating: 4.6,
      developer: 'Paramount Streaming',
      isApk: true,
      androidPackage: 'tv.pluto.android',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://archive.org/download/pluto-tv-android/pluto-tv-android.apk',
        'https://mirror.apk-cloud.com/apks/tv.pluto.android.apk'
      ],
      webUrl: 'https://pluto.tv/br/live-tv',
      iconSrc: 'icons/plutotv.jpg',
      bg: '#111114',
      glow: 'rgba(255, 222, 0, 0.5)',
      orbs: ['rgba(210, 180, 35, 0.46)', 'rgba(40, 140, 200, 0.45)', 'rgba(85, 65, 140, 0.42)'],
      kicker: 'TV GRATUITA • APK',
      meta: 'APK Oficial • 150+ Canais Ao Vivo',
      tagline: 'Canais gratuitos ao vivo e filmes sob demanda no app oficial de Smart TV.'
    },
    {
      id: 'plex',
      name: 'Plex',
      category: 'streaming',
      storeCategory: 'streaming',
      rating: 4.7,
      developer: 'Plex, Inc.',
      isApk: true,
      androidPackage: 'com.plexapp.android',
      drm: 'Widevine L3',
      apkMirrors: [
        'https://downloads.plex.tv/kepler/apk/Plex_for_Android_TV.apk',
        'https://archive.org/download/plex-android-tv/plex-android-tv.apk'
      ],
      webUrl: 'https://app.plex.tv',
      iconSrc: 'icons/plex.jpg',
      bg: '#1c1a17',
      glow: 'rgba(229, 160, 13, 0.56)',
      orbs: ['rgba(210, 145, 20, 0.52)', 'rgba(90, 75, 55, 0.45)', 'rgba(50, 70, 110, 0.4)'],
      kicker: 'MÍDIA PESSOAL & TV',
      meta: 'APK Oficial • Servidor Local & FAST',
      tagline: 'Sua biblioteca de filmes e séries com aceleração por hardware e interface TV.'
    },
    {
      id: 'spotify',
      name: 'Spotify TV',
      category: 'music',
      storeCategory: 'music',
      featured: true,
      rating: 4.9,
      developer: 'Spotify AB',
      isApk: true,
      androidPackage: 'com.spotify.tv.android',
      drm: 'Widevine L3 Audio DRM',
      apkMirrors: [
        'https://archive.org/download/spotify-tv-android/spotify-tv-android.apk',
        'https://mirror.apk-cloud.com/apks/com.spotify.tv.android.apk'
      ],
      webUrl: 'https://open.spotify.com',
      iconSrc: 'icons/spotify.jpg',
      bg: '#121212',
      glow: 'rgba(29, 185, 84, 0.6)',
      orbs: ['rgba(29, 185, 84, 0.55)', 'rgba(20, 120, 95, 0.48)'],
      kicker: 'MÚSICA & PODCASTS • ANDROID TV',
      meta: 'APK Oficial • Controle Remoto & Letras',
      tagline: 'Milhões de músicas e podcasts na TV com interface otimizada para controle.'
    },
    { id: 'mubi', name: 'MUBI', category: 'streaming', storeCategory: 'streaming', rating: 4.8, developer: 'MUBI Inc.', webUrl: 'https://mubi.com', iconSrc: 'icons/mubi.jpg', bg: '#0d1b3e', glow: 'rgba(76, 130, 255, 0.54)', orbs: ['rgba(70, 120, 240, 0.55)', 'rgba(40, 160, 210, 0.42)', 'rgba(60, 55, 150, 0.45)'], kicker: 'CINEMA AUTORAL', meta: 'Curadoria • Festivais', tagline: 'Filmes de grandes diretores e restaurações de festivais.' },
    { id: 'clarotv', name: 'Claro tv+', category: 'streaming', storeCategory: 'streaming', rating: 4.4, developer: 'Claro Brasil', webUrl: 'https://www.clarotvmais.com.br', iconSrc: 'icons/clarotv.jpg', bg: '#26080a', glow: 'rgba(227, 6, 19, 0.56)', orbs: ['rgba(227, 6, 19, 0.56)', 'rgba(130, 15, 25, 0.45)'], kicker: 'TV POR ASSINATURA', meta: 'Canais Ao Vivo & On Demand', tagline: 'Canais fechados ao vivo, filmes e séries da Claro tv+ na tela.' },
    { id: 'skyplus', name: 'SKY+', category: 'streaming', storeCategory: 'streaming', rating: 4.4, developer: 'SKY Brasil', webUrl: 'https://www.skymais.com.br', iconSrc: 'icons/skyplus.jpg', bg: '#1e0b1a', glow: 'rgba(230, 28, 86, 0.56)', orbs: ['rgba(230, 28, 86, 0.55)', 'rgba(90, 20, 80, 0.48)'], kicker: 'TV AO VIVO & STREAMING', meta: 'SKY+ • Canais ao Vivo', tagline: 'TV ao vivo pela internet com programação esportiva e filmes.' },
    { id: 'mercadoplay', name: 'Mercado Play', category: 'streaming', storeCategory: 'streaming', rating: 4.6, developer: 'Mercado Livre', webUrl: 'https://play.mercadolivre.com.br', iconSrc: 'icons/mercadoplay.jpg', bg: '#2c2808', glow: 'rgba(255, 230, 0, 0.52)', orbs: ['rgba(255, 230, 0, 0.5)', 'rgba(45, 50, 119, 0.48)'], kicker: 'GRÁTIS', meta: 'Filmes & Séries Gratuitos', tagline: 'Filmes, séries e desenhos gratuitos do Mercado Livre direto na TV.' },
    { id: 'viki', name: 'Rakuten Viki', category: 'streaming', storeCategory: 'streaming', rating: 4.8, developer: 'Viki, Inc.', webUrl: 'https://www.viki.com', iconSrc: 'icons/viki.jpg', bg: '#081b2e', glow: 'rgba(17, 158, 250, 0.55)', orbs: ['rgba(17, 158, 250, 0.55)', 'rgba(15, 85, 165, 0.45)'], kicker: 'DORAMAS & ÁSIA', meta: 'K-Dramas • C-Dramas', tagline: 'Doramas coreanos, chineses e japoneses legendados em português.' },
    { id: 'discoveryplus', name: 'discovery+', category: 'streaming', storeCategory: 'streaming', rating: 4.5, developer: 'Discovery', webUrl: 'https://www.discoveryplus.com', iconSrc: 'icons/discoveryplus.jpg', bg: '#0b182e', glow: 'rgba(33, 117, 255, 0.56)', orbs: ['rgba(33, 117, 255, 0.55)', 'rgba(10, 65, 145, 0.46)'], kicker: 'DOCUMENTÁRIOS & REALITY', meta: 'Discovery • HGTV • TLC', tagline: 'Documentários da natureza, ciência, gastronomia e reformas.' },
    { id: 'looke', name: 'Looke', category: 'streaming', storeCategory: 'streaming', rating: 4.5, developer: 'Looke', webUrl: 'https://www.looke.com.br', iconSrc: 'icons/looke.jpg', bg: '#1a0a1e', glow: 'rgba(220, 45, 145, 0.52)', orbs: ['rgba(220, 45, 145, 0.5)', 'rgba(85, 25, 115, 0.45)'], kicker: 'BRASIL', meta: 'Cinema Independente & Família', tagline: 'Milhares de filmes e séries selecionados com catálogo nacional.' },
    { id: 'tubi', name: 'Tubi', category: 'streaming', storeCategory: 'streaming', rating: 4.7, developer: 'Tubi, Inc.', webUrl: 'https://tubitv.com', iconSrc: 'icons/tubi.jpg', bg: '#1d082b', glow: 'rgba(255, 80, 26, 0.56)', orbs: ['rgba(255, 80, 26, 0.52)', 'rgba(110, 20, 165, 0.48)'], kicker: 'GRÁTIS', meta: 'Milhares de Filmes Grátis', tagline: 'Streaming gratuito suportado por anúncios com filmes e TV ao vivo.' },
    { id: 'youtubekids', name: 'YouTube Kids', category: 'streaming', storeCategory: 'streaming', rating: 4.7, developer: 'Google LLC', webUrl: 'https://www.youtubekids.com', iconSrc: 'icons/youtubekids.jpg', bg: '#26080d', glow: 'rgba(255, 30, 50, 0.55)', orbs: ['rgba(255, 30, 50, 0.52)', 'rgba(255, 190, 0, 0.42)'], kicker: 'INFANTIL', meta: 'Conteúdo Seguro para Crianças', tagline: 'Vídeos educativos, desenhos animados e músicas para os pequenos.' },
    { id: 'imdb', name: 'IMDb', category: 'streaming', storeCategory: 'streaming', rating: 4.8, developer: 'IMDb', webUrl: 'https://www.imdb.com', iconSrc: 'icons/imdb.jpg', bg: '#1a1503', glow: 'rgba(245, 197, 24, 0.56)', orbs: ['rgba(245, 197, 24, 0.52)', 'rgba(65, 55, 15, 0.45)'], kicker: 'CINEMA & NOTAS', meta: 'Trailers • Elenco • Avaliações', tagline: 'Explore notas, trailers, curiosidades e filmografias completas.' },
    { id: 'letterboxd', name: 'Letterboxd', category: 'streaming', storeCategory: 'streaming', rating: 4.9, developer: 'Letterboxd Ltd.', webUrl: 'https://letterboxd.com', iconSrc: 'icons/letterboxd.jpg', bg: '#14181c', glow: 'rgba(0, 224, 84, 0.54)', orbs: ['rgba(255, 128, 0, 0.48)', 'rgba(0, 224, 84, 0.48)', 'rgba(64, 188, 244, 0.48)'], kicker: 'COMUNIDADE DE CINEMA', meta: 'Diário de Filmes • Listas', tagline: 'A rede social dos cinéfilos para registrar e descobrir filmes.' },
    { id: 'tvtime', name: 'TV Time', category: 'streaming', storeCategory: 'streaming', rating: 4.8, developer: 'TV Time', webUrl: 'https://app.tvtime.com', iconSrc: 'icons/tvtime.jpg', bg: '#241b05', glow: 'rgba(255, 212, 0, 0.56)', orbs: ['rgba(255, 212, 0, 0.52)', 'rgba(45, 45, 55, 0.45)'], kicker: 'TRACKER', meta: 'Episódios & Estreias', tagline: 'Acompanhe lançamentos, episódios vistos e reações da comunidade.' },

    /* === ESPORTES & AO VIVO === */
    { id: 'espn', name: 'ESPN', category: 'streaming', storeCategory: 'sports', rating: 4.7, developer: 'Disney / ESPN', webUrl: 'https://www.espn.com.br', iconSrc: 'icons/espn.jpg', bg: '#2a0505', glow: 'rgba(221, 0, 0, 0.58)', orbs: ['rgba(221, 0, 0, 0.56)', 'rgba(95, 10, 15, 0.46)'], kicker: 'ESPORTES AO VIVO', meta: 'Futebol • NBA • NFL • Tênis', tagline: 'Notícias, placares ao vivo, análises e destaques esportivos.' },
    { id: 'premiere', name: 'Premiere', category: 'streaming', storeCategory: 'sports', rating: 4.6, developer: 'Globo', webUrl: 'https://premiere.globo.com', iconSrc: 'icons/premiere.jpg', bg: '#081f12', glow: 'rgba(0, 168, 89, 0.56)', orbs: ['rgba(0, 168, 89, 0.55)', 'rgba(15, 70, 45, 0.45)'], kicker: 'FUTEBOL BRASILEIRO', meta: 'Brasileirão • Copa do Brasil', tagline: 'Todos os jogos do seu time no Brasileirão e Copa do Brasil.' },
    { id: 'f1tv', name: 'F1 TV', category: 'streaming', storeCategory: 'sports', rating: 4.8, developer: 'Formula 1', webUrl: 'https://f1tv.formula1.com', iconSrc: 'icons/f1tv.jpg', bg: '#260404', glow: 'rgba(225, 6, 0, 0.6)', orbs: ['rgba(225, 6, 0, 0.58)', 'rgba(35, 35, 45, 0.5)'], kicker: 'AUTOMOBILISMO', meta: 'Fórmula 1 • Câmeras Onboard', tagline: 'Corridas ao vivo, telemetria e câmeras onboard dos pilotos.' },
    { id: 'nba', name: 'NBA App', category: 'streaming', storeCategory: 'sports', rating: 4.8, developer: 'NBA', webUrl: 'https://www.nba.com/watch', iconSrc: 'icons/nba.jpg', bg: '#0c1836', glow: 'rgba(29, 66, 138, 0.58)', orbs: ['rgba(29, 66, 138, 0.56)', 'rgba(200, 16, 46, 0.45)'], kicker: 'BASQUETE', meta: 'League Pass • Melhores Momentos', tagline: 'Partidas da temporada regular, Playoffs e NBA Finals ao vivo.' },
    { id: 'nfl', name: 'NFL', category: 'streaming', storeCategory: 'sports', rating: 4.7, developer: 'NFL Enterprises', webUrl: 'https://www.nfl.com', iconSrc: 'icons/nfl.jpg', bg: '#0a162e', glow: 'rgba(1, 51, 105, 0.58)', orbs: ['rgba(1, 51, 105, 0.55)', 'rgba(213, 10, 10, 0.45)'], kicker: 'FUTEBOL AMERICANO', meta: 'NFL Game Pass • RedZone', tagline: 'Jogos, estatísticas em tempo real e cobertura completa da liga.' },
    { id: 'dazn', name: 'DAZN', category: 'streaming', storeCategory: 'sports', rating: 4.6, developer: 'DAZN', webUrl: 'https://www.dazn.com', iconSrc: 'icons/dazn.jpg', bg: '#0d0f12', glow: 'rgba(248, 255, 0, 0.48)', orbs: ['rgba(248, 255, 0, 0.42)', 'rgba(40, 45, 55, 0.5)'], kicker: 'ESPORTES DE COMBATE & FUTEBOL', meta: 'Boxe • NFL • Futebol', tagline: 'Transmissões esportivas globais ao vivo e sob demanda.' },
    { id: 'fifaplus', name: 'FIFA+', category: 'streaming', storeCategory: 'sports', rating: 4.7, developer: 'FIFA', webUrl: 'https://www.plus.fifa.com', iconSrc: 'icons/fifaplus.jpg', bg: '#09182e', glow: 'rgba(0, 180, 255, 0.54)', orbs: ['rgba(0, 180, 255, 0.52)', 'rgba(15, 55, 115, 0.48)'], kicker: 'GRÁTIS', meta: 'Copas • Arquivos • Ao Vivo', tagline: 'Jogos históricos da Copa do Mundo, documentários e torneios ao vivo.' },
    { id: 'ufcfightpass', name: 'UFC Fight Pass', category: 'streaming', storeCategory: 'sports', rating: 4.7, developer: 'UFC', webUrl: 'https://ufcfightpass.com', iconSrc: 'icons/ufcfightpass.jpg', bg: '#1c0505', glow: 'rgba(210, 10, 10, 0.58)', orbs: ['rgba(210, 10, 10, 0.56)', 'rgba(40, 20, 20, 0.5)'], kicker: 'ARTES MARCIAIS', meta: 'MMA • Eventos Ao Vivo', tagline: 'Lutas históricas, eventos preliminares e artes marciais do mundo todo.' },
    { id: 'olympics', name: 'Olympics', category: 'streaming', storeCategory: 'sports', rating: 4.8, developer: 'IOC', webUrl: 'https://olympics.com', iconSrc: 'icons/olympics.jpg', bg: '#101420', glow: 'rgba(0, 160, 230, 0.52)', orbs: ['rgba(0, 129, 200, 0.48)', 'rgba(252, 177, 49, 0.45)', 'rgba(0, 166, 81, 0.45)'], kicker: 'OLIMPÍADAS', meta: 'Replays • Documentários • Medalhas', tagline: 'Canal olímpico oficial com documentários e momentos históricos.' },
    { id: 'cnnbrasil', name: 'CNN Brasil', category: 'streaming', storeCategory: 'sports', rating: 4.6, developer: 'CNN Brasil', webUrl: 'https://www.cnnbrasil.com.br/ao-vivo/', iconSrc: 'icons/cnnbrasil.jpg', bg: '#260608', glow: 'rgba(204, 0, 0, 0.56)', orbs: ['rgba(204, 0, 0, 0.55)', 'rgba(65, 15, 20, 0.46)'], kicker: 'JORNALISMO 24H', meta: 'Notícias ao Vivo', tagline: 'Cobertura jornalística em tempo real do Brasil e do mundo.' },
    { id: 'band', name: 'Bandplay', category: 'streaming', storeCategory: 'sports', rating: 4.5, developer: 'Grupo Bandeirantes', webUrl: 'https://bandplay.com', iconSrc: 'icons/band.jpg', bg: '#0c1f14', glow: 'rgba(0, 175, 80, 0.54)', orbs: ['rgba(0, 175, 80, 0.52)', 'rgba(255, 200, 0, 0.42)'], kicker: 'TV ABERTA & ESPORTES', meta: 'Band Ao Vivo • MasterChef • F1', tagline: 'Programação ao vivo e sob demanda da Band gratuitamente.' },
    { id: 'sbt', name: '+SBT', category: 'streaming', storeCategory: 'sports', rating: 4.7, developer: 'SBT', webUrl: 'https://mais.sbt.com.br', iconSrc: 'icons/sbt.jpg', bg: '#0e1730', glow: 'rgba(60, 145, 255, 0.55)', orbs: ['rgba(0, 165, 255, 0.52)', 'rgba(255, 65, 105, 0.45)'], kicker: 'GRÁTIS', meta: 'Canais FAST • Novelas • Ao Vivo', tagline: 'Streaming gratuito do SBT com canais temáticos e programação ao vivo.' },
    { id: 'record', name: 'PlayPlus', category: 'streaming', storeCategory: 'sports', rating: 4.4, developer: 'Record', webUrl: 'https://www.playplus.com', iconSrc: 'icons/record.jpg', bg: '#0b1929', glow: 'rgba(0, 140, 220, 0.54)', orbs: ['rgba(0, 140, 220, 0.52)', 'rgba(30, 60, 110, 0.45)'], kicker: 'TV & STREAMING', meta: 'Record Ao Vivo • Jornalismo', tagline: 'Sinal ao vivo da Record TV, realities e acervo jornalístico.' },

    /* === MÚSICA, ÁUDIO & PODCASTS === */
    { id: 'spotify', name: 'Spotify', category: 'music', storeCategory: 'music', featured: true, rating: 4.9, developer: 'Spotify AB', webUrl: 'https://open.spotify.com', iconSrc: 'icons/spotify.jpg', bg: '#121212', glow: 'rgba(29, 185, 84, 0.6)', orbs: ['rgba(29, 185, 84, 0.55)', 'rgba(20, 120, 95, 0.48)'], kicker: 'MÚSICA & PODCASTS', meta: 'Playlists • Podcasts • Letras', tagline: 'Milhões de músicas, playlists personalizadas e podcasts na sua sala.' },
    { id: 'applemusic', name: 'Apple Music', category: 'music', storeCategory: 'music', rating: 4.8, developer: 'Apple Inc.', webUrl: 'https://music.apple.com', iconSrc: 'icons/applemusic.jpg', bg: '#fb233b', glow: 'rgba(250, 36, 60, 0.6)', orbs: ['rgba(240, 45, 75, 0.56)', 'rgba(170, 45, 95, 0.45)'], kicker: 'ÁUDIO ESPACIAL', meta: 'Lossless • Modo Karaokê', tagline: 'Áudio Lossless, rádio ao vivo e letras sincronizadas na tela.' },
    { id: 'youtubemusic', name: 'YouTube Music', category: 'music', storeCategory: 'music', rating: 4.8, developer: 'Google LLC', webUrl: 'https://music.youtube.com', iconSrc: 'icons/youtubemusic.jpg', bg: '#1e080a', glow: 'rgba(255, 0, 51, 0.58)', orbs: ['rgba(255, 0, 51, 0.55)', 'rgba(40, 40, 50, 0.45)'], kicker: 'MÚSICA & CLIPES', meta: 'Álbuns • Shows • Remixes', tagline: 'O catálogo musical oficial mais videoclipes e apresentações ao vivo.' },
    { id: 'deezer', name: 'Deezer', category: 'music', storeCategory: 'music', rating: 4.7, developer: 'Deezer', webUrl: 'https://www.deezer.com', iconSrc: 'icons/deezer.jpg', bg: '#160a24', glow: 'rgba(162, 56, 255, 0.6)', orbs: ['rgba(162, 56, 255, 0.58)', 'rgba(220, 50, 120, 0.45)'], kicker: 'HIFI FLAC', meta: 'Flow • Playlists', tagline: 'Flow infinito e qualidade de som FLAC sem perdas.' },
    { id: 'tidal', name: 'TIDAL', category: 'music', storeCategory: 'music', rating: 4.7, developer: 'TIDAL', webUrl: 'https://listen.tidal.com', iconSrc: 'icons/tidal.jpg', bg: '#0c0d10', glow: 'rgba(0, 255, 255, 0.48)', orbs: ['rgba(0, 225, 255, 0.45)', 'rgba(45, 55, 75, 0.45)'], kicker: 'AUDIÓFILO', meta: 'FLAC 24-bit • HiRes', tagline: 'Qualidade de estúdio em alta resolução para sistemas de som.' },
    { id: 'amazonmusic', name: 'Amazon Music', category: 'music', storeCategory: 'music', rating: 4.6, developer: 'Amazon', webUrl: 'https://music.amazon.com.br', iconSrc: 'icons/amazonmusic.jpg', bg: '#091f2c', glow: 'rgba(0, 194, 255, 0.56)', orbs: ['rgba(0, 194, 255, 0.55)', 'rgba(35, 47, 62, 0.45)'], kicker: 'MÚSICA & PODCASTS', meta: 'HD • Ultra HD • Prime', tagline: 'Incluído no Prime com milhões de faixas e estações temáticas.' },
    { id: 'soundcloud', name: 'SoundCloud', category: 'music', storeCategory: 'music', rating: 4.7, developer: 'SoundCloud', webUrl: 'https://soundcloud.com', iconSrc: 'icons/soundcloud.jpg', bg: '#261205', glow: 'rgba(255, 85, 0, 0.58)', orbs: ['rgba(255, 85, 0, 0.56)', 'rgba(120, 40, 10, 0.45)'], kicker: 'INDEPENDENTE & DJ SETS', meta: 'Remixes • Podcasts • Beats', tagline: 'Descubra artistas independentes, sets de DJs e faixas inéditas.' },
    { id: 'tunein', name: 'TuneIn Radio', category: 'music', storeCategory: 'music', rating: 4.6, developer: 'TuneIn', webUrl: 'https://tunein.com', iconSrc: 'icons/tunein.jpg', bg: '#0a1f24', glow: 'rgba(20, 216, 204, 0.55)', orbs: ['rgba(20, 216, 204, 0.54)', 'rgba(20, 65, 95, 0.46)'], kicker: 'RÁDIO AO VIVO', meta: '100.000+ Estações Mundiais', tagline: 'Rádios FM/AM do Brasil e do mundo, notícias e esportes em áudio.' },
    { id: 'radiogarden', name: 'Radio Garden', category: 'music', storeCategory: 'music', rating: 4.9, developer: 'Radio Garden', webUrl: 'https://radio.garden', iconSrc: 'icons/radiogarden.jpg', bg: '#082112', glow: 'rgba(34, 229, 138, 0.56)', orbs: ['rgba(34, 229, 138, 0.55)', 'rgba(10, 90, 55, 0.45)'], kicker: 'GLOBO INTERATIVO', meta: 'Rádios de Todo o Planeta', tagline: 'Gire o globo 3D e ouça estações de rádio ao vivo em qualquer cidade.' },
    { id: 'pocketcasts', name: 'Pocket Casts', category: 'music', storeCategory: 'music', rating: 4.8, developer: 'Automattic', webUrl: 'https://play.pocketcasts.com', iconSrc: 'icons/pocketcasts.jpg', bg: '#240909', glow: 'rgba(244, 62, 55, 0.58)', orbs: ['rgba(244, 62, 55, 0.56)', 'rgba(70, 20, 25, 0.45)'], kicker: 'PODCASTS', meta: 'Player Web Sincronizado', tagline: 'Player poderoso de podcasts com filas, velocidade variável e capítulos.' },
    { id: 'audible', name: 'Audible', category: 'music', storeCategory: 'music', rating: 4.8, developer: 'Amazon Audible', webUrl: 'https://www.audible.com', iconSrc: 'icons/audible.jpg', bg: '#241404', glow: 'rgba(255, 153, 0, 0.58)', orbs: ['rgba(255, 153, 0, 0.55)', 'rgba(65, 35, 10, 0.45)'], kicker: 'AUDIOLIVROS', meta: 'Best-sellers • Originais', tagline: 'Audiolivros narrados e séries em áudio para relaxar na sala.' },

    /* === GAMES & CLOUD GAMING === */
    { id: 'xbox', name: 'Xbox Cloud', category: 'games', storeCategory: 'games', featured: true, rating: 4.8, developer: 'Microsoft', webUrl: 'https://www.xbox.com/play', iconSrc: 'icons/xbox.jpg', bg: '#107c10', glow: 'rgba(16, 180, 50, 0.58)', orbs: ['rgba(20, 155, 55, 0.56)', 'rgba(30, 120, 85, 0.45)'], kicker: 'JOGOS NA NUVEM', meta: 'Xbox Game Pass na Web', tagline: 'Jogue títulos do Game Pass direto pelo navegador com controle.' },
    { id: 'geforce', name: 'GeForce NOW', category: 'games', storeCategory: 'games', featured: true, rating: 4.8, developer: 'NVIDIA', webUrl: 'https://play.geforcenow.com', iconSrc: 'icons/geforce.jpg', bg: '#161f0b', glow: 'rgba(118, 185, 0, 0.58)', orbs: ['rgba(118, 185, 0, 0.55)', 'rgba(40, 140, 85, 0.45)'], kicker: 'JOGOS NA NUVEM', meta: 'Streaming PC na Web', tagline: 'Sua biblioteca Steam e Epic rodando direto na tela pela nuvem.' },
    { id: 'luna', name: 'Amazon Luna', category: 'games', storeCategory: 'games', rating: 4.5, developer: 'Amazon', webUrl: 'https://luna.amazon.com', iconSrc: 'icons/luna.jpg', bg: '#1f0b38', glow: 'rgba(147, 51, 234, 0.58)', orbs: ['rgba(147, 51, 234, 0.55)', 'rgba(55, 25, 115, 0.48)'], kicker: 'JOGOS NA NUVEM', meta: 'Prime Gaming na Web', tagline: 'Jogos na nuvem sem downloads diretamente pelo navegador.' },
    { id: 'boosteroid', name: 'Boosteroid', category: 'games', storeCategory: 'games', rating: 4.6, developer: 'Boosteroid', webUrl: 'https://cloud.boosteroid.com', iconSrc: 'icons/boosteroid.jpg', bg: '#0b1830', glow: 'rgba(37, 99, 235, 0.56)', orbs: ['rgba(37, 99, 235, 0.55)', 'rgba(14, 165, 233, 0.45)'], kicker: 'JOGOS NA NUVEM', meta: 'Servidores Brasil', tagline: 'Plataforma de jogos na nuvem acessível pelo navegador.' },
    { id: 'twitch', name: 'Twitch', category: 'music', storeCategory: 'games', featured: true, rating: 4.8, developer: 'Twitch Interactive', webUrl: 'https://www.twitch.tv', iconSrc: 'icons/twitch.jpg', bg: '#181029', glow: 'rgba(145, 70, 255, 0.6)', orbs: ['rgba(145, 70, 255, 0.58)', 'rgba(100, 60, 190, 0.48)'], kicker: 'LIVES', meta: 'Games • Chat', tagline: 'Assista transmissões ao vivo dos seus streamers e torneios favoritos.' },
    { id: 'kick', name: 'Kick', category: 'music', storeCategory: 'games', rating: 4.6, developer: 'Kick Streaming', webUrl: 'https://kick.com', iconSrc: 'icons/kick.jpg', bg: '#0b1c0b', glow: 'rgba(83, 252, 24, 0.55)', orbs: ['rgba(83, 252, 24, 0.5)', 'rgba(20, 60, 25, 0.46)'], kicker: 'LIVES', meta: 'Transmissões ao Vivo', tagline: 'Plataforma de transmissões ao vivo na web.' },
    { id: 'chess', name: 'Chess.com', category: 'games', storeCategory: 'games', rating: 4.9, developer: 'Chess.com', webUrl: 'https://www.chess.com', iconSrc: 'icons/chess.jpg', bg: '#172410', glow: 'rgba(129, 182, 76, 0.55)', orbs: ['rgba(129, 182, 76, 0.54)', 'rgba(55, 85, 35, 0.45)'], kicker: 'TABULEIRO', meta: 'Partidas Online', tagline: 'Jogue xadrez online contra amigos, bots ou resolva problemas diários.' },
    { id: 'poki', name: 'Poki', category: 'games', storeCategory: 'games', rating: 4.8, developer: 'Poki B.V.', webUrl: 'https://poki.com', iconSrc: 'icons/poki.jpg', bg: '#0c212b', glow: 'rgba(0, 200, 225, 0.54)', orbs: ['rgba(0, 200, 225, 0.52)', 'rgba(255, 190, 0, 0.42)'], kicker: 'ARCADE WEB', meta: 'Jogos no Navegador', tagline: 'Centenas de jogos instantâneos gratuitos direto na tela.' },
    { id: 'retroarch', name: 'RetroGames', category: 'games', storeCategory: 'games', rating: 4.7, developer: 'RetroGames.cc', webUrl: 'https://www.retrogames.cc', iconSrc: 'icons/retroarch.jpg', bg: '#1c1224', glow: 'rgba(255, 60, 120, 0.54)', orbs: ['rgba(255, 60, 120, 0.52)', 'rgba(95, 70, 210, 0.45)'], kicker: 'CLÁSSICOS', meta: 'Arcade • Retrô', tagline: 'Clássicos retrô de fliperama e consoles jogáveis pelo navegador.' },

    /* === IA & PRODUTIVIDADE === */
    { id: 'chatgpt', name: 'ChatGPT', category: 'utilities', storeCategory: 'ai', featured: true, rating: 4.9, developer: 'OpenAI', webUrl: 'https://chatgpt.com', iconSrc: 'icons/chatgpt.jpg', bg: '#0f1116', glow: 'rgba(16, 163, 127, 0.55)', orbs: ['rgba(16, 163, 127, 0.52)', 'rgba(45, 75, 95, 0.46)'], kicker: 'INTELIGÊNCIA ARTIFICIAL', meta: 'Conversa • Pesquisa • Voz', tagline: 'Assistente de IA da OpenAI para tirar dúvidas, estudar e criar na tela grande.' },
    { id: 'gemini', name: 'Google Gemini', category: 'utilities', storeCategory: 'ai', featured: true, rating: 4.9, developer: 'Google LLC', webUrl: 'https://gemini.google.com', iconSrc: 'icons/gemini.jpg', bg: '#0f162e', glow: 'rgba(71, 150, 227, 0.58)', orbs: ['rgba(71, 150, 227, 0.55)', 'rgba(155, 105, 225, 0.5)'], kicker: 'INTELIGÊNCIA ARTIFICIAL', meta: 'Multimodal • Google Workspace', tagline: 'Assistente de IA do Google para ideias, resumos e pesquisas instantâneas.' },
    { id: 'perplexity', name: 'Perplexity', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'Perplexity AI', webUrl: 'https://www.perplexity.ai', iconSrc: 'icons/perplexity.jpg', bg: '#0c1c20', glow: 'rgba(32, 184, 205, 0.56)', orbs: ['rgba(32, 184, 205, 0.54)', 'rgba(20, 65, 80, 0.46)'], kicker: 'MOTOR DE RESPOSTAS', meta: 'Fontes em Tempo Real', tagline: 'Respostas diretas com citações atualizadas da web em tempo real.' },
    { id: 'notion', name: 'Notion', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'Notion Labs', webUrl: 'https://www.notion.so', iconSrc: 'icons/notion.jpg', bg: '#18181b', glow: 'rgba(255, 255, 255, 0.38)', orbs: ['rgba(180, 190, 210, 0.4)', 'rgba(65, 65, 80, 0.45)'], kicker: 'WORKSPACE', meta: 'Documentos • Wikis • Tarefas', tagline: 'Organize projetos, anotações e painéis da família ou trabalho.' },
    { id: 'canva', name: 'Canva', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'Canva', webUrl: 'https://www.canva.com', iconSrc: 'icons/canva.jpg', bg: '#121830', glow: 'rgba(0, 196, 204, 0.56)', orbs: ['rgba(0, 196, 204, 0.55)', 'rgba(125, 42, 232, 0.5)'], kicker: 'DESIGN & APRESENTAÇÕES', meta: 'Slides • Posters • Edição', tagline: 'Crie apresentações, convites e artes visuais em tela grande.' },
    { id: 'figma', name: 'Figma', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'Figma, Inc.', webUrl: 'https://www.figma.com', iconSrc: 'icons/figma.jpg', bg: '#16161d', glow: 'rgba(162, 89, 255, 0.54)', orbs: ['rgba(242, 78, 30, 0.45)', 'rgba(162, 89, 255, 0.48)', 'rgba(10, 207, 131, 0.45)'], kicker: 'DESIGN COLABORATIVO', meta: 'Protótipos • FigJam', tagline: 'Visualize protótipos, apresentações e quadros FigJam na TV.' },
    { id: 'excalidraw', name: 'Excalidraw', category: 'utilities', storeCategory: 'ai', rating: 4.9, developer: 'Excalidraw', webUrl: 'https://excalidraw.com', iconSrc: 'icons/excalidraw.jpg', bg: '#1b1930', glow: 'rgba(105, 101, 219, 0.54)', orbs: ['rgba(105, 101, 219, 0.52)', 'rgba(45, 40, 85, 0.45)'], kicker: 'LOUSA DIGITAL', meta: 'Diagramas • Esboços Livres', tagline: 'Quadro branco rápido para desenhar ideias, mapas e diagramas.' },
    { id: 'photopea', name: 'Photopea', category: 'utilities', storeCategory: 'ai', rating: 4.7, developer: 'Photopea', webUrl: 'https://www.photopea.com', iconSrc: 'icons/photopea.jpg', bg: '#0c1f1c', glow: 'rgba(24, 164, 151, 0.54)', orbs: ['rgba(24, 164, 151, 0.52)', 'rgba(25, 60, 70, 0.46)'], kicker: 'EDITOR DE IMAGENS', meta: 'PSD • Camadas • Web', tagline: 'Editor avançado de imagens e arquivos PSD direto no navegador.' },
    { id: 'github', name: 'GitHub', category: 'utilities', storeCategory: 'ai', rating: 4.9, developer: 'GitHub, Inc.', webUrl: 'https://github.com', iconSrc: 'icons/github.jpg', bg: '#0d1117', glow: 'rgba(165, 180, 252, 0.44)', orbs: ['rgba(90, 110, 180, 0.45)', 'rgba(30, 40, 65, 0.48)'], kicker: 'DESENVOLVIMENTO', meta: 'Repositórios • Código', tagline: 'Acompanhe repositórios, Pull Requests e projetos open source.' },
    { id: 'googledrive', name: 'Google Drive', category: 'utilities', storeCategory: 'ai', rating: 4.7, developer: 'Google LLC', webUrl: 'https://drive.google.com', iconSrc: 'icons/googledrive.jpg', bg: '#151c28', glow: 'rgba(66, 133, 244, 0.5)', orbs: ['rgba(66, 133, 244, 0.45)', 'rgba(52, 168, 83, 0.42)', 'rgba(251, 188, 5, 0.4)'], kicker: 'NUVEM & ARQUIVOS', meta: 'Docs • Slides • Vídeos', tagline: 'Acesse apresentações, fotos, vídeos e documentos da sua nuvem.' },
    { id: 'googlephotos', name: 'Google Fotos', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'Google LLC', webUrl: 'https://photos.google.com', iconSrc: 'icons/googlephotos.jpg', bg: '#161a26', glow: 'rgba(234, 67, 53, 0.48)', orbs: ['rgba(234, 67, 53, 0.45)', 'rgba(66, 133, 244, 0.45)', 'rgba(52, 168, 83, 0.42)'], kicker: 'GALERIA', meta: 'Álbuns • Memórias na TV', tagline: 'Veja suas fotos, vídeos e álbuns da família na tela grande.' },
    { id: 'googlemaps', name: 'Google Maps', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'Google LLC', webUrl: 'https://maps.google.com', iconSrc: 'icons/googlemaps.jpg', bg: '#10221c', glow: 'rgba(52, 168, 83, 0.52)', orbs: ['rgba(52, 168, 83, 0.5)', 'rgba(66, 133, 244, 0.45)'], kicker: 'MAPAS & STREET VIEW', meta: 'Satélite • Rotas • Lugares', tagline: 'Explore cidades em 3D, Street View e planeje viagens na TV.' },
    { id: 'googleearth', name: 'Google Earth', category: 'utilities', storeCategory: 'ai', rating: 4.9, developer: 'Google LLC', webUrl: 'https://earth.google.com/web/', iconSrc: 'icons/googleearth.jpg', bg: '#0b182e', glow: 'rgba(66, 133, 244, 0.55)', orbs: ['rgba(66, 133, 244, 0.54)', 'rgba(52, 168, 83, 0.45)'], kicker: 'EXPLORAÇÃO 3D', meta: 'Globo Interativo • Voyager', tagline: 'Viaje pelo planeta em 3D com imagens de satélite em altíssima definição.' },
    { id: 'tradingview', name: 'TradingView', category: 'utilities', storeCategory: 'ai', rating: 4.8, developer: 'TradingView Inc.', webUrl: 'https://www.tradingview.com', iconSrc: 'icons/tradingview.jpg', bg: '#0c101b', glow: 'rgba(41, 98, 255, 0.54)', orbs: ['rgba(41, 98, 255, 0.52)', 'rgba(20, 35, 75, 0.48)'], kicker: 'MERCADO FINANCEIRO', meta: 'Gráficos Ao Vivo • B3 • Cripto', tagline: 'Acompanhe gráficos de ações, moedas e índices em tela cheia.' },
    { id: 'zoom', name: 'Zoom', category: 'utilities', storeCategory: 'ai', rating: 4.6, developer: 'Zoom Video', webUrl: 'https://app.zoom.us/wc', iconSrc: 'icons/zoom.jpg', bg: '#0a1c38', glow: 'rgba(45, 140, 255, 0.56)', orbs: ['rgba(45, 140, 255, 0.55)', 'rgba(15, 75, 165, 0.46)'], kicker: 'VIDEOCHAMADAS', meta: 'Reuniões na Sala', tagline: 'Participe de videochamadas e reuniões direto pela tela da TV.' },

    /* === SOCIAL, VÍDEOS & EDUCAÇÃO === */
    { id: 'youtube', name: 'YouTube', category: 'music', storeCategory: 'social', featured: true, rating: 4.9, developer: 'Google LLC', webUrl: 'https://www.youtube.com', iconSrc: 'icons/youtube.jpg', bg: '#ffffff', glow: 'rgba(255, 0, 51, 0.58)', orbs: ['rgba(220, 30, 60, 0.52)', 'rgba(80, 95, 140, 0.45)'], kicker: 'VÍDEOS 4K', meta: 'Criadores • Música • Ao Vivo', tagline: 'Seus canais favoritos, transmissões ao vivo e vídeos em 4K.' },
    { id: 'tiktok', name: 'TikTok', category: 'music', storeCategory: 'social', rating: 4.7, developer: 'TikTok Pte. Ltd.', webUrl: 'https://www.tiktok.com', iconSrc: 'icons/tiktok.jpg', bg: '#101014', glow: 'rgba(254, 44, 85, 0.54)', orbs: ['rgba(37, 244, 238, 0.48)', 'rgba(254, 44, 85, 0.5)'], kicker: 'VÍDEOS CURTOS & LIVES', meta: 'Para Você • Tendências', tagline: 'Vídeos curtos, humor, música e transmissões ao vivo.' },
    { id: 'instagram', name: 'Instagram', category: 'music', storeCategory: 'social', rating: 4.7, developer: 'Meta', webUrl: 'https://www.instagram.com', iconSrc: 'icons/instagram.jpg', bg: '#260c22', glow: 'rgba(225, 48, 108, 0.56)', orbs: ['rgba(225, 48, 108, 0.55)', 'rgba(247, 119, 55, 0.48)', 'rgba(131, 58, 180, 0.48)'], kicker: 'SOCIAL & REELS', meta: 'Feed • Stories • Reels', tagline: 'Acompanhe fotos, Stories e Reels dos seus criadores e amigos.' },
    { id: 'x', name: 'X', category: 'utilities', storeCategory: 'social', rating: 4.5, developer: 'X Corp.', webUrl: 'https://x.com', iconSrc: 'icons/x.jpg', bg: '#0c0d10', glow: 'rgba(220, 230, 245, 0.36)', orbs: ['rgba(85, 110, 145, 0.42)', 'rgba(25, 30, 40, 0.5)'], kicker: 'TEMPO REAL', meta: 'Notícias • Espaços • Assuntos', tagline: 'Acompanhe debates ao vivo, notícias urgentes e transmissões.' },
    { id: 'discord', name: 'Discord', category: 'games', storeCategory: 'social', rating: 4.8, developer: 'Discord Inc.', webUrl: 'https://discord.com/app', iconSrc: 'icons/discord.jpg', bg: '#161938', glow: 'rgba(88, 101, 242, 0.58)', orbs: ['rgba(88, 101, 242, 0.56)', 'rgba(40, 48, 125, 0.46)'], kicker: 'COMUNIDADES & VOZ', meta: 'Servidores • Streams • Chat', tagline: 'Converse por voz e vídeo ou assista streams de amigos na sala.' },
    { id: 'whatsapp', name: 'WhatsApp Web', category: 'utilities', storeCategory: 'social', rating: 4.8, developer: 'Meta', webUrl: 'https://web.whatsapp.com', iconSrc: 'icons/whatsapp.jpg', bg: '#092416', glow: 'rgba(37, 211, 102, 0.56)', orbs: ['rgba(37, 211, 102, 0.54)', 'rgba(18, 140, 126, 0.46)'], kicker: 'MENSAGENS', meta: 'Conversas • Áudios • Mídia', tagline: 'Conecte sua conta para responder mensagens e abrir mídias na tela.' },
    { id: 'telegram', name: 'Telegram Web', category: 'utilities', storeCategory: 'social', rating: 4.9, developer: 'Telegram FZ-LLC', webUrl: 'https://web.telegram.org', iconSrc: 'icons/telegram.jpg', bg: '#0b1e30', glow: 'rgba(38, 165, 228, 0.56)', orbs: ['rgba(38, 165, 228, 0.55)', 'rgba(20, 85, 135, 0.46)'], kicker: 'CANAL & MENSAGENS', meta: 'Canais • Nuvem Ilimitada', tagline: 'Canais de notícias, grupos e seus arquivos salvos na nuvem.' },
    { id: 'reddit', name: 'Reddit', category: 'utilities', storeCategory: 'social', rating: 4.7, developer: 'Reddit, Inc.', webUrl: 'https://www.reddit.com', iconSrc: 'icons/reddit.jpg', bg: '#260d05', glow: 'rgba(255, 69, 0, 0.58)', orbs: ['rgba(255, 69, 0, 0.55)', 'rgba(105, 35, 15, 0.46)'], kicker: 'COMUNIDADES', meta: 'Fóruns • Discussões • Vídeos', tagline: 'Descubra comunidades de cinema, games, tecnologia e curiosidades.' },
    { id: 'pinterest', name: 'Pinterest', category: 'utilities', storeCategory: 'social', rating: 4.8, developer: 'Pinterest, Inc.', webUrl: 'https://www.pinterest.com', iconSrc: 'icons/pinterest.jpg', bg: '#28070d', glow: 'rgba(230, 0, 35, 0.56)', orbs: ['rgba(230, 0, 35, 0.54)', 'rgba(85, 15, 30, 0.45)'], kicker: 'INSPIRAÇÃO', meta: 'Decoração • Receitas • Arte', tagline: 'Moodboards de decoração, arquitetura e receitas em alta resolução.' },
    { id: 'vimeo', name: 'Vimeo', category: 'music', storeCategory: 'social', rating: 4.7, developer: 'Vimeo.com', webUrl: 'https://vimeo.com/watch', iconSrc: 'icons/vimeo.jpg', bg: '#091f2c', glow: 'rgba(26, 183, 234, 0.55)', orbs: ['rgba(26, 183, 234, 0.54)', 'rgba(20, 65, 95, 0.46)'], kicker: 'CURTAS & ARTE', meta: 'Staff Picks • 4K Sem Anúncios', tagline: 'Curtas-metragens selecionados, documentários e produções independentes.' },
    { id: 'dailymotion', name: 'Dailymotion', category: 'music', storeCategory: 'social', rating: 4.4, developer: 'Dailymotion', webUrl: 'https://www.dailymotion.com/br', iconSrc: 'icons/dailymotion.jpg', bg: '#10141c', glow: 'rgba(0, 170, 255, 0.5)', orbs: ['rgba(0, 170, 255, 0.48)', 'rgba(40, 50, 75, 0.45)'], kicker: 'VÍDEOS & NOTÍCIAS', meta: 'Esportes • Música • Brasil', tagline: 'Plataforma de vídeos com canais de notícias e entretenimento.' },
    { id: 'ted', name: 'TED Talks', category: 'utilities', storeCategory: 'social', rating: 4.9, developer: 'TED Conferences', webUrl: 'https://www.ted.com/talks', iconSrc: 'icons/ted.jpg', bg: '#280707', glow: 'rgba(230, 43, 30, 0.58)', orbs: ['rgba(230, 43, 30, 0.55)', 'rgba(45, 15, 15, 0.5)'], kicker: 'IDEIAS & PALESTRAS', meta: 'Legendado em PT-BR', tagline: 'Palestras inspiradoras sobre ciência, tecnologia, psicologia e design.' },
    { id: 'duolingo', name: 'Duolingo', category: 'utilities', storeCategory: 'social', rating: 4.9, developer: 'Duolingo', webUrl: 'https://www.duolingo.com', iconSrc: 'icons/duolingo.jpg', bg: '#142608', glow: 'rgba(88, 204, 2, 0.58)', orbs: ['rgba(88, 204, 2, 0.55)', 'rgba(30, 95, 15, 0.46)'], kicker: 'IDIOMAS', meta: 'Inglês • Espanhol • Japonês', tagline: 'Pratique idiomas com lições interativas diretamente da tela grande.' },
    { id: 'khanacademy', name: 'Khan Academy', category: 'utilities', storeCategory: 'social', rating: 4.9, developer: 'Khan Academy', webUrl: 'https://pt.khanacademy.org', iconSrc: 'icons/khanacademy.jpg', bg: '#0c241d', glow: 'rgba(20, 191, 150, 0.55)', orbs: ['rgba(20, 191, 150, 0.54)', 'rgba(15, 65, 85, 0.45)'], kicker: 'EDUCAÇÃO GRATUITA', meta: 'Matemática • Ciências • História', tagline: 'Videoaulas e exercícios gratuitos em português para todas as idades.' },
    { id: 'coursera', name: 'Coursera', category: 'utilities', storeCategory: 'social', rating: 4.8, developer: 'Coursera Inc.', webUrl: 'https://www.coursera.org', iconSrc: 'icons/coursera.jpg', bg: '#091a36', glow: 'rgba(0, 86, 210, 0.56)', orbs: ['rgba(0, 86, 210, 0.55)', 'rgba(15, 55, 125, 0.46)'], kicker: 'CURSOS UNIVERSITÁRIOS', meta: 'Certificados • Tecnologia • Negócios', tagline: 'Assista cursos de grandes universidades mundiais direto na sua TV.' },
    { id: 'wikipedia', name: 'Wikipédia', category: 'utilities', storeCategory: 'social', rating: 4.9, developer: 'Wikimedia', webUrl: 'https://pt.wikipedia.org', iconSrc: 'icons/wikipedia.jpg', bg: '#1a1c22', glow: 'rgba(210, 220, 240, 0.4)', orbs: ['rgba(150, 165, 195, 0.42)', 'rgba(55, 65, 85, 0.46)'], kicker: 'ENCICLOPÉDIA LIVRE', meta: 'Pesquisa Rápida em PT-BR', tagline: 'Consulte artigos, biografias e fatos históricos enquanto assiste.' },
    { id: 'linkedin', name: 'LinkedIn', category: 'utilities', storeCategory: 'social', rating: 4.6, developer: 'Microsoft / LinkedIn', webUrl: 'https://www.linkedin.com', iconSrc: 'icons/linkedin.jpg', bg: '#0a1c30', glow: 'rgba(10, 102, 194, 0.56)', orbs: ['rgba(10, 102, 194, 0.55)', 'rgba(15, 50, 95, 0.46)'], kicker: 'REDE PROFISSIONAL', meta: 'Carreira • Notícias • Learning', tagline: 'Acompanhe artigos, vagas e cursos profissionais na tela.' },

    /* === CASA & CONTROLE === */
    { id: 'linkedin_dummy', _skip: true }
  ].filter((item) => !item._skip);

  function loadInstalledIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_INSTALLED) || 'null');
      if (Array.isArray(raw) && raw.length > 0) {
        const set = new Set(raw);
        CORE_SYSTEM_IDS.forEach((id) => set.add(id));
        return set;
      }
    } catch (_) { }
    return new Set(DEFAULT_INSTALLED_IDS);
  }

  let installedSet = loadInstalledIds();

  function saveInstalledIds() {
    CORE_SYSTEM_IDS.forEach((id) => installedSet.add(id));
    localStorage.setItem(STORAGE_INSTALLED, JSON.stringify([...installedSet]));
  }

  function loadCustomApps() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_CUSTOM) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  let customApps = loadCustomApps();

  function saveCustomApps() {
    localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(customApps));
  }

  function getFullCatalog() {
    return [...STORE_CATALOG, ...customApps];
  }

  function isAppInstalled(id) {
    return CORE_SYSTEM_IDS.has(id) || installedSet.has(id);
  }

  function installAppById(id) {
    installedSet.add(id);
    saveInstalledIds();
  }

  function uninstallAppById(id) {
    if (CORE_SYSTEM_IDS.has(id)) return false;
    installedSet.delete(id);
    customApps = customApps.filter((a) => a.id !== id);
    saveInstalledIds();
    saveCustomApps();
    return true;
  }

  function addCustomWebApp({ name, url }) {
    const cleanName = String(name || '').trim();
    let cleanUrl = String(url || '').trim();
    if (!cleanName || !cleanUrl) return null;
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;
    let parsed;
    try { parsed = new URL(cleanUrl); } catch (_) { return null; }

    const slug = `custom_${Date.now().toString(36)}`;
    const favicon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(parsed.origin)}&size=256`;
    const newApp = {
      id: slug,
      name: cleanName,
      category: 'utilities',
      storeCategory: 'ai',
      isCustom: true,
      developer: parsed.hostname.replace(/^www\./, ''),
      rating: 5.0,
      webUrl: parsed.toString(),
      iconSrc: favicon,
      bg: '#141926',
      glow: 'rgba(0, 194, 255, 0.52)',
      orbs: ['rgba(0, 194, 255, 0.5)', 'rgba(124, 77, 255, 0.45)'],
      kicker: 'SITE PERSONALIZADO',
      meta: `${parsed.hostname}`,
      tagline: `Site adicionado por você (${parsed.hostname}).`
    };
    customApps.unshift(newApp);
    installedSet.add(newApp.id);
    saveCustomApps();
    saveInstalledIds();
    return newApp;
  }

  function getInstalledAppsList() {
    return getFullCatalog().filter((a) => isAppInstalled(a.id));
  }

  /* =========================================================
     State tracking & APK Download Manager for IrisStore
     ========================================================= */
  const apkDownloadProgress = {};
  const activeApkPollers = {};

  async function triggerApkDownload(item, { onStateChange, playUiSound, showToast, onInstalledChanged } = {}) {
    if (!item) return;
    const appId = item.id;
    if (apkDownloadProgress[appId] && (apkDownloadProgress[appId].status === 'downloading' || apkDownloadProgress[appId].status === 'installing')) {
      return;
    }

    apkDownloadProgress[appId] = { status: 'downloading', progress: 5 };
    if (onStateChange) onStateChange();

    try {
      const res = await fetch('/api/os/install-apk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          androidPackage: item.androidPackage,
          apkMirrors: item.apkMirrors
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao iniciar download de mirrors reais');
      }

      if (activeApkPollers[appId]) clearInterval(activeApkPollers[appId]);

      activeApkPollers[appId] = setInterval(async () => {
        try {
          const stRes = await fetch(`/api/os/apk-status?id=${encodeURIComponent(appId)}`);
          if (!stRes.ok) return;
          const stData = await stRes.json();
          if (stData && stData.status) {
            apkDownloadProgress[appId] = {
              status: stData.status,
              progress: typeof stData.progress === 'number' ? stData.progress : 50,
              error: stData.error
            };
            if (stData.status === 'installed') {
              clearInterval(activeApkPollers[appId]);
              delete activeApkPollers[appId];
              installAppById(appId);
              if (playUiSound) playUiSound('chime');
              if (showToast) showToast(`${item.name} instalado!`);
              if (onInstalledChanged) onInstalledChanged();
            } else if (stData.status === 'error') {
              clearInterval(activeApkPollers[appId]);
              delete activeApkPollers[appId];
              if (showToast) showToast(`Erro ao baixar ${item.name}: ${stData.error || 'Falha nos mirrors'}`);
            }
            if (onStateChange) onStateChange();
          }
        } catch (pollErr) {
          console.warn('Erro ao verificar status do APK:', pollErr);
        }
      }, 1000);
    } catch (err) {
      console.error('Falha ao instalar APK:', err);
      apkDownloadProgress[appId] = { status: 'error', progress: 0, error: err.message };
      if (showToast) showToast(`Erro ao baixar ${item.name}: ${err.message}`);
      if (onStateChange) onStateChange();
    }
  }

  /* =========================================================
     Native irisStore UI Renderer inside app-stage-window
     ========================================================= */
  function openAppStoreStage({ appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound, showToast, launchApp, onInstalledChanged }) {
    const storeMeta = STORE_CATALOG.find((a) => a.id === 'appstore');
    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app');
    appStageWindow.style.setProperty('--stage-glow', storeMeta.glow);

    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${storeMeta.iconSrc}" alt="irisStore" /></div>
      <div class="app-stage-brand-title">irisStore <span class="store-brand-sub">Loja de Aplicativos</span></div>
    `;

    let activeCat = 'all';
    let query = '';
    let selectedDetailApp = null;
    let showCustomForm = false;

    const iconMarkup = (a) => (
      a.iconSrc
        ? `<img src="${escHtml(a.iconSrc)}" alt="${escHtml(a.name)}" loading="lazy" decoding="async" />`
        : `<div class="store-svg-fallback">${a.icon || ''}</div>`
    );

    const renderStore = () => {
      const catalog = getFullCatalog();
      const installedCount = catalog.filter((a) => isAppInstalled(a.id)).length;

      const matches = catalog.filter((item) => {
        if (activeCat === 'installed' && !isAppInstalled(item.id)) return false;
        if (activeCat !== 'all' && activeCat !== 'installed' && item.storeCategory !== activeCat) return false;
        if (query) {
          const hay = `${item.name} ${item.developer || ''} ${item.kicker || ''} ${item.tagline || ''} ${item.meta || ''}`.toLowerCase();
          if (!hay.includes(query.toLowerCase())) return false;
        }
        return true;
      });

      const cardMarkup = (item) => {
        const inst = isAppInstalled(item.id);
        const apkSt = apkDownloadProgress[item.id];
        const isApkBusy = apkSt && (apkSt.status === 'downloading' || apkSt.status === 'installing');

        let ctaButtonHtml = '';
        if (inst) {
          ctaButtonHtml = `<button class="store-btn-open" type="button" data-store-launch="${escHtml(item.id)}">Abrir</button>`;
        } else if (isApkBusy) {
          const label = apkSt.status === 'installing' ? '⚙ Instalando...' : `⬇ ${apkSt.progress || 0}%`;
          ctaButtonHtml = `<button class="store-btn-get is-busy" type="button" disabled style="opacity:0.85;cursor:wait;">${label}</button>`;
        } else {
          ctaButtonHtml = `<button class="store-btn-get" type="button" data-store-get="${escHtml(item.id)}">Obter</button>`;
        }

        return `
          <article class="store-app-card ${inst ? 'is-installed' : ''}" tabindex="0" data-store-card="${escHtml(item.id)}">
            <div class="store-app-icon" style="background:${item.bg}">${iconMarkup(item)}</div>
            <div class="store-app-info">
              <strong class="store-app-name">${escHtml(item.name)}</strong>
              <span class="store-app-sub">${escHtml(item.developer || 'Web')}</span>
            </div>
            <div class="store-app-cta">
              ${ctaButtonHtml}
            </div>
          </article>
        `;
      };

      const detailHtml = selectedDetailApp ? (() => {
        const d = selectedDetailApp;
        const inst = isAppInstalled(d.id);
        const sys = CORE_SYSTEM_IDS.has(d.id);
        const apkSt = apkDownloadProgress[d.id];
        const isApkBusy = apkSt && (apkSt.status === 'downloading' || apkSt.status === 'installing');

        let actionBtnHtml = '';
        if (inst) {
          actionBtnHtml = `
            <button class="btn-prism" id="store-detail-open" type="button">${d.isNative ? 'Abrir' : 'Abrir'}</button>
            ${!sys ? `<button class="btn-glass store-remove-btn" id="store-detail-uninstall" type="button">Desinstalar</button>` : `<span class="store-sys-note">Essencial do sistema</span>`}
          `;
        } else if (isApkBusy) {
          const label = apkSt.status === 'installing' ? '⚙ Instalando...' : `⬇ Baixando (${apkSt.progress || 0}%)...`;
          actionBtnHtml = `<button class="btn-prism" id="store-detail-install" type="button" disabled style="opacity:0.85;cursor:wait;">${label}</button>`;
        } else {
          actionBtnHtml = `<button class="btn-prism" id="store-detail-install" type="button">Instalar</button>`;
        }

        return `
          <div class="store-detail-sheet">
            <button id="store-detail-back" class="btn-glass store-detail-back" type="button">← Voltar à loja</button>
            <div class="store-detail-head">
              <div class="store-detail-icon" style="background:${d.bg}">${iconMarkup(d)}</div>
              <div class="store-detail-meta">
                <h2>${escHtml(d.name)}</h2>
                <p class="store-detail-dev">${escHtml(d.developer || 'Web')}</p>
                <p class="store-detail-desc">${escHtml(d.tagline || '')}</p>
                <div class="store-detail-actions">
                  ${actionBtnHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      })() : '';

      const customFormHtml = showCustomForm ? `
        <form id="store-custom-form" class="store-custom-form">
          <div class="store-custom-fields">
            <input id="store-custom-name" class="shows-search-input" type="text" placeholder="Nome do App (ex: Globo Esporte, Notion...)" required />
            <input id="store-custom-url" class="shows-search-input" type="text" placeholder="Site / URL (ex: ge.globo.com)" required />
            <button class="btn-prism" type="submit" style="height:40px;padding:0 18px;">Criar App</button>
            <button id="store-custom-cancel" class="btn-glass" type="button" style="height:40px;padding:0 14px;">Cancelar</button>
          </div>
        </form>
      ` : '';

      const groupedSectionsHtml = (!query && activeCat === 'all')
        ? STORE_CATEGORIES
            .filter((c) => c.id !== 'all' && c.id !== 'installed')
            .map((cat) => {
              const catItems = catalog.filter((a) => a.storeCategory === cat.id);
              if (!catItems.length) return '';
              return `
                <section class="store-section">
                  <h3 class="store-section-title">${escHtml(cat.label)}</h3>
                  <div class="store-grid">
                    ${catItems.map(cardMarkup).join('')}
                  </div>
                </section>
              `;
            })
            .join('')
        : `<div class="store-grid">
            ${matches.length ? matches.map(cardMarkup).join('') : `<div class="shows-empty-state">Nenhum aplicativo encontrado para "${escHtml(query)}".</div>`}
           </div>`;

      appStageBody.innerHTML = `
        <div class="store-shell">
          <aside class="store-sidebar" aria-label="Categorias da Loja">
            <div class="store-cats-col">
              ${STORE_CATEGORIES.map((c) => `
                <button class="store-cat-btn ${activeCat === c.id ? 'active' : ''}" type="button" data-store-cat="${c.id}">
                  ${escHtml(c.label)}
                </button>
              `).join('')}
            </div>
            <div class="store-sidebar-actions">
              <button id="store-add-custom-btn" class="btn-glass" type="button">+ Adicionar Site</button>
              <button id="store-install-all-btn" class="btn-glass" type="button">Instalar Todos</button>
            </div>
          </aside>

          <div class="store-main">
            <div class="store-topbar">
              <div class="store-search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input id="store-search-input" class="store-search-input" type="search" value="${escHtml(query)}" placeholder="Buscar aplicativos..." />
              </div>
              <span class="store-count-pill">${installedCount} instalados</span>
            </div>

            ${customFormHtml}
            ${detailHtml || groupedSectionsHtml}
          </div>
        </div>
      `;

      const searchInput = appStageBody.querySelector('#store-search-input');
      searchInput?.addEventListener('input', (e) => {
        query = e.target.value;
        selectedDetailApp = null;
        renderStore();
        const nextInput = document.getElementById('store-search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(query.length, query.length);
        }
      });

      appStageBody.querySelector('#store-add-custom-btn')?.addEventListener('click', () => {
        playUiSound('select');
        showCustomForm = !showCustomForm;
        renderStore();
      });

      appStageBody.querySelector('#store-custom-cancel')?.addEventListener('click', () => {
        showCustomForm = false;
        renderStore();
      });

      appStageBody.querySelector('#store-custom-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('store-custom-name')?.value;
        const url = document.getElementById('store-custom-url')?.value;
        const created = addCustomWebApp({ name, url });
        if (!created) {
          showToast('Informe um nome e uma URL válida.');
          return;
        }
        playUiSound('chime');
        showCustomForm = false;
        if (onInstalledChanged) onInstalledChanged();
        showToast(`${created.name} adicionado aos seus Apps!`);
        renderStore();
      });

      appStageBody.querySelector('#store-install-all-btn')?.addEventListener('click', () => {
        let added = 0;
        getFullCatalog().forEach((it) => {
          if (!isAppInstalled(it.id)) {
            installAppById(it.id);
            added += 1;
          }
        });
        playUiSound('chime');
        if (onInstalledChanged) onInstalledChanged();
        showToast(added > 0 ? `${added} aplicativos instalados no IrisOS!` : 'Todos os aplicativos da loja já estão instalados.');
        renderStore();
      });

      appStageBody.querySelectorAll('[data-store-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          playUiSound('move');
          activeCat = btn.dataset.storeCat;
          selectedDetailApp = null;
          renderStore();
        });
      });

      appStageBody.querySelectorAll('[data-store-get]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.storeGet;
          const target = getFullCatalog().find((a) => a.id === id);
          if (!target) return;
          if (target.isApk || target.androidPackage || target.apkMirrors) {
            playUiSound('select');
            triggerApkDownload(target, {
              onStateChange: () => renderStore(),
              playUiSound,
              showToast,
              onInstalledChanged
            });
            renderStore();
          } else {
            installAppById(id);
            playUiSound('chime');
            if (onInstalledChanged) onInstalledChanged();
            showToast(`${target.name} instalado!`);
            renderStore();
          }
        });
      });

      appStageBody.querySelectorAll('[data-store-launch]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = getFullCatalog().find((a) => a.id === btn.dataset.storeLaunch);
          if (target) launchApp(target);
        });
      });

      appStageBody.querySelectorAll('[data-store-del]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.storeDel;
          const target = getFullCatalog().find((a) => a.id === id);
          if (uninstallAppById(id)) {
            playUiSound('back');
            if (onInstalledChanged) onInstalledChanged();
            showToast(`${target?.name || 'App'} removido`);
            renderStore();
          }
        });
      });

      appStageBody.querySelectorAll('[data-store-card]').forEach((card) => {
        card.addEventListener('click', () => {
          playUiSound('select');
          selectedDetailApp = getFullCatalog().find((a) => a.id === card.dataset.storeCard) || null;
          renderStore();
        });
      });

      appStageBody.querySelector('#store-detail-back')?.addEventListener('click', () => {
        playUiSound('back');
        selectedDetailApp = null;
        renderStore();
      });

      appStageBody.querySelector('#store-detail-open')?.addEventListener('click', () => {
        if (selectedDetailApp) launchApp(selectedDetailApp);
      });

      appStageBody.querySelector('#store-detail-install')?.addEventListener('click', () => {
        if (!selectedDetailApp) return;
        if (selectedDetailApp.isApk || selectedDetailApp.androidPackage || selectedDetailApp.apkMirrors) {
          playUiSound('select');
          triggerApkDownload(selectedDetailApp, {
            onStateChange: () => renderStore(),
            playUiSound,
            showToast,
            onInstalledChanged
          });
          renderStore();
        } else {
          installAppById(selectedDetailApp.id);
          playUiSound('chime');
          if (onInstalledChanged) onInstalledChanged();
          showToast(`${selectedDetailApp.name} instalado!`);
          renderStore();
        }
      });

      appStageBody.querySelector('#store-detail-uninstall')?.addEventListener('click', () => {
        if (!selectedDetailApp) return;
        const n = selectedDetailApp.name;
        if (uninstallAppById(selectedDetailApp.id)) {
          playUiSound('back');
          if (onInstalledChanged) onInstalledChanged();
          showToast(`${n} removido`);
          renderStore();
        }
      });
    };

    renderStore();
    appStageOverlay.classList.remove('hidden');
  }

  window.IrisStore = {
    getFullCatalog,
    getInstalledAppsList,
    isAppInstalled,
    installAppById,
    uninstallAppById,
    openAppStoreStage
  };
})();

/**
 * irisTV Lightning — Central Data Store & Rich Catalogs
 */
(function () {
  'use strict';

  window.IrisCatalog = {
    // Shows & Movies with Cast, Episodes & Streams
    shows: [
      {
        id: 'severance',
        title: 'Severance (Ruptura)',
        genre: 'Suspense Sci-Fi • 4K HDR',
        sub: 'Apple TV+ Original • 2 Temporadas',
        desc: 'Mark lidera uma equipe de funcionários de escritório cujas memórias foram divididas cirurgicamente entre o trabalho e suas vidas pessoais. Quando um colega misterioso aparece fora do trabalho, inicia-se uma jornada para descobrir a verdade sobre seu emprego.',
        rating: '16',
        score: '8.7',
        year: '2022',
        duration: '50 min/ep',
        poster: 'media/poster-severance.jpg',
        bg: 'media/bg-severance.jpg',
        stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        cast: [
          { name: 'Adam Scott', role: 'Mark Scout' },
          { name: 'Patricia Arquette', role: 'Harmony Cobel' },
          { name: 'John Turturro', role: 'Irving Bailiff' },
          { name: 'Christopher Walken', role: 'Burt Goodman' },
          { name: 'Britt Lower', role: 'Helly Riggs' }
        ],
        episodes: [
          { ep: '1', title: 'Boas Notícias Sobre o Inferno', dur: '57 min', desc: 'Helly acorda em uma sala de reuniões sem memória de sua identidade.' },
          { ep: '2', title: 'Meio Loop', dur: '53 min', desc: 'Mark leva Helly em um tour pelas regras e departamentos da Lumon.' },
          { ep: '3', title: 'Na Perpétua', dur: '51 min', desc: 'Mark e sua equipe fazem uma visita ao Salão da Perpétua.' },
          { ep: '4', title: 'Você Que É', dur: '52 min', desc: 'Helly tenta de todas as formas enviar uma mensagem para sua versão exterior.' }
        ]
      },
      {
        id: 'dune-2',
        title: 'Duna: Parte Dois',
        genre: 'Ficção Científica Épica • 4K IMAX',
        sub: 'Cinema • Warner Bros',
        desc: 'Paul Atreides se une a Chani e aos Fremen enquanto busca vingança contra os conspiradores que destruíram sua família. Diante de uma escolha entre o amor de sua vida e o destino do universo conhecido, ele luta para evitar um futuro terrível que só ele pode prever.',
        rating: '14',
        score: '8.9',
        year: '2024',
        duration: '2h 46min',
        poster: 'media/poster-dune-2.jpg',
        bg: 'media/bg-dune-2.jpg',
        stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        cast: [
          { name: 'Timothée Chalamet', role: 'Paul Atreides' },
          { name: 'Zendaya', role: 'Chani' },
          { name: 'Rebecca Ferguson', role: 'Lady Jessica' },
          { name: 'Javier Bardem', role: 'Stilgar' },
          { name: 'Austin Butler', role: 'Feyd-Rautha' }
        ],
        episodes: [
          { ep: '1', title: 'Filme Completo (4K HDR)', dur: '166 min', desc: 'Reprodução integral com áudio Dolby Atmos.' }
        ]
      },
      {
        id: 'the-last-of-us',
        title: 'The Last of Us',
        genre: 'Drama Pós-Apocalíptico • HBO',
        sub: 'Max Original • 4K Dolby Vision',
        desc: 'Vinte anos após uma praga de fungos destruir o planeta, os sobreviventes Joel e Ellie se unem na esperança de encontrar a cura para a humanidade.',
        rating: '16',
        score: '8.8',
        year: '2023',
        duration: '60 min/ep',
        poster: 'media/poster-the-last-of-us.jpg',
        bg: 'media/bg-the-last-of-us.jpg',
        stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        cast: [
          { name: 'Pedro Pascal', role: 'Joel Miller' },
          { name: 'Bella Ramsey', role: 'Ellie Williams' },
          { name: 'Gabriel Luna', role: 'Tommy' }
        ],
        episodes: [
          { ep: '1', title: 'Quando Estiver Perdido na Escuridão', dur: '81 min', desc: 'O início da pandemia e a missão de Joel.' },
          { ep: '2', title: 'Infectados', dur: '53 min', desc: 'Joel, Tess e Ellie cruzam as ruínas de Boston.' },
          { ep: '3', title: 'Muito, Muito Tempo', dur: '75 min', desc: 'A história comovente de sobrevivência de Bill e Frank.' }
        ]
      },
      {
        id: 'oppenheimer',
        title: 'Oppenheimer',
        genre: 'Drama Histórico • Vencedor do Oscar',
        sub: 'Universal Pictures • 4K HDR',
        desc: 'A trajetória de J. Robert Oppenheimer e o grupo de cientistas no Projeto Manhattan durante a Segunda Guerra Mundial para criar a primeira arma nuclear.',
        rating: '16',
        score: '8.9',
        year: '2023',
        duration: '3h 00min',
        poster: 'media/poster-oppenheimer.jpg',
        bg: 'media/bg-oppenheimer.jpg',
        stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        cast: [
          { name: 'Cillian Murphy', role: 'J. Robert Oppenheimer' },
          { name: 'Emily Blunt', role: 'Kitty Oppenheimer' },
          { name: 'Matt Damon', role: 'Leslie Groves' },
          { name: 'Robert Downey Jr.', role: 'Lewis Strauss' }
        ],
        episodes: [
          { ep: '1', title: 'Filme Completo (4K UHD)', dur: '180 min', desc: 'Apresentação em alta definição com som surround cinematográfico.' }
        ]
      },
      {
        id: 'arcane',
        title: 'Arcane',
        genre: 'Animação & Fantasia • League of Legends',
        sub: 'Netflix • Vencedora de 4 Emmys',
        desc: 'Em meio ao conflito entre as cidades-gêmeas de Piltover e Zaun, duas irmãs lutam em lados opostos de uma guerra entre tecnologias mágicas e convicções incompatíveis.',
        rating: '14',
        score: '9.0',
        year: '2021',
        duration: '42 min/ep',
        poster: 'media/poster-arcane.jpg',
        bg: 'media/bg-arcane.jpg',
        stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        cast: [
          { name: 'Hailee Steinfeld', role: 'Vi' },
          { name: 'Ella Purnell', role: 'Jinx' },
          { name: 'Katie Leung', role: 'Caitlyn' }
        ],
        episodes: [
          { ep: '1', title: 'Entrando na Brincadeira', dur: '43 min', desc: 'Duas irmãs órfãs tentam sobreviver nas ruas da subferiferia.' },
          { ep: '2', title: 'Alguns Mistérios Devem Ficar Ocultos', dur: '40 min', desc: 'Jayce realiza experimentos proibidos com magia arcana.' },
          { ep: '3', title: 'A Violência Básica Necessária Para a Mudança', dur: '44 min', desc: 'A noite fatídica que separa Vi e Powder para sempre.' }
        ]
      },
      {
        id: 'fallout',
        title: 'Fallout',
        genre: 'Ação & Sci-Fi Pós-Apocalíptico',
        sub: 'Prime Video Original • 4K HDR10+',
        desc: 'Duzentos anos após o apocalipse nuclear, os gentis moradores de luxuosos abrigos subterrâneos são forçados a retornar à paisagem irradiada e bizarra deixada por seus ancestrais.',
        rating: '18',
        score: '8.5',
        year: '2024',
        duration: '55 min/ep',
        poster: 'media/poster-fallout.jpg',
        bg: 'media/bg-fallout.jpg',
        stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        cast: [
          { name: 'Ella Purnell', role: 'Lucy MacLean' },
          { name: 'Walton Goggins', role: 'O Ghoul' },
          { name: 'Aaron Moten', role: 'Maximus' }
        ],
        episodes: [
          { ep: '1', title: 'O Fim', dur: '74 min', desc: 'Um ataque ao Refúgio 33 força Lucy a subir à superfície.' },
          { ep: '2', title: 'O Alvo', dur: '65 min', desc: 'Lucy descobre a brutalidade e as regras bizarras dos ermos.' }
        ]
      }
    ],

    // Live Channels with EPG Schedules
    channels: [
      {
        num: '1',
        name: 'Rede Globo',
        logo: 'icons/globoplay.jpg',
        stream: 'http://hls1.sua.tv/live/globotvbahiafhdbr2/s.m3u8',
        now: 'Jornal Nacional',
        next: 'Novela das Nove: Mania de Você',
        epg: [
          { time: '20:00', title: 'Jornal Nacional', dur: '45m' },
          { time: '20:45', title: 'Mania de Você', dur: '55m' },
          { time: '21:40', title: 'Cinema Especial: Top Gun', dur: '120m' }
        ]
      },
      {
        num: '2',
        name: 'SBT HD',
        logo: 'icons/sbt.png',
        stream: 'https://video09.logicahost.com.br/sbtmutum/sbtmutum/playlist.m3u8',
        now: 'SBT Brasil',
        next: 'Programa do Ratinho',
        epg: [
          { time: '19:45', title: 'SBT Brasil', dur: '50m' },
          { time: '20:35', title: 'A Infância de Romeu e Julieta', dur: '45m' },
          { time: '21:20', title: 'Programa do Ratinho', dur: '75m' }
        ]
      },
      {
        num: '3',
        name: 'Record TV',
        logo: 'icons/record.png',
        stream: 'http://170.83.16.50/RECORD_NEWS/tracks-v1a1/mono.m3u8',
        now: 'Jornal da Record',
        next: 'Força de Mulher',
        epg: [
          { time: '19:55', title: 'Jornal da Record', dur: '60m' },
          { time: '21:00', title: 'Força de Mulher', dur: '50m' },
          { time: '21:50', title: 'Gênesis Especial', dur: '60m' }
        ]
      },
      {
        num: '4',
        name: 'Band TV',
        logo: 'icons/band.jpg',
        stream: 'https://cdn.live.br1.jmvstream.com/w/LVW-15748/LVW15748_Yed7yzLuRC/playlist.m3u8',
        now: 'Jornal da Band',
        next: 'Melhor da Noite',
        epg: [
          { time: '19:20', title: 'Jornal da Band', dur: '70m' },
          { time: '20:30', title: 'Melhor da Noite', dur: '90m' },
          { time: '22:00', title: 'Perrengue na Band', dur: '60m' }
        ]
      },
      {
        num: '5',
        name: 'TV Cultura',
        logo: 'icons/tvcultura.png',
        stream: 'https://player-tvcultura.stream.uol.com.br/live/tvcultura.m3u8',
        now: 'Jornal da Cultura',
        next: 'Roda Viva Especial',
        epg: [
          { time: '20:00', title: 'Jornal da Cultura', dur: '60m' },
          { time: '21:00', title: 'Roda Viva Especial', dur: '90m' }
        ]
      },
      {
        num: '6',
        name: 'CNN Brasil',
        logo: 'icons/cnnbrasil.jpg',
        stream: 'https://d25usgadhphvwi.cloudfront.net/hls/main.m3u8',
        now: 'CNN Prime Time',
        next: 'Bastidores do Poder',
        epg: [
          { time: '20:00', title: 'CNN Prime Time', dur: '120m' },
          { time: '22:00', title: 'Bastidores do Poder', dur: '60m' }
        ]
      }
    ],

    // Dock Apps
    apps: [
      { id: 'netflix', name: 'Netflix', icon: 'icons/netflix.jpg' },
      { id: 'youtube', name: 'YouTube', icon: 'icons/youtube.jpg' },
      { id: 'prime', name: 'Prime Video', icon: 'icons/prime.jpg' },
      { id: 'max', name: 'Max', icon: 'icons/max.jpg' },
      { id: 'disney', name: 'Disney+', icon: 'icons/disney.jpg' },
      { id: 'spotify', name: 'Spotify', icon: 'icons/spotify.jpg' },
      { id: 'media', name: 'Mídia', icon: 'icons/youtubemusic.jpg', isInternal: true },
      { id: 'livetv', name: 'TV Aberta', icon: 'icons/redetv.png', isInternal: true },
      { id: 'news', name: 'Notícias', icon: 'icons/globonews.svg', isInternal: true },
      { id: 'dvr', name: 'Gravador DVR', icon: 'icons/canaluol.png', isInternal: true },
      { id: 'vault', name: 'Cofre de Senhas', icon: 'icons/mediaplayer.svg', isInternal: true },
      { id: 'settings', name: 'Ajustes', icon: 'icons/appstore.svg', isInternal: true }
    ],

    // News Feed (G1, UOL, Tech)
    news: [
      {
        id: 'n1',
        cat: 'TECNOLOGIA',
        headline: 'irisTV lança versão nativa em LightningJS com 60 FPS garantidos para Smart TVs',
        time: 'Há 15 minutos',
        source: 'TechNews Brasil',
        body: 'O sistema irisTV concluiu a migração do seu frontend para Canvas WebGL puro usando a engine LightningJS. A nova versão elimina a árvore DOM tradicional, garantindo taxas estáveis de 60 FPS em hardware embarcado como processadores ARM de TVs LG e Samsung.'
      },
      {
        id: 'n2',
        cat: 'BRASIL',
        headline: 'Mercado de Smart TVs registra alta na busca por sistemas abertos e rápidos',
        time: 'Há 1 hora',
        source: 'G1 Economia',
        body: 'Consumidores têm priorizado fluidez de navegação e rapidez de abertura de aplicativos no lugar de interfaces pesadas com animações excessivas que travam em televisores de anos anteriores.'
      },
      {
        id: 'n3',
        cat: 'CINEMA',
        headline: 'Premiações internacionais consagram filmes e séries gravadas em alta resolução',
        time: 'Há 3 horas',
        source: 'CinePop',
        body: 'Produções épicas de ficção científica e dramas históricos dominaram as indicações técnicas de som e cinematografia em 2024.'
      }
    ],

    // Passwords & Vault Credentials
    vault: {
      locked: true,
      pin: '1234',
      items: [
        { service: 'Wi-Fi Casa (5GHz)', user: 'Rede_Casa_Fibra', pass: 'IrisTv#Wifi2026', type: 'Rede' },
        { service: 'Netflix 4K', user: 'familia@iristv.local', pass: 'Nflx*SecurePass!', type: 'Streaming' },
        { service: 'Max / HBO', user: 'assinante@iristv.local', pass: 'HboMax#Pass77', type: 'Streaming' },
        { service: 'Hub LAN IP', user: 'admin', pass: '192.168.1.105:3000', type: 'Servidor' }
      ]
    },

    // DVR Recordings
    dvr: [
      { id: 'rec-1', title: 'Jornal Nacional - 18/11', ch: 'Rede Globo', dur: '45 min', size: '1.2 GB', date: 'Hoje às 20:00', stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { id: 'rec-2', title: 'Roda Viva Especial', ch: 'TV Cultura', dur: '90 min', size: '2.4 GB', date: 'Ontem às 21:00', stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { id: 'rec-3', title: 'Melhor da Noite', ch: 'Band TV', dur: '55 min', size: '1.5 GB', date: '16 de Nov', stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
    ],

    // Wallpapers 4K
    wallpapers: [
      { id: 'fitzroy', name: 'Monte Fitz Roy ao Entardecer', loc: 'Patagônia, Argentina', src: 'media/wallpapers/patagonia-fitzroy-sunset.jpg' },
      { id: 'aurora', name: 'Aurora Boreal sobre os Fjords', loc: 'Tromsø, Noruega', src: 'media/wallpapers/nordic-aurora-borealis.jpg' },
      { id: 'dolomites', name: 'Picos Alpinos e Lago Esmeralda', loc: 'Dolomitas, Itália', src: 'media/wallpapers/dolomites-alpine-lake.jpg' },
      { id: 'tokyo', name: 'Tóquio Neon na Chuva', loc: 'Shibuya, Japão', src: 'media/wallpapers/cyberpunk-tokyo-rain.jpg' },
      { id: 'space', name: 'Nebulosa Cósmica e Campo Estelar', loc: 'Espaço Profundo', src: 'media/wallpapers/deep-space-nebula-carina.jpg' },
      { id: 'fuji', name: 'Monte Fuji com Flores de Cerejeira', loc: 'Honshu, Japão', src: 'media/wallpapers/fuji-sakura-spring.jpg' }
    ],

    // Music & Synced Lyrics
    music: {
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
        { t: 28, text: 'You can\'t surprise me, I know' },
        { t: 32, text: 'I bite my tongue, it\'s a bad habit' },
        { t: 36, text: 'Kinda thought that you needed me' }
      ]
    }
  };
})();

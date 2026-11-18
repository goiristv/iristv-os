const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFile, spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
// Por padrão só aceita conexões da própria máquina. Para liberar a rede local: IRISTV_HOST=0.0.0.0
const HOST = process.env.IRISTV_HOST || '127.0.0.1';
const ROOT_DIR = __dirname;
const HLS_BUNDLE_PATH = fs.existsSync(path.join(ROOT_DIR, 'vendor', 'hls.min.js'))
  ? path.join(ROOT_DIR, 'vendor', 'hls.min.js')
  : path.join(ROOT_DIR, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const PYTHON_BIN = fs.existsSync('/Library/Frameworks/Python.framework/Versions/3.11/bin/python3')
  ? '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3'
  : 'python3';
const CAPTIONS_WORKER = path.join(ROOT_DIR, 'captions-worker.py');
let activeCaptionProc = null;
let captionWorkerReady = false;
let captionActiveSession = null;
const captionClients = new Set();
const captionJobQueue = [];
let captionFlushing = false;
const segmentCache = new Map();
const isLowRam = (os.totalmem() || 0) < 384 * 1024 * 1024;
const MAX_SEGMENT_CACHE = isLowRam ? 8 : 32;
const MAX_SEGMENT_BYTES = isLowRam ? (1.5 * 1024 * 1024) : (5 * 1024 * 1024);
const activeRecordings = new Map();
const EPG_CACHE = new Map();
const EPG_CACHE_TTL_MS = 30 * 60 * 1000;

// Otimização de Coleta de Lixo para perfis de 128MB / 256MB
if (typeof global.gc === 'function') {
  setInterval(() => {
    try { global.gc(); } catch (_) {}
  }, 30000);
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function resolveMeuguiaCode(channelName) {
  const n = String(channelName || '').toLowerCase();
  if (/cultura/.test(n)) return 'CUL';
  if (/sbt/.test(n)) return 'SBT';
  if (/record\s*news/.test(n)) return 'RCN';
  if (/record/.test(n)) return 'REC';
  if (/cnn/.test(n)) return 'CNN';
  if (/espn/.test(n)) return 'ESP';
  if (/band/.test(n)) return 'BAN';
  if (/sportv/.test(n)) return 'SPO';
  if (/globo/.test(n)) return 'GLB';
  if (/tnt/.test(n)) return 'TNT';
  if (/hbo/.test(n)) return 'HBO';
  if (/pluto|cine/.test(n)) return 'TNT';
  if (/fifa|uol/.test(n)) return 'SPO';
  return 'CUL';
}

async function fetchChannelEpg(channelName, daysCount = 5) {
  const code = resolveMeuguiaCode(channelName);
  const cacheKey = `${code}|${daysCount}`;
  const cached = EPG_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const url = `https://meuguia.tv/programacao/canal/${code}`;
  const buf = await fetchBufferWithRedirects(url);
  const html = buf.toString('utf8');

  const days = [];
  let currentDay = null;
  const tokenRe = /<li class="subheader[^>]*>([\s\S]*?)<\/li>|<div class=['"]lileft time['"]>([\s\S]*?)<\/div>[\s\S]*?<div class="licontent">\s*<h2>([\s\S]*?)<\/h2>\s*<h3>([\s\S]*?)<\/h3>/g;

  const now = new Date();
  const baseYear = now.getFullYear();
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1]) {
      const label = decodeHtmlEntities(m[1]);
      if (!label || label.includes('<%')) continue;
      const dm = /(\d{1,2})\/(\d{1,2})/.exec(label);
      let isoDate = '';
      if (dm) {
        const dd = String(Number(dm[1])).padStart(2, '0');
        const mm = String(Number(dm[2])).padStart(2, '0');
        isoDate = `${baseYear}-${mm}-${dd}`;
      }
      if (!currentDay || currentDay.label !== label) {
        if (days.length >= daysCount) break;
        currentDay = { label, isoDate, items: [] };
        days.push(currentDay);
      }
    } else if (m[2] && currentDay) {
      const timeStr = decodeHtmlEntities(m[2]);
      const title = decodeHtmlEntities(m[3]);
      const category = decodeHtmlEntities(m[4]);
      const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
      let startTs = 0;
      if (tm && currentDay.isoDate) {
        const dt = new Date(`${currentDay.isoDate}T${String(Number(tm[1])).padStart(2, '0')}:${tm[2]}:00`);
        startTs = dt.getTime();
      }
      currentDay.items.push({ time: timeStr, title, category, startTs });
    }
  }

  for (const day of days) {
    for (let i = 0; i < day.items.length; i++) {
      const cur = day.items[i];
      const next = day.items[i + 1];
      if (next && next.startTs > cur.startTs) {
        cur.endTs = next.startTs;
        cur.endTime = next.time;
      } else if (cur.startTs) {
        cur.endTs = cur.startTs + 60 * 60 * 1000;
        const ed = new Date(cur.endTs);
        cur.endTime = `${String(ed.getHours()).padStart(2, '0')}:${String(ed.getMinutes()).padStart(2, '0')}`;
      }
    }
  }

  const data = { ok: true, channel: channelName, code, days };
  EPG_CACHE.set(cacheKey, { data, expiresAt: Date.now() + EPG_CACHE_TTL_MS });
  return data;
}

function getRecordingsDir() {
  const dir = path.join(__dirname, 'recordings');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}

function loadSchedules() {
  const p = path.join(getRecordingsDir(), 'schedules.json');
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveSchedules(list) {
  const p = path.join(getRecordingsDir(), 'schedules.json');
  fs.writeFileSync(p, JSON.stringify(list, null, 2));
}

function startFfmpegRecording({ streamUrl, channelNum = '', channelName = 'TV ao Vivo', program = 'Programa ao vivo', autoStopMin = 0 }) {
  const recDir = getRecordingsDir();
  const safeCh = String(channelName || 'canal').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 32);
  const id = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const fileName = `${safeCh}_${Date.now()}.mp4`;
  const filePath = path.join(recDir, fileName);
  const metaPath = path.join(recDir, 'recordings.json');
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) {}
  const startedAt = Date.now();
  meta[fileName] = { channelNum: String(channelNum), channelName: String(channelName), program: String(program), startedAt };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  const proc = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-user_agent', 'Mozilla/5.0',
    '-i', streamUrl,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    filePath
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  const recObj = { id, channelNum: String(channelNum), channelName: String(channelName), program: String(program), fileName, filePath, startedAt, proc };
  activeRecordings.set(id, recObj);
  proc.on('exit', () => { activeRecordings.delete(id); });
  proc.on('error', () => { activeRecordings.delete(id); });

  if (autoStopMin > 0) {
    setTimeout(() => { stopFfmpegRecording(id); }, autoStopMin * 60 * 1000);
  }
  return recObj;
}

async function stopFfmpegRecording(id) {
  const rec = activeRecordings.get(id);
  if (!rec) return null;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    rec.proc.once('exit', finish);
    try { rec.proc.stdin.write('q\n'); } catch (_) {}
    setTimeout(() => { try { rec.proc.kill('SIGINT'); } catch (_) {} }, 800);
    setTimeout(finish, 3500);
  });
  activeRecordings.delete(id);
  let size = 0;
  try { size = fs.statSync(rec.filePath).size; } catch (_) {}
  return { id, fileName: rec.fileName, size };
}

setInterval(() => {
  const schedules = loadSchedules();
  if (!schedules.length) return;
  const now = new Date();
  const nowTs = now.getTime();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dow = now.getDay();
  let changed = false;

  for (const s of schedules) {
    if (!s.streamUrl) continue;
    if (s.mode === 'once') {
      if (!s.triggered && s.startTs && nowTs >= s.startTs && nowTs <= s.startTs + 90 * 1000) {
        s.triggered = true;
        changed = true;
        startFfmpegRecording({
          streamUrl: s.streamUrl,
          channelNum: s.channelNum,
          channelName: s.channelName,
          program: s.program,
          autoStopMin: Math.max(5, Number(s.durationMin) || 60)
        });
      }
    } else if (s.mode === 'daily' || s.mode === 'weekdays') {
      const daysMatch = s.mode === 'daily' || (Array.isArray(s.days) && s.days.includes(dow));
      if (daysMatch && s.time === hhmm && s.lastTriggeredDate !== todayIso) {
        s.lastTriggeredDate = todayIso;
        changed = true;
        startFfmpegRecording({
          streamUrl: s.streamUrl,
          channelNum: s.channelNum,
          channelName: s.channelName,
          program: s.program,
          autoStopMin: Math.max(5, Number(s.durationMin) || 60)
        });
      }
    }
  }
  if (changed) saveSchedules(schedules);
}, 15000);

function cacheSegment(url, buf) {
  if (!url || !buf || !buf.length || buf.length > MAX_SEGMENT_BYTES) return;
  if (segmentCache.has(url)) segmentCache.delete(url);
  segmentCache.set(url, buf);
  while (segmentCache.size > MAX_SEGMENT_CACHE) {
    const oldestKey = segmentCache.keys().next().value;
    segmentCache.delete(oldestKey);
  }
}

function fetchBufferWithRedirects(targetUrlStr, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 4) return reject(new Error('Too many redirects'));
    let parsed;
    try { parsed = new URL(targetUrlStr); } catch (e) { return reject(e); }
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.get(
      parsed,
      {
        agent: isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: '*/*'
        },
        timeout: 8000
      },
      (res) => {
        const status = res.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, parsed).toString();
          return resolve(fetchBufferWithRedirects(next, hops + 1));
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total <= MAX_SEGMENT_BYTES) chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

const CHANNEL_HEALTH = new Map();
const HEALTH_CACHE_TTL_MS = 25 * 1000;

function checkSingleStreamHealth(streamUrl) {
  const now = Date.now();
  const cached = CHANNEL_HEALTH.get(streamUrl);
  if (cached && (now - cached.lastChecked < HEALTH_CACHE_TTL_MS)) {
    return Promise.resolve(cached);
  }

  let parsed;
  try {
    parsed = new URL(streamUrl);
  } catch (_) {
    const res = { ok: false, status: 400, lastChecked: now, latencyMs: 0 };
    CHANNEL_HEALTH.set(streamUrl, res);
    return Promise.resolve(res);
  }

  const isHttps = parsed.protocol === 'https:';
  const client = isHttps ? https : http;
  const start = Date.now();

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      CHANNEL_HEALTH.set(streamUrl, result);
      resolve(result);
    };

    const req = client.get(
      parsed,
      {
        agent: isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: '*/*'
        },
        timeout: 2500
      },
      (res) => {
        const status = res.statusCode || 502;
        const ok = status >= 200 && status < 300;
        res.resume();
        finish({ ok, status, lastChecked: Date.now(), latencyMs: Date.now() - start });
      }
    );
    req.on('timeout', () => { req.destroy(); finish({ ok: false, status: 504, lastChecked: Date.now(), latencyMs: Date.now() - start }); });
    req.on('error', () => { finish({ ok: false, status: 502, lastChecked: Date.now(), latencyMs: Date.now() - start }); });
  });
}

const MUSIC_INFO_CACHE = new Map();

function normalizeMusicText(str, stripParens = false) {
  let s = String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (stripParens) {
    s = s.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ' ');
    s = s.replace(/\s+-\s+(remaster(ed)?|live|version|edit|single|radio|acoustic|mono|stereo|deluxe).*$/i, '');
  }
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseMusicSearchInput(rawTitle, rawArtist) {
  let title = String(rawTitle || '').trim();
  let artist = String(rawArtist || '').trim();

  // Replace underscores with spaces (common in downloaded/scraped audio filenames)
  title = title.replace(/_/g, ' ');
  artist = artist.replace(/_/g, ' ');

  // Strip website domains, downloaders, and scrapers (both inside brackets/parens and bare)
  const domainPattern = /\b[a-z0-9_-]+\.(com|net|org|pm|is|io|me|to|app|co|tv)\b/gi;
  title = title.replace(/\s*[\(\[][^\)\]]*\.(com|net|org|pm|is|io|me|to|app|co|tv)[^\)\]]*[\)\]]/gi, ' ');
  artist = artist.replace(/\s*[\(\[][^\)\]]*\.(com|net|org|pm|is|io|me|to|app|co|tv)[^\)\]]*[\)\]]/gi, ' ');
  title = title.replace(domainPattern, ' ');
  artist = artist.replace(domainPattern, ' ');

  // Strip bitrates (e.g. 48kbps, 128kbps, 320kbps)
  title = title.replace(/\b\d{2,4}\s*kbps\b/gi, ' ');
  artist = artist.replace(/\b\d{2,4}\s*kbps\b/gi, ' ');

  // Strip audio/video extension if present in title
  title = title.replace(/\.(mp3|m4a|wav|flac|ogg|aac|alac|aiff|mp4|webm|mkv|m4v)$/i, '');
  // Strip leading track number e.g. "01 - ", "01. ", "01 "
  title = title.replace(/^\s*\d{1,3}[\s._-]+/, '');

  // Strip empty parens/brackets left over
  title = title.replace(/\s*[\(\[]\s*[\)\]]/g, ' ');
  artist = artist.replace(/\s*[\(\[]\s*[\)\]]/g, ' ');

  // If no artist was provided or it's a placeholder, check if title is "Artist - Track"
  if (!artist || /^(unknown|desconhecido|artista\s*desconhecido)$/i.test(artist)) {
    const parts = title.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      artist = parts[0];
      title = parts.slice(1).join(' - ');
    }
  }

  const cleanTitle = title
    .replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyrics?|remaster|live|deluxe|version|edit|clip|hq|hd|320)[^\)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+-\s+(remaster(ed)?|live|version|edit|single|radio|acoustic|mono|stereo|deluxe).*$/i, '')
    .trim()
    .replace(/\s{2,}/g, ' ');

  return {
    rawTitle,
    rawArtist,
    title: title || rawTitle,
    cleanTitle: cleanTitle || title || rawTitle,
    artist
  };
}

function scoreLrcCandidate(candidate, parsed, reqDuration) {
  if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics)) return -9999;
  let score = 0;
  if (candidate.syncedLyrics) score += 100;
  else if (candidate.plainLyrics) score += 35;

  const rawTarget = String(parsed.rawTarget || parsed.rawTitle || parsed.title || '').trim();
  const userWantsRemaster = /remaster(ed)?/i.test(rawTarget);
  const userWantsLive = /(live|ao\s*vivo|en\s*vivo)/i.test(rawTarget);
  const userWantsRemix = /remix/i.test(rawTarget);
  const userWantsAcoustic = /acoustic|ac[uú]stico/i.test(rawTarget);
  const userWantsVideo = /(official\s*(music\s*)?video|music\s*video|videoclipe|lyric\s*video)/i.test(rawTarget);
  const userWantsAudio = /(official\s*audio)/i.test(rawTarget);

  const cTrackRaw = String(candidate.trackName || '').trim();
  const cAlbumRaw = String(candidate.albumName || '').trim();
  const cCombined = `${cTrackRaw} ${cAlbumRaw}`;
  const cIsVideo = /(official\s*(music\s*)?video|music\s*video|videoclipe|lyric\s*video)/i.test(cCombined);
  const cIsAudio = /(official\s*audio)/i.test(cCombined);

  // Heavy penalties if candidate has tags the user didn't ask for:
  if (!userWantsRemaster && /remaster(ed)?/i.test(cTrackRaw)) score -= 250;
  if (!userWantsLive && /(live|ao\s*vivo|en\s*vivo)/i.test(cTrackRaw)) score -= 250;
  if (!userWantsRemix && /remix/i.test(cTrackRaw)) score -= 250;
  if (!userWantsAcoustic && /acoustic|ac[uú]stico/i.test(cTrackRaw)) score -= 250;

  if (userWantsVideo) {
    if (cIsVideo) score += 140;
  } else if (cIsVideo) {
    score -= 40;
  }
  if (userWantsAudio && cIsAudio) score += 80;

  // Exact title match bonus: identical track name without extra tags
  if (cTrackRaw.toLowerCase() === parsed.cleanTitle.toLowerCase() || cTrackRaw.toLowerCase() === parsed.title.toLowerCase()) {
    score += 90;
  }

  const cTrack = normalizeMusicText(candidate.trackName, false);
  const cClean = normalizeMusicText(candidate.trackName, true);
  const cArtist = normalizeMusicText(candidate.artistName, true);

  const tClean = normalizeMusicText(parsed.cleanTitle, true);
  const tFull = normalizeMusicText(parsed.title, false);
  const tArtist = normalizeMusicText(parsed.artist, true);

  if (cTrack === tFull || cClean === tClean || cTrack === tClean) {
    score += 60;
  } else if (cTrack.includes(tClean) || tClean.includes(cTrack) || (tFull && cTrack.includes(tFull))) {
    score += 35;
  } else {
    // Word overlap bonus
    const tWords = tClean.split(/\s+/).filter(Boolean);
    const cWords = new Set(cClean.split(/\s+/).filter(Boolean));
    const overlap = tWords.filter((w) => cWords.has(w)).length;
    if (tWords.length > 0 && overlap > 0) {
      score += Math.round((overlap / tWords.length) * 35);
    }
  }

  // Generic artist validation (prevents picking wrong artists completely)
  if (tArtist) {
    const cArtistBase = cArtist.replace(/\b(official|vevo|topic|music)\b/g, '').trim();
    if (cArtist === tArtist || cArtistBase === tArtist) {
      score += 70;
    } else if (cArtist.includes(tArtist) || tArtist.includes(cArtist)) {
      score += 35;
    } else {
      const tArtistWords = tArtist.split(/\s+/).filter((w) => w.length > 1);
      const cArtistWords = new Set(cArtist.split(/\s+/).filter((w) => w.length > 1));
      const artistOverlap = tArtistWords.filter((w) => cArtistWords.has(w)).length;
      if (artistOverlap > 0) {
        score += Math.round((artistOverlap / tArtistWords.length) * 35);
      } else if (tArtistWords.length > 0 && cArtistWords.size > 0) {
        score -= 250; // Heavy penalty if artist is completely different
      }
    }
  }

  // Duration proximity scoring (matches the exact audio file cut/edit)
  if (reqDuration > 0 && candidate.duration > 0) {
    const diff = Math.abs(Number(candidate.duration) - reqDuration);
    if (diff <= 1.5) score += 140;
    else if (diff <= 3.5) score += 95;
    else if (diff <= 6) score += 50;
    else if (diff <= 12) score += 25;
    else if (diff <= 25) score += 5;
    else score -= Math.min(140, Math.round(diff * 2));
  }

  return score;
}

async function fetchMusicInfoAndLyrics({ title, artist = '', duration = 0, raw = '' }) {
  const rawTitle = String(title || '').trim();
  const rawArtist = String(artist || '').trim();
  const reqDuration = Number(duration) || 0;
  if (!rawTitle) return { ok: false, error: 'Missing title' };

  const rawClean = String(raw || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/\b(vidssave\.com|y2mate\.com|ssyoutube\.com|savefrom\.net|snaptube|ytmp3|\d+\s*kbps|hd|hq|4k|1080p|720p)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const parsed = parseMusicSearchInput(rawTitle, rawArtist);
  const cacheKey = `${normalizeMusicText(parsed.title)}|${normalizeMusicText(parsed.artist)}|${normalizeMusicText(rawClean, false)}|${Math.round(reqDuration)}`;
  const cached = MUSIC_INFO_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const rawTarget = [rawClean, parsed.rawTitle, parsed.title].filter(Boolean).join(' ').trim();
  const userWantsRemaster = /remaster(ed)?/i.test(rawTarget);
  const userWantsLive = /(live|ao\s*vivo|en\s*vivo)/i.test(rawTarget);
  const userWantsRemix = /remix/i.test(rawTarget);
  const userWantsVideo = /(official\s*(music\s*)?video|music\s*video|videoclipe|lyric\s*video)/i.test(rawTarget);

  // Generic canonical entity resolution via iTunes (works for any song worldwide)
  let canonicalEntity = null;
  const canonicalCandidates = [];
  if (parsed.artist && parsed.cleanTitle) {
    canonicalCandidates.push(`${parsed.artist} ${parsed.cleanTitle}`);
    canonicalCandidates.push(`${parsed.cleanTitle} ${parsed.artist}`);
    canonicalCandidates.push(parsed.cleanTitle);
  } else {
    canonicalCandidates.push(parsed.cleanTitle || parsed.title);
  }
  if (parsed.rawTitle && parsed.rawTitle !== parsed.cleanTitle) {
    canonicalCandidates.push(parsed.rawTitle);
  }

  for (const q of canonicalCandidates) {
    if (!q || q.length < 2) continue;
    try {
      const qBuf = await fetchBufferWithRedirects(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=6`);
      const itunesData = JSON.parse(qBuf.toString('utf8'));
      const results = Array.isArray(itunesData?.results) ? itunesData.results : [];
      if (!results.length) continue;

      const qTokens = new Set(q.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
      let top = null;
      let topScore = -1;

      for (const r of results) {
        let sc = 0;
        const rTokens = `${r.artistName} ${r.trackName}`.toLowerCase().split(/\s+/);
        for (const tok of rTokens) {
          if (qTokens.has(tok)) sc += 20;
        }
        if (reqDuration > 0 && r.trackTimeMillis > 0) {
          const rDur = Math.round(r.trackTimeMillis / 1000);
          const diff = Math.abs(rDur - reqDuration);
          if (diff <= 5) sc += 40;
          else if (diff <= 20) sc += 15;
        }
        if (sc > topScore) {
          topScore = sc;
          top = r;
        }
      }

      if (top && topScore >= 35) {
        canonicalEntity = {
          artist: top.artistName,
          title: top.trackName,
          album: top.collectionName,
          cover: top.artworkUrl100 ? top.artworkUrl100.replace('100x100bb', '600x600bb') : '',
          duration: Math.round((top.trackTimeMillis || 0) / 1000)
        };
        break;
      }
    } catch (_) {}
  }

  const effectiveArtist = canonicalEntity?.artist || parsed.artist;
  const effectiveCleanTitle = canonicalEntity?.title || parsed.cleanTitle;

  const scoreContext = { cleanTitle: effectiveCleanTitle, title: effectiveCleanTitle, artist: effectiveArtist, rawTarget };

  const lrcLookup = async () => {
    const queryUrls = [];

    // 1. Direct GET if we have both track and artist
    if (effectiveArtist && effectiveCleanTitle) {
      const getQs = new URLSearchParams({
        track_name: effectiveCleanTitle,
        artist_name: effectiveArtist
      });
      if (reqDuration > 0) getQs.set('duration', String(Math.round(reqDuration)));
      queryUrls.push({ type: 'get', url: `https://lrclib.net/api/get?${getQs.toString()}` });
    }

    // 2. If filename/title indicates Official Video / Music Video, query that explicitly first
    if (userWantsVideo && effectiveArtist && effectiveCleanTitle) {
      queryUrls.push({ type: 'search', url: `https://lrclib.net/api/search?q=${encodeURIComponent(`${effectiveArtist} ${effectiveCleanTitle} Official Video`.trim())}` });
    }
    if (rawClean && rawClean.toLowerCase() !== `${effectiveArtist} ${effectiveCleanTitle}`.toLowerCase()) {
      queryUrls.push({ type: 'search', url: `https://lrclib.net/api/search?q=${encodeURIComponent(rawClean)}` });
    }

    // 3. Search by track_name and artist_name
    if (effectiveArtist && effectiveCleanTitle) {
      queryUrls.push({ type: 'search', url: `https://lrclib.net/api/search?track_name=${encodeURIComponent(effectiveCleanTitle)}&artist_name=${encodeURIComponent(effectiveArtist)}` });
    }

    // 4. Search by query: "artist title"
    if (effectiveArtist && effectiveCleanTitle) {
      queryUrls.push({ type: 'search', url: `https://lrclib.net/api/search?q=${encodeURIComponent(`${effectiveArtist} ${effectiveCleanTitle}`.trim())}` });
    }

    // 5. Search by clean title
    queryUrls.push({ type: 'search', url: `https://lrclib.net/api/search?q=${encodeURIComponent(effectiveCleanTitle || parsed.title)}` });

    // 6. Fallback query with original raw title if different
    if (parsed.title !== effectiveCleanTitle) {
      queryUrls.push({ type: 'search', url: `https://lrclib.net/api/search?q=${encodeURIComponent(parsed.title)}` });
    }

    const seenIds = new Set();
    const pool = [];

    for (const item of queryUrls) {
      try {
        const buf = await fetchBufferWithRedirects(item.url);
        const json = JSON.parse(buf.toString('utf8'));
        if (item.type === 'get') {
          if (json && (json.syncedLyrics || json.plainLyrics)) {
            const isRem = /remaster(ed)?/i.test(json.trackName || '') || /remaster(ed)?/i.test(json.albumName || '');
            const durDiff = (reqDuration > 0 && json.duration > 0) ? Math.abs(json.duration - reqDuration) : 0;
            if (!userWantsVideo && !userWantsRemaster && !isRem && durDiff <= 1.5 && json.syncedLyrics) {
              return json; // Exact direct match from LRCLIB
            }
            const cid = json.id || `${json.trackName}|${json.artistName}`;
            if (!seenIds.has(cid)) {
              seenIds.add(cid);
              pool.push(json);
            }
          }
        } else if (Array.isArray(json) && json.length) {
          for (const c of json) {
            if (!c || (!c.syncedLyrics && !c.plainLyrics)) continue;
            const cid = c.id || `${c.trackName}|${c.artistName}`;
            if (!seenIds.has(cid)) {
              seenIds.add(cid);
              pool.push(c);
            }
          }
          const topCandidate = pool.find((c) => {
            if (!c.syncedLyrics) return false;
            const durDiff = (reqDuration > 0 && c.duration > 0) ? Math.abs(c.duration - reqDuration) : 99;
            return durDiff <= 1.5 && scoreLrcCandidate(c, scoreContext, reqDuration) >= 300;
          });
          if (topCandidate) break;
        }
      } catch (_) {}
    }

    if (!pool.length) return null;

    pool.sort((a, b) => scoreLrcCandidate(b, scoreContext, reqDuration) - scoreLrcCandidate(a, scoreContext, reqDuration));
    const best = pool[0];
    return scoreLrcCandidate(best, scoreContext, reqDuration) > 10 ? best : null;
  };

  const coverLookup = async () => {
    if (canonicalEntity?.cover) {
      return {
        coverUrl: canonicalEntity.cover,
        trackName: canonicalEntity.title,
        artistName: canonicalEntity.artist,
        albumName: canonicalEntity.album || ''
      };
    }
    try {
      const q = encodeURIComponent(`${effectiveCleanTitle || parsed.title} ${effectiveArtist}`.trim());
      const buf = await fetchBufferWithRedirects(`https://itunes.apple.com/search?term=${q}&entity=song&limit=10`);
      const json = JSON.parse(buf.toString('utf8'));
      const list = Array.isArray(json?.results) ? json.results : [];
      if (!list.length) return null;

      let filteredList = list;
      if (!userWantsRemaster) {
        const nonRem = list.filter((x) => !/remaster(ed)?/i.test(x.trackName || ''));
        if (nonRem.length) filteredList = nonRem;
      }
      if (!userWantsLive) {
        const nonLive = filteredList.filter((x) => !/(live|ao\s*vivo|en\s*vivo)/i.test(x.trackName || ''));
        if (nonLive.length) filteredList = nonLive;
      }
      if (!userWantsRemix) {
        const nonRemix = filteredList.filter((x) => !/remix/i.test(x.trackName || ''));
        if (nonRemix.length) filteredList = nonRemix;
      }

      const target = normalizeMusicText(effectiveCleanTitle, true);
      const ranked = [...filteredList].sort((a, b) => {
        const aRaw = String(a.trackName || '').toLowerCase().trim();
        const bRaw = String(b.trackName || '').toLowerCase().trim();
        const targetRaw = effectiveCleanTitle.toLowerCase().trim();
        const aExact = aRaw === targetRaw ? 0 : 1;
        const bExact = bRaw === targetRaw ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;

        const aName = normalizeMusicText(a.trackName, true);
        const bName = normalizeMusicText(b.trackName, true);
        const aMatch = (aName === target || aName.includes(target) || target.includes(aName)) ? 0 : 1;
        const bMatch = (bName === target || bName.includes(target) || target.includes(bName)) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        if (reqDuration > 0) {
          const aDiff = a.trackTimeMillis ? Math.abs(a.trackTimeMillis / 1000 - reqDuration) : 99999;
          const bDiff = b.trackTimeMillis ? Math.abs(b.trackTimeMillis / 1000 - reqDuration) : 99999;
          return aDiff - bDiff;
        }
        return 0;
      });
      const best = ranked[0];
      const art = best?.artworkUrl100 ? String(best.artworkUrl100).replace(/100x100bb\.(jpg|png)/i, '600x600bb.$1') : '';
      return {
        coverUrl: art,
        artistName: best?.artistName || '',
        albumName: best?.collectionName || '',
        trackName: best?.trackName || ''
      };
    } catch (_) {
      return null;
    }
  };

  const [lrc, cover] = await Promise.all([lrcLookup(), coverLookup()]);

  let finalTrackName = lrc?.trackName || parsed.cleanTitle || parsed.title;
  if (!userWantsRemaster) {
    finalTrackName = finalTrackName.replace(/\s*[\(\[][^\)\]]*remaster[^\)\]]*[\)\]]\s*/gi, ' ').trim();
  }

  const payload = {
    ok: true,
    matchedTrackName: finalTrackName,
    matchedArtistName: lrc?.artistName || cover?.artistName || parsed.artist,
    matchedAlbumName: lrc?.albumName || cover?.albumName || '',
    matchedDuration: lrc?.duration || null,
    durationDiff: (lrc?.duration && reqDuration > 0) ? Number(Math.abs(lrc.duration - reqDuration).toFixed(2)) : null,
    syncedLyrics: lrc?.syncedLyrics || '',
    plainLyrics: lrc?.plainLyrics || '',
    coverUrl: cover?.coverUrl || '',
    source: lrc ? 'lrclib.net' : null
  };

  MUSIC_INFO_CACHE.set(cacheKey, { data: payload, expiresAt: Date.now() + 600000 });
  return payload;
}

function broadcastCaptionMsg(msg) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of captionClients) {
    if (client.res.writableEnded) continue;
    if (!msg.session || msg.session === client.session) {
      client.res.write(payload);
    }
  }
}

function ensureCaptionWorker() {
  if (activeCaptionProc && !activeCaptionProc.killed) return activeCaptionProc;
  captionWorkerReady = false;
  const worker = spawn(PYTHON_BIN, [CAPTIONS_WORKER, '--daemon'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  activeCaptionProc = worker;

  let outBuf = '';
  worker.stdout.on('data', (chunk) => {
    outBuf += chunk.toString('utf8');
    const lines = outBuf.split('\n');
    outBuf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.status === 'ready') captionWorkerReady = true;
        if (msg.session && captionActiveSession && msg.session !== captionActiveSession) continue;
        broadcastCaptionMsg(msg);
      } catch (_) {}
    }
  });

  worker.on('exit', () => {
    if (activeCaptionProc === worker) {
      activeCaptionProc = null;
      captionWorkerReady = false;
    }
  });
  return worker;
}

function flushCaptionQueue() {
  if (captionFlushing) return;
  const worker = ensureCaptionWorker();
  if (!worker.stdin || worker.stdin.destroyed) return;
  captionFlushing = true;

  const step = () => {
    if (!captionJobQueue.length) {
      captionFlushing = false;
      return;
    }
    const job = captionJobQueue.shift();
    if (job.session && captionActiveSession && job.session !== captionActiveSession && job.header.cmd !== 'reset') {
      return step();
    }
    const line = `${JSON.stringify(job.header)}\n`;
    const ok1 = worker.stdin.write(line);
    const ok2 = job.buf && job.buf.length ? worker.stdin.write(job.buf) : true;
    if (ok1 && ok2) {
      setImmediate(step);
    } else {
      worker.stdin.once('drain', step);
    }
  };
  step();
}

function enqueueCaptionJob(session, header, buf = null) {
  if (header.cmd === 'reset') {
    captionActiveSession = session;
    for (let i = captionJobQueue.length - 1; i >= 0; i--) {
      if (captionJobQueue[i].session !== session) captionJobQueue.splice(i, 1);
    }
  }
  if (captionJobQueue.length > 10) captionJobQueue.shift();
  captionJobQueue.push({ session, header, buf });
  flushCaptionQueue();
}

const mediaDetailsCache = new Map();
const MEDIA_FINISHED_CACHE_FILE = path.join(__dirname, 'media-finished-cache.json');
const finishedMediaDiskCache = (() => {
  const map = new Map();
  try {
    if (fs.existsSync(MEDIA_FINISHED_CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(MEDIA_FINISHED_CACHE_FILE, 'utf8'));
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) map.set(k, v);
      }
    }
  } catch (_) { }
  return map;
})();

function persistFinishedMediaCache() {
  try {
    const obj = Object.fromEntries(finishedMediaDiskCache.entries());
    const tmp = `${MEDIA_FINISHED_CACHE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmp, MEDIA_FINISHED_CACHE_FILE);
  } catch (_) { }
}
const MEDIA_CACHE_TTL_MS = 30 * 60 * 1000;

function stripHtmlTags(str) {
  return String(str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveJustWatchImage(template, profile, ext) {
  if (!template) return null;
  const pathStr = template.replace('{profile}', profile).replace('{format}', ext);
  return pathStr.startsWith('http') ? pathStr : `https://images.justwatch.com${pathStr}`;
}

async function translateTextBatch(texts, targetLang) {
  const rawLang = String(targetLang || 'pt').trim();
  const baseLang = rawLang.split('-')[0].toLowerCase();
  if (!baseLang || baseLang === 'en' || !texts.length) return texts;

  const SEP = '\n[[IRISSPLIT]]\n';
  const out = [...texts];
  const batches = [];
  let idx = 0;

  while (idx < texts.length) {
    const batch = [];
    const batchIndices = [];
    let totalLen = 0;
    while (idx < texts.length && batch.length < 18) {
      const item = String(texts[idx] || '').trim();
      if (item && totalLen + item.length + SEP.length > 3200 && batch.length > 0) break;
      if (item) {
        batch.push(item);
        batchIndices.push(idx);
        totalLen += item.length + SEP.length;
      }
      idx++;
    }
    if (batch.length) batches.push({ batch, batchIndices });
  }

  await Promise.all(
    batches.map(async ({ batch, batchIndices }) => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(rawLang)}&dt=t&q=${encodeURIComponent(batch.join(SEP))}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
        if (!resp.ok) return;
        const data = await resp.json();
        const translated = (data?.[0] || []).map((part) => part?.[0] || '').join('');
        const pieces = translated.split(/\s*\[\[IRISSPLIT\]\]\s*/);
        if (pieces.length === batchIndices.length) {
          batchIndices.forEach((origIdx, j) => {
            if (pieces[j] && pieces[j].trim()) out[origIdx] = pieces[j].trim();
          });
        }
      } catch (_) {}
    })
  );
  return out;
}

async function fetchWikiActorPhoto(name) {
  try {
    const slug = encodeURIComponent(String(name || '').trim().replace(/\s+/g, '_'));
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      signal: AbortSignal.timeout(2200)
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.thumbnail?.source || null;
  } catch (_) {
    return null;
  }
}

const catalogCache = new Map();
const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchJustWatchCatalog({ type = 'ALL', query = '', genres = [], lang = 'pt', country = 'BR', first = 36 }) {
  const cleanLang = String(lang || 'pt').split('-')[0].toLowerCase() || 'pt';
  const cleanCountry = String(country || 'BR').toUpperCase().slice(0, 2) || 'BR';
  const cleanType = ['SHOW', 'MOVIE'].includes(String(type).toUpperCase()) ? String(type).toUpperCase() : 'ALL';
  const cleanGenres = (genres || []).map((g) => String(g).trim().toLowerCase()).filter(Boolean).slice(0, 4);
  const cleanQuery = String(query || '').trim();
  const cKey = `${cleanType}|${cleanQuery.toLowerCase()}|${cleanGenres.join(',')}|${cleanLang}|${cleanCountry}|${first}`;

  const hit = catalogCache.get(cKey);
  if (hit && Date.now() - hit.ts < CATALOG_CACHE_TTL_MS) return hit.items;

  const filter = {
    objectTypes: cleanType === 'ALL' ? ['SHOW', 'MOVIE'] : [cleanType]
  };
  if (cleanGenres.length) filter.genres = cleanGenres;
  if (cleanQuery) filter.searchQuery = cleanQuery;

  const jwQuery = `query Catalog($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
    popularTitles(country: $country, first: $first, filter: $filter) {
      edges {
        node {
          objectType
          objectId
          content(country: $country, language: $language) {
            title
            originalTitle
            shortDescription
            originalReleaseYear
            ageCertification
            posterUrl
            backdrops { backdropUrl }
            genres { shortName translation(language: $language) }
            scoring { imdbScore tmdbScore tomatoMeter }
          }
        }
      }
    }
  }`;

  const r = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: jwQuery,
      variables: { country: cleanCountry, language: cleanLang, first: Math.min(48, Math.max(8, Number(first) || 36)), filter }
    }),
    signal: AbortSignal.timeout(7000)
  });
  if (!r.ok) return [];
  const j = await r.json();
  const edges = j?.data?.popularTitles?.edges || [];

  const KEEP_ORIG = new Set(['breaking bad', 'the last of us', 'stranger things', 'fallout', 'the boys', 'dark', 'succession', 'the bear', 'arcane', 'andor', 'house of the dragon', 'jujutsu kaisen', 'cyberpunk: edgerunners']);
  const items = [];
  for (const edge of edges) {
    const node = edge?.node;
    const c = node?.content;
    if (!c?.title) continue;
    const orig = String(c.originalTitle || c.title).trim();
    const loc = String(c.title).trim();
    const useOrig = cleanLang === 'pt' && cleanCountry === 'BR' && KEEP_ORIG.has(orig.toLowerCase());
    const poster = resolveJustWatchImage(c.posterUrl, 's332', 'jpg');
    if (!poster) continue;
    items.push({
      id: `${node.objectType.toLowerCase()}-${node.objectId}`,
      objectId: node.objectId,
      type: node.objectType,
      title: useOrig ? orig : loc,
      originalTitle: orig,
      year: c.originalReleaseYear || null,
      ageRating: c.ageCertification || null,
      poster,
      bgImg: resolveJustWatchImage(c.backdrops?.[0]?.backdropUrl, 's1920', 'jpg') || poster,
      desc: c.shortDescription || '',
      genres: (c.genres || []).map((g) => g.translation).filter(Boolean),
      genreSlugs: (c.genres || []).map((g) => g.shortName).filter(Boolean),
      imdbScore: c.scoring?.imdbScore ?? null,
      tmdbScore: c.scoring?.tmdbScore ? Number(c.scoring.tmdbScore.toFixed(1)) : null,
      tomatoMeter: c.scoring?.tomatoMeter ?? null
    });
  }

  if (catalogCache.size >= 64) {
    const oldest = catalogCache.keys().next().value;
    catalogCache.delete(oldest);
  }
  catalogCache.set(cKey, { ts: Date.now(), items });
  return items;
}

async function fetchTrailerYoutubeId(title) {
  try {
    const ytQuery = encodeURIComponent(`${title} official trailer`);
    const r = await fetch(`https://www.youtube.com/results?search_query=${ytQuery}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4500)
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

async function fetchMediaDetails({ title, type = 'ALL', lang = 'pt', country = 'BR' }) {
  const cleanLang = String(lang || 'pt').split('-')[0].toLowerCase() || 'pt';
  const cleanCountry = String(country || 'BR').toUpperCase().slice(0, 2) || 'BR';
  const cleanType = ['SHOW', 'MOVIE'].includes(String(type).toUpperCase()) ? String(type).toUpperCase() : 'ALL';
  const cacheKey = `${cleanType}|${title.toLowerCase()}|${cleanLang}|${cleanCountry}`;
  const diskHit = finishedMediaDiskCache.get(cacheKey);
  if (diskHit) {
    if (!diskHit.trailerYoutubeId) {
      const ytId = await fetchTrailerYoutubeId(diskHit.originalTitle || diskHit.title || title);
      if (ytId) {
        diskHit.trailerYoutubeId = ytId;
        persistFinishedMediaCache();
      }
    }
    return diskHit;
  }
  const hit = mediaDetailsCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < MEDIA_CACHE_TTL_MS) {
    if (!hit.data.trailerYoutubeId) {
      const ytId = await fetchTrailerYoutubeId(hit.data.originalTitle || hit.data.title || title);
      if (ytId) hit.data.trailerYoutubeId = ytId;
    }
    return hit.data;
  }

  const jwQuery = `query GetTitleDetails($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
    popularTitles(country: $country, first: $first, filter: $filter) {
      edges {
        node {
          objectType
          content(country: $country, language: $language) {
            title
            originalTitle
            shortDescription
            originalReleaseYear
            runtime
            ageCertification
            genres { shortName translation(language: $language) }
            scoring { imdbScore imdbVotes tmdbScore tomatoMeter }
            posterUrl
            backdrops { backdropUrl }
            credits { name role characterName }
          }
          offers(country: $country, platform: WEB) {
            monetizationType
            presentationType
            standardWebURL
            package { clearName technicalName icon }
          }
        }
      }
    }
  }`;

  const jwFilter = { searchQuery: title };
  if (cleanType !== 'ALL') jwFilter.objectTypes = [cleanType];

  const jwReq = fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: jwQuery,
      variables: { country: cleanCountry, language: cleanLang, first: 3, filter: jwFilter }
    }),
    signal: AbortSignal.timeout(6500)
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const TVMAZE_ALIASES = { wandinha: 'Wednesday' };
  const tvQuery = TVMAZE_ALIASES[title.toLowerCase().trim()] || title;
  const tvReq = cleanType === 'MOVIE'
    ? Promise.resolve(null)
    : fetch(
        `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(tvQuery)}&embed[]=episodes&embed[]=cast`,
        { signal: AbortSignal.timeout(6500) }
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const ytReq = fetchTrailerYoutubeId(title);

  const [jwJson, rawTvJson, trailerYoutubeId] = await Promise.all([jwReq, tvReq, ytReq]);

  const edges = jwJson?.data?.popularTitles?.edges || [];
  const normTitle = title.toLowerCase().trim();
  const jwNode = (
    edges.find((e) => (e?.node?.content?.title || '').toLowerCase() === normTitle || (e?.node?.content?.originalTitle || '').toLowerCase() === normTitle)?.node ||
    edges[0]?.node ||
    null
  );
  const jwContent = jwNode?.content || null;
  const resolvedType = jwNode?.objectType || (cleanType !== 'ALL' ? cleanType : 'SHOW');
  const tvJson = resolvedType === 'MOVIE' ? null : rawTvJson;

  const qualityRank = { _4K: 4, HD: 3, SD: 2, BLURAY: 1 };
  const offerMap = new Map();
  for (const off of jwNode?.offers || []) {
    const pkg = off?.package;
    if (!pkg?.technicalName || !off?.standardWebURL) continue;
    const prev = offerMap.get(pkg.technicalName);
    const rank = qualityRank[off.presentationType] || 0;
    const isFreeOrSub = off.monetizationType === 'FLATRATE' || off.monetizationType === 'FREE' || off.monetizationType === 'ADS';
    const prevFreeOrSub = prev && (prev.monetizationType === 'FLATRATE' || prev.monetizationType === 'FREE' || prev.monetizationType === 'ADS');
    if (!prev || (isFreeOrSub && !prevFreeOrSub) || (isFreeOrSub === prevFreeOrSub && rank > prev.rank)) {
      offerMap.set(pkg.technicalName, {
        id: pkg.technicalName,
        name: pkg.clearName || pkg.technicalName,
        monetizationType: off.monetizationType || 'FLATRATE',
        quality: String(off.presentationType || '').replace(/^_/, '') || 'HD',
        url: off.standardWebURL,
        icon: resolveJustWatchImage(pkg.icon, 's100', 'png'),
        rank
      });
    }
  }
  const providers = [...offerMap.values()].map(({ rank, ...rest }) => rest).slice(0, 10);

  const tvCast = tvJson?._embedded?.cast || [];
  const tvCastByName = new Map();
  for (const item of tvCast) {
    if (item?.person?.name) {
      tvCastByName.set(item.person.name.toLowerCase(), {
        name: item.person.name,
        character: item.character?.name || '',
        photo: item.person?.image?.medium || item.person?.image?.original || null
      });
    }
  }

  const castList = [];
  const seenActors = new Set();
  for (const item of tvCast.slice(0, 14)) {
    const name = item?.person?.name;
    if (!name || seenActors.has(name.toLowerCase())) continue;
    seenActors.add(name.toLowerCase());
    castList.push({
      name,
      character: item.character?.name || '',
      photo: item.person?.image?.medium || item.person?.image?.original || null
    });
  }
  for (const cr of jwContent?.credits || []) {
    if (cr.role !== 'ACTOR' || !cr.name || seenActors.has(cr.name.toLowerCase())) continue;
    seenActors.add(cr.name.toLowerCase());
    const tvMatch = tvCastByName.get(cr.name.toLowerCase());
    castList.push({
      name: cr.name,
      character: cr.characterName || tvMatch?.character || '',
      photo: tvMatch?.photo || null
    });
    if (castList.length >= 14) break;
  }

  const rawEpisodes = (tvJson?._embedded?.episodes || []).map((ep) => ({
    id: ep.id,
    season: Number(ep.season || 1),
    number: Number(ep.number || 1),
    name: ep.name || `Episode ${ep.number}`,
    airdate: ep.airdate || '',
    runtime: ep.runtime || null,
    rating: ep.rating?.average ?? null,
    image: ep.image?.medium || null,
    summary: stripHtmlTags(ep.summary)
  }));

  const tvSummary = stripHtmlTags(tvJson?.summary);
  const useBrSummary = cleanLang === 'pt' && cleanCountry === 'BR' && Boolean(tvSummary);
  let synopsis = (useBrSummary ? tvSummary : (jwContent?.shortDescription || tvSummary)) || '';
  const STATUS_LOCALIZED = {
    pt: { Running: 'Em exibição', Ended: 'Finalizada', 'To Be Determined': 'A confirmar', 'In Development': 'Em desenvolvimento' },
    es: { Running: 'En emisión', Ended: 'Finalizada', 'To Be Determined': 'Por confirmar', 'In Development': 'En desarrollo' }
  };
  let statusText = (STATUS_LOCALIZED[cleanLang]?.[tvJson?.status]) || tvJson?.status || '';
  const translateTarget = cleanLang === 'pt' && cleanCountry === 'BR' ? 'pt-BR' : cleanLang;
  const toTranslate = [];
  const mapTargets = [];

  if (cleanLang !== 'en') {
    if ((useBrSummary || !jwContent?.shortDescription) && synopsis) {
      mapTargets.push({ kind: 'synopsis', idx: toTranslate.length });
      toTranslate.push(synopsis);
    }
    const epTargets = rawEpisodes.slice(0, 24);
    epTargets.forEach((ep, eIdx) => {
      if (ep.name) {
        mapTargets.push({ kind: 'epName', eIdx, idx: toTranslate.length });
        toTranslate.push(ep.name);
      }
      if (ep.summary) {
        mapTargets.push({ kind: 'epSummary', eIdx, idx: toTranslate.length });
        toTranslate.push(ep.summary);
      }
    });
    if (toTranslate.length) {
      const translated = await translateTextBatch(toTranslate, translateTarget);
      for (const m of mapTargets) {
        const val = translated[m.idx];
        if (!val) continue;
        if (m.kind === 'synopsis') synopsis = val;
        else if (m.kind === 'status') statusText = val;
        else if (m.kind === 'epName') rawEpisodes[m.eIdx].name = val;
        else if (m.kind === 'epSummary') rawEpisodes[m.eIdx].summary = val;
      }
    }
  }

  // Resolve actor photos via Wikipedia for movies or cast members without TVMaze photos
  await Promise.all(
    castList.slice(0, 8).map(async (actor) => {
      if (!actor.photo) actor.photo = await fetchWikiActorPhoto(actor.name);
    })
  );

  const ALLOW_PT_LOCALIZED_TITLES = new Set(['severance', 'wednesday', 'wandinha', 'shōgun', 'shogun', 'house of the dragon']);
  const reqKey = title.toLowerCase().trim();
  const originalTitle = String(jwContent?.originalTitle || tvJson?.name || title).trim();
  const localizedTitle = String(jwContent?.title || originalTitle).trim();
  const displayTitle = (cleanLang === 'pt' && cleanCountry === 'BR' && !ALLOW_PT_LOCALIZED_TITLES.has(reqKey) && !ALLOW_PT_LOCALIZED_TITLES.has(originalTitle.toLowerCase()))
    ? (reqKey === 'wandinha' ? 'Wandinha' : (resolvedType === 'MOVIE' ? localizedTitle : originalTitle))
    : (reqKey === 'wandinha' && cleanLang === 'pt' ? 'Wandinha' : localizedTitle);

  const result = {
    ok: true,
    type: resolvedType,
    lang: cleanLang,
    country: cleanCountry,
    title: displayTitle,
    originalTitle,
    year: jwContent?.originalReleaseYear || (tvJson?.premiered ? Number(tvJson.premiered.slice(0, 4)) : null),
    runtime: jwContent?.runtime || tvJson?.averageRuntime || null,
    ageRating: jwContent?.ageCertification || null,
    status: statusText || null,
    rawStatus: tvJson?.status || null,
    network: tvJson?.network?.name || tvJson?.webChannel?.name || null,
    genres: (jwContent?.genres || []).map((g) => g.translation).filter(Boolean),
    genreSlugs: (jwContent?.genres || []).map((g) => g.shortName).filter(Boolean),
    synopsis,
    poster: resolveJustWatchImage(jwContent?.posterUrl, 's592', 'jpg') || tvJson?.image?.medium || null,
    backdrop: resolveJustWatchImage(jwContent?.backdrops?.[0]?.backdropUrl, 's1920', 'jpg') || tvJson?.image?.original || null,
    ratings: {
      imdb: jwContent?.scoring?.imdbScore ?? null,
      imdbVotes: jwContent?.scoring?.imdbVotes ?? null,
      rottenTomatoes: jwContent?.scoring?.tomatoMeter ?? null,
      tmdb: jwContent?.scoring?.tmdbScore ? Number(jwContent.scoring.tmdbScore.toFixed(1)) : null,
      tvmaze: tvJson?.rating?.average ?? null
    },
    providers,
    trailerYoutubeId: trailerYoutubeId || null,
    cast: castList,
    episodes: rawEpisodes
  };

  if (resolvedType === 'MOVIE' || tvJson?.status === 'Ended') {
    finishedMediaDiskCache.set(cacheKey, result);
    persistFinishedMediaCache();
  }
  if (mediaDetailsCache.size >= 64) {
    const oldest = mediaDetailsCache.keys().next().value;
    mediaDetailsCache.delete(oldest);
  }
  mediaDetailsCache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}

const weatherCache = new Map();

async function fetchWeatherData({ q = 'São Paulo', lat = null, lon = null, lang = 'pt' } = {}) {
  const cleanQ = String(q || 'São Paulo').trim();
  const key = `${lat && lon ? `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}` : cleanQ.toLowerCase()}:${lang}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.data;

  let city = cleanQ;
  let country = 'Brasil';
  let useLat = lat !== null && lat !== '' ? Number(lat) : null;
  let useLon = lon !== null && lon !== '' ? Number(lon) : null;

  if (useLat === null || useLon === null || Number.isNaN(useLat) || Number.isNaN(useLon)) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQ)}&count=1&language=${encodeURIComponent(lang)}&format=json`;
    const geoBuf = await fetchBufferWithRedirects(geoUrl);
    const geoJson = JSON.parse(geoBuf.toString('utf8'));
    const place = geoJson.results?.[0];
    if (!place) {
      throw new Error(`Cidade não encontrada: ${cleanQ}`);
    }
    city = place.name || cleanQ;
    country = place.admin1 ? `${place.admin1}, ${place.country || ''}` : (place.country || '');
    useLat = place.latitude;
    useLon = place.longitude;
  }

  const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${useLat}&longitude=${useLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7`;
  const fcBuf = await fetchBufferWithRedirects(fcUrl);
  const fc = JSON.parse(fcBuf.toString('utf8'));

  const data = {
    ok: true,
    location: { city, country: country.replace(/,\s*$/, ''), lat: useLat, lon: useLon },
    timezone: fc.timezone,
    current: fc.current || {},
    hourly: fc.hourly || {},
    daily: fc.daily || {}
  };

  if (weatherCache.size >= 32) {
    weatherCache.delete(weatherCache.keys().next().value);
  }
  weatherCache.set(key, { ts: Date.now(), data });
  return data;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);
const assetCache = new Map();
const httpKeepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 64, keepAliveMsecs: 30000 });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 64, keepAliveMsecs: 30000 });

function runCmd(cmd, args = [], timeout = 2500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim()
      });
    });
  });
}

function execFileAsyncSafe(cmd, args = [], timeout = 4500) {
  return runCmd(cmd, args, timeout);
}

function readJsonBody(req, limitBytes = 8192) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limitBytes) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(req, res, statusCode, payload) {
  const raw = Buffer.from(JSON.stringify(payload));
  const accept = req.headers['accept-encoding'] || '';
  if (accept.includes('br')) {
    return zlib.brotliCompress(raw, (err, compressed) => {
      if (err) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(raw);
      }
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'br',
        'Cache-Control': 'no-store',
        Vary: 'Accept-Encoding'
      });
      res.end(compressed);
    });
  }
  if (accept.includes('gzip')) {
    return zlib.gzip(raw, (err, compressed) => {
      if (err) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(raw);
      }
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'no-store',
        Vary: 'Accept-Encoding'
      });
      res.end(compressed);
    });
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(raw);
}

function getNetworkInterfaceInfo() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const info of addrs || []) {
      if (info.family === 'IPv4' && !info.internal) {
        candidates.push({ iface: name, ip: info.address, mac: info.mac });
      }
    }
  }
  return candidates[0] || { iface: 'lo0', ip: '127.0.0.1', mac: '--' };
}

let hwStatusCache = { ts: 0, bluetooth: { enabled: null, connectedDevices: [] }, irReceiver: { available: false, name: 'Nenhum receptor infravermelho detectado' } };

async function getRealOsStatus() {
  const platform = process.platform;
  const netInfo = getNetworkInterfaceInfo();
  const cpus = os.cpus() || [];
  const totalMemGb = Number((os.totalmem() / (1024 ** 3)).toFixed(1));
  const freeMemGb = Number((os.freemem() / (1024 ** 3)).toFixed(1));

  let outputVolume = null;
  let muted = false;
  let battery = null;
  let wifiSsid = null;
  let darkMode = null;
  let bluetooth = hwStatusCache.bluetooth;
  let irReceiver = hwStatusCache.irReceiver;

  if (platform === 'darwin') {
    const needHwScan = Date.now() - hwStatusCache.ts > 30000;
    const [volRes, battRes, wifiRes, styleRes, irRes, btRes] = await Promise.all([
      runCmd('osascript', ['-e', 'get volume settings']),
      runCmd('pmset', ['-g', 'batt']),
      runCmd('networksetup', ['-getairportnetwork', netInfo.iface === 'lo0' ? 'en0' : netInfo.iface]),
      runCmd('defaults', ['read', '-g', 'AppleInterfaceStyle']),
      needHwScan ? runCmd('ioreg', ['-r', '-c', 'AppleIRController', '-w0']) : Promise.resolve(null),
      needHwScan ? runCmd('system_profiler', ['SPBluetoothDataType', '-json']) : Promise.resolve(null)
    ]);

    if (needHwScan) {
      let nextIr = { available: false, name: 'Nenhum receptor infravermelho detectado' };
      if (irRes?.ok && irRes.stdout.includes('AppleIRController')) {
        nextIr = { available: true, name: 'Receptor IR integrado (Apple IR)' };
      } else {
        const usbRes = await runCmd('ioreg', ['-p', 'IOUSB', '-w0', '-l']);
        if (usbRes.ok && /(flirc|infrared|ir receiver|mce remote)/i.test(usbRes.stdout)) {
          const match = usbRes.stdout.match(/"USB Product Name"\s*=\s*"([^"]*(?:IR|Flirc|Remote)[^"]*)"/i);
          nextIr = { available: true, name: match ? match[1] : 'Receptor IR USB' };
        }
      }

      let nextBt = { enabled: null, connectedDevices: [] };
      if (btRes?.ok && btRes.stdout) {
        try {
          const btJson = JSON.parse(btRes.stdout)?.SPBluetoothDataType?.[0] || {};
          const btState = btJson.controller_properties?.controller_state || '';
          const connected = Array.isArray(btJson.device_connected)
            ? btJson.device_connected.map((entry) => Object.keys(entry)[0]).filter(Boolean)
            : [];
          nextBt = {
            enabled: btState === 'attrib_on',
            connectedDevices: connected
          };
        } catch (_) {}
      }
      bluetooth = nextBt;
      irReceiver = nextIr;
      hwStatusCache = { ts: Date.now(), bluetooth, irReceiver };
    }

    if (volRes.ok) {
      const mVol = volRes.stdout.match(/output volume:(\d+)/);
      const mMute = volRes.stdout.match(/output muted:(true|false)/);
      if (mVol) outputVolume = Number(mVol[1]);
      if (mMute) muted = mMute[1] === 'true';
    }

    if (battRes.ok && battRes.stdout) {
      const pctMatch = battRes.stdout.match(/(\d+)%/);
      const sourceMatch = battRes.stdout.match(/'([^']+)'/);
      if (pctMatch) {
        battery = {
          percent: Number(pctMatch[1]),
          charging: /charging|charged/i.test(battRes.stdout) && !/discharging/i.test(battRes.stdout),
          source: sourceMatch ? sourceMatch[1] : 'Bateria'
        };
      }
    }

    if (wifiRes.ok && wifiRes.stdout.includes('Current Wi-Fi Network:')) {
      wifiSsid = wifiRes.stdout.split('Current Wi-Fi Network:')[1].trim();
    } else if (netInfo.ip !== '127.0.0.1') {
      wifiSsid = `Conectado (${netInfo.iface})`;
    }

    darkMode = styleRes.ok && /dark/i.test(styleRes.stdout);
  } else if (platform === 'linux') {
    // Consulta direta ALSA (dmix) de alta velocidade sem overhead de PulseAudio
    const [amixRes, wifiRes, btRes] = await Promise.all([
      runCmd('amixer', ['get', 'Master']),
      runCmd('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi']),
      runCmd('bluetoothctl', ['devices', 'Connected'])
    ]);

    if (amixRes.ok && amixRes.stdout) {
      const m = amixRes.stdout.match(/\[(\d+)%\]/);
      if (m) outputVolume = Math.min(100, Number(m[1]));
      muted = /\[off\]/i.test(amixRes.stdout);
    } else {
      // Fallback para pactl se pulse/pipewire estiver presente
      const pactlRes = await runCmd('pactl', ['get-sink-volume', '@DEFAULT_SINK@']);
      if (pactlRes.ok) {
        const m = pactlRes.stdout.match(/(\d+)%/);
        if (m) outputVolume = Math.min(100, Number(m[1]));
        const muteRes = await runCmd('pactl', ['get-sink-mute', '@DEFAULT_SINK@']);
        if (muteRes.ok) muted = /yes|sim|true/i.test(muteRes.stdout);
      }
    }
    if (wifiRes.ok && wifiRes.stdout) {
      const activeLine = wifiRes.stdout.split('\n').find((l) => /^(yes|sim):/i.test(l.trim()));
      if (activeLine) wifiSsid = activeLine.replace(/^(yes|sim):/i, '').trim();
    }
    if (!wifiSsid && netInfo.ip !== '127.0.0.1') {
      wifiSsid = `Conectado (${netInfo.iface})`;
    }
    if (btRes.ok) {
      const devs = btRes.stdout
        .split('\n')
        .map((line) => line.replace(/^Device\s+[0-9A-F:]+\s+/i, '').trim())
        .filter(Boolean);
      bluetooth = { enabled: true, connectedDevices: devs };
    }
    if (fs.existsSync('/sys/class/rc/rc0')) {
      irReceiver = { available: true, name: 'Receptor IR / HDMI-CEC (Linux Kernel RC)' };
    }
  } else if (platform === 'win32') {
    const [regRes, wlanRes, battRes] = await Promise.all([
      runCmd('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'], 2500),
      runCmd('netsh', ['wlan', 'show', 'interfaces'], 2500),
      runCmd('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json'], 3000)
    ]);
    if (regRes.ok && regRes.stdout) {
      const m = regRes.stdout.match(/AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
      if (m) darkMode = m[1] === '0';
    }
    if (wlanRes.ok && wlanRes.stdout) {
      const m = wlanRes.stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
      if (m && m[1].trim()) wifiSsid = m[1].trim();
    } else if (netInfo.ip !== '127.0.0.1') {
      wifiSsid = `Conectado (${netInfo.iface})`;
    }
    if (battRes.ok && battRes.stdout) {
      try {
        const b = JSON.parse(battRes.stdout);
        if (typeof b?.EstimatedChargeRemaining === 'number') {
          battery = {
            percent: b.EstimatedChargeRemaining,
            charging: b.BatteryStatus === 2 || b.BatteryStatus === 6,
            source: b.BatteryStatus === 2 ? 'AC Power' : 'Bateria'
          };
        }
      } catch (_) {}
    }
  }

  const memTotalMb = Math.round(os.totalmem() / (1024 * 1024));
  const targetFps = memTotalMb < 192 ? 30 : (memTotalMb < 384 ? 45 : 60);
  const perfTier = memTotalMb < 192 ? 'tier1_128mb' : (memTotalMb < 384 ? 'tier2_256mb' : 'tier3_512mb_plus');

  return {
    osName: 'Sistema TV',
    version: '2.0',
    hostPlatform: `${os.type()} ${os.arch()}`,
    hostname: os.hostname(),
    nodeVersion: process.version,
    cpuModel: cpus[0] ? cpus[0].model.trim() : 'Processador',
    cpuCores: cpus.length || 8,
    loadAvg1m: Number((os.loadavg()[0] || 0).toFixed(2)),
    memory: { totalGb: totalMemGb, freeGb: freeMemGb, totalMb: memTotalMb },
    perfTier,
    targetFps,
    uptimeSeconds: Math.floor(process.uptime()),
    hostUptimeHours: Number((os.uptime() / 3600).toFixed(1)),
    audio: { supported: outputVolume !== null, outputVolume, muted },
    bluetooth,
    irReceiver,
    battery,
    darkMode,
    network: {
      status: netInfo.ip !== '127.0.0.1' ? 'Conectado' : 'Local',
      iface: netInfo.iface,
      ip: netInfo.ip,
      mac: netInfo.mac,
      ssid: wifiSsid || 'Rede Local'
    }
  };
}

function rewriteM3u8Content(text, baseUrl) {
  const segUrlsToPrefetch = [];
  const toProxy = (rawUri) => {
    try {
      const abs = new URL(rawUri, baseUrl).toString();
      const lower = rawUri.toLowerCase();
      if (lower.endsWith('.ts') || lower.endsWith('.m4s') || lower.includes('.ts?') || lower.includes('.m4s?')) {
        segUrlsToPrefetch.push(abs);
        return `/api/stream-proxy/segment.ts?url=${encodeURIComponent(abs)}`;
      }
      return `/api/stream-proxy/playlist.m3u8?url=${encodeURIComponent(abs)}`;
    } catch (_) {
      return rawUri;
    }
  };

  const rewritten = text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${toProxy(uri)}"`);
      }
      return toProxy(trimmed);
    })
    .join('\n');

  // Background prefetch the newest segment(s) so playback never stalls waiting for next chunk
  if (segUrlsToPrefetch.length > 0) {
    const toPrefetch = segUrlsToPrefetch.slice(-2);
    for (const segUrl of toPrefetch) {
      if (!segmentCache.has(segUrl)) {
        fetchBufferWithRedirects(segUrl).then((buf) => {
          if (buf && buf.length > 0) cacheSegment(segUrl, buf);
        }).catch(() => {});
      }
    }
  }

  return rewritten;
}

// Real-time zero-copy HLS transmuxer for GloboNews
let globoTransmuxProc = null;
let globoLastAccess = 0;
let globoStopTimer = null;
const GLOBO_DIR = path.join(os.tmpdir(), 'iristv_globo_hls');

function ensureGloboTransmuxer() {
  globoLastAccess = Date.now();
  clearTimeout(globoStopTimer);
  globoStopTimer = setTimeout(() => {
    if (Date.now() - globoLastAccess > 60000 && globoTransmuxProc) {
      try { globoTransmuxProc.kill('SIGTERM'); } catch (_) {}
      globoTransmuxProc = null;
    }
  }, 65000);

  if (globoTransmuxProc && !globoTransmuxProc.killed) return;
  try { fs.mkdirSync(GLOBO_DIR, { recursive: true }); } catch (_) {}
  try {
    for (const f of fs.readdirSync(GLOBO_DIR)) {
      if (f.startsWith('live')) fs.unlinkSync(path.join(GLOBO_DIR, f));
    }
  } catch (_) {}

  globoTransmuxProc = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-user_agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    '-i', 'http://79.127.238.228:14093',
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '5',
    '-hls_flags', 'delete_segments+split_by_time',
    path.join(GLOBO_DIR, 'live.m3u8')
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  globoTransmuxProc.on('exit', () => { globoTransmuxProc = null; });
  globoTransmuxProc.on('error', () => { globoTransmuxProc = null; });
}

function handleStreamProxy(targetUrlStr, req, res, hops = 0) {
  if (hops > 5) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Too many redirects');
  }

  let parsed;
  try {
    parsed = new URL(targetUrlStr);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Invalid stream URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Unsupported protocol');
  }

  // Instant response from memory cache for segments (0ms latency, zero buffering delays)
  const cachedSegBuf = segmentCache.get(targetUrlStr) || segmentCache.get(parsed.toString());
  if (cachedSegBuf && cachedSegBuf.length > 0) {
    const isM4s = targetUrlStr.endsWith('.m4s') || targetUrlStr.includes('.mp4');
    res.writeHead(200, {
      'Content-Type': isM4s ? 'video/mp4' : 'video/mp2t',
      'Content-Length': cachedSegBuf.length,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'public, max-age=60',
      'Accept-Ranges': 'bytes',
      'X-Proxy-Cache': 'HIT'
    });
    if (req.method === 'HEAD') return res.end();
    return res.end(cachedSegBuf);
  }

  const isHttps = parsed.protocol === 'https:';
  const client = isHttps ? https : http;
  const upstreamReq = client.get(
    parsed,
    {
      agent: isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept-Encoding': 'identity',
        Accept: '*/*'
      },
      timeout: 12000
    },
    (upstreamRes) => {
      const status = upstreamRes.statusCode || 502;
      if ([301, 302, 303, 307, 308].includes(status) && upstreamRes.headers.location) {
        const nextUrl = new URL(upstreamRes.headers.location, parsed).toString();
        upstreamRes.resume();
        return handleStreamProxy(nextUrl, req, res, hops + 1);
      }

      const ctype = (upstreamRes.headers['content-type'] || '').toLowerCase();
      const cenc = (upstreamRes.headers['content-encoding'] || '').toLowerCase();
      const looksLikeM3u8 =
        parsed.pathname.toLowerCase().includes('.m3u8') ||
        ctype.includes('mpegurl') ||
        ctype.includes('x-mpegurl');

      if (looksLikeM3u8 && status >= 200 && status < 300) {
        if (req.method === 'HEAD') {
          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Accept-Ranges': 'bytes'
          });
          upstreamRes.destroy();
          return res.end();
        }
        const chunks = [];
        let total = 0;
        let stream = upstreamRes;
        if (cenc.includes('gzip')) stream = upstreamRes.pipe(zlib.createGunzip());
        else if (cenc.includes('br')) stream = upstreamRes.pipe(zlib.createBrotliDecompress());
        else if (cenc.includes('deflate')) stream = upstreamRes.pipe(zlib.createInflate());

        stream.on('data', (c) => {
          total += c.length;
          if (total <= 2 * 1024 * 1024) chunks.push(c);
        });
        stream.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Stream decode error');
          }
        });
        stream.on('end', () => {
          const buf = Buffer.concat(chunks);
          const rawBuf = (buf[0] === 0x1f && buf[1] === 0x8b) ? zlib.gunzipSync(buf) : buf;
          const text = rawBuf.toString('utf8');
          const rewritten = rewriteM3u8Content(text, parsed.toString());
          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Accept-Ranges': 'bytes'
          });
          res.end(rewritten);
        });
        return;
      }

      const targetLower = targetUrlStr.toLowerCase();
      let segMime = upstreamRes.headers['content-type'];
      if (!segMime || segMime.includes('octet-stream')) {
        if (targetLower.endsWith('.m4s') || targetLower.includes('.m4s?') || targetLower.endsWith('.mp4') || targetLower.includes('.mp4?')) {
          segMime = 'video/mp4';
        } else if (targetLower.endsWith('.m3u8') || targetLower.includes('.m3u8?')) {
          segMime = 'application/vnd.apple.mpegurl';
        } else {
          segMime = 'video/mp2t';
        }
      }

      const outHeaders = {
        'Content-Type': segMime,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      };
      if (upstreamRes.headers['content-length']) {
        outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
      }
      if (req.method === 'HEAD') {
        res.writeHead(status, outHeaders);
        upstreamRes.destroy();
        return res.end();
      }
      res.writeHead(status, outHeaders);
      const shouldCacheSeg = status === 200 && Number(upstreamRes.headers['content-length'] || 0) <= MAX_SEGMENT_BYTES;
      const segChunks = shouldCacheSeg ? [] : null;
      let segTotal = 0;
      upstreamRes.on('data', (chunk) => {
        if (segChunks) {
          segTotal += chunk.length;
          if (segTotal <= MAX_SEGMENT_BYTES) segChunks.push(chunk);
        }
      });
      upstreamRes.on('end', () => {
        if (segChunks && segTotal > 0 && segTotal <= MAX_SEGMENT_BYTES) {
          const fullBuf = Buffer.concat(segChunks);
          cacheSegment(parsed.toString(), fullBuf);
          if (targetUrlStr !== parsed.toString()) cacheSegment(targetUrlStr, fullBuf);
        }
      });
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Upstream stream timeout');
    }
  });

  upstreamReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Upstream stream error');
    }
  });

  req.on('close', () => upstreamReq.destroy());
}

function getAssetEntry(filePath, ext, stat) {
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const cached = assetCache.get(filePath);
  if (cached && cached.etag === etag) {
    return Promise.resolve(cached);
  }

  return fs.promises.readFile(filePath).then((raw) => {
    const entry = { etag, raw, br: null, gz: null };
    if (COMPRESSIBLE.has(ext) && raw.length > 512) {
      entry.br = zlib.brotliCompressSync(raw, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
      });
      entry.gz = zlib.gzipSync(raw, { level: 6 });
    }
    assetCache.set(filePath, entry);
    return entry;
  });
}

const osEventClients = new Set();

function broadcastOsEvent(eventName, payload) {
  if (!osEventClients.size) return;
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const clientRes of osEventClients) {
    try {
      clientRes.write(msg);
    } catch {
      osEventClients.delete(clientRes);
    }
  }
}

let hwVolWatcherStarted = false;
function startHardwareVolumeKeyWatcher() {
  if (hwVolWatcherStarted || process.platform !== 'linux') return;
  hwVolWatcherStarted = true;

  const watchedDevs = new Set();
  let volBusy = false;
  const volQueue = [];

  async function processVolQueue() {
    if (volBusy || !volQueue.length) return;
    volBusy = true;
    try {
      while (volQueue.length) {
        const action = volQueue.shift();
        if (action === 'up') {
          await runCmd('amixer', ['sset', 'Master', '6%+', 'unmute']);
        } else if (action === 'down') {
          await runCmd('amixer', ['sset', 'Master', '6%-']);
        } else if (action === 'mute') {
          await runCmd('amixer', ['sset', 'Master', 'toggle']);
        }
      }
      const amixRes = await runCmd('amixer', ['get', 'Master']);
      if (amixRes.ok && amixRes.stdout) {
        const m = amixRes.stdout.match(/\[(\d+)%\]/);
        const outputVolume = m ? Math.min(100, Number(m[1])) : 70;
        const muted = /\[off\]/i.test(amixRes.stdout);
        broadcastOsEvent('volume', { outputVolume, muted, ts: Date.now() });
      }
    } catch {}
    volBusy = false;
  }

  function enqueueVolAction(action) {
    if (volQueue.length < 8) volQueue.push(action);
    processVolQueue();
  }

  function attachInputDevice(devPath) {
    if (watchedDevs.has(devPath)) return;
    try {
      const stream = fs.createReadStream(devPath, { highWaterMark: 24 * 16 });
      watchedDevs.add(devPath);
      let rem = Buffer.alloc(0);
      stream.on('data', (chunk) => {
        const buf = rem.length ? Buffer.concat([rem, chunk]) : chunk;
        let off = 0;
        while (off + 24 <= buf.length) {
          const evType = buf.readUInt16LE(off + 16);
          const evCode = buf.readUInt16LE(off + 18);
          const evVal = buf.readInt32LE(off + 20);
          if (evType === 1 && (evVal === 1 || evVal === 2)) {
            if (evCode === 115) enqueueVolAction('up');
            else if (evCode === 114) enqueueVolAction('down');
            else if (evCode === 113 && evVal === 1) enqueueVolAction('mute');
          }
          off += 24;
        }
        rem = off < buf.length ? buf.subarray(off) : Buffer.alloc(0);
      });
      stream.on('error', () => {
        watchedDevs.delete(devPath);
        try { stream.destroy(); } catch {}
      });
      stream.on('close', () => {
        watchedDevs.delete(devPath);
      });
    } catch {
      watchedDevs.delete(devPath);
    }
  }

  function scanInputDevices() {
    try {
      const entries = fs.readdirSync('/dev/input');
      for (const name of entries) {
        if (/^event\d+$/.test(name)) attachInputDevice(path.join('/dev/input', name));
      }
    } catch {}
  }

  scanInputDevices();
  setInterval(scanInputDevices, 5000).unref();
}

// Rotas sensíveis (ex.: cofre de senhas) só aceitam acesso local e vindo da própria página do irisTV.
// Bloqueia outros aparelhos da rede, sites de terceiros abertos no navegador e DNS rebinding.
function isTrustedLocalRequest(req) {
  const remote = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const isLoopback = remote === '127.0.0.1' || remote === '::1';
  const hostName = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  const hostOk = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';
  let originOk = true;
  if (req.headers.origin) {
    try { originOk = new URL(req.headers.origin).host === req.headers.host; } catch (_) { originOk = false; }
  }
  return isLoopback && hostOk && originOk;
}

function createAppServer() {
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname.startsWith('/api/passwords/') && !isTrustedLocalRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, error: 'Forbidden' }));
    }

    if (req.method === 'GET' && pathname === '/api/os/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('retry: 2000\n\n');
      osEventClients.add(res);
      const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 25000);
      req.on('close', () => {
        clearInterval(keepAlive);
        osEventClients.delete(res);
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/media-player/probe-duration') {
      const tmpFile = path.join(os.tmpdir(), `iris_probe_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
      try {
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(tmpFile);
          let size = 0;
          req.on('data', (c) => {
            size += c.length;
            if (size > 400 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); }
          });
          req.pipe(ws);
          ws.on('finish', resolve);
          ws.on('error', reject);
          req.on('error', reject);
        });
        let duration = 0;
        const ff = await runCmd('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', tmpFile], 20000);
        if (ff.ok) {
          try { duration = Number(JSON.parse(ff.stdout)?.format?.duration) || 0; } catch (_) {}
        }
        if (!duration && process.platform === 'darwin') {
          const af = await runCmd('afinfo', [tmpFile], 20000);
          const m = af.stdout.match(/estimated duration:\s*([\d.]+)/i);
          if (m) duration = Number(m[1]) || 0;
        }
        return sendJson(req, res, 200, { ok: duration > 0, duration });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      } finally {
        fs.unlink(tmpFile, () => {});
      }
    }

    if (pathname === '/api/channels/health') {
      let urls = [];
      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req, 65536);
          urls = Array.isArray(body?.urls) ? body.urls : [];
        } catch (_) {}
      } else {
        const raw = reqUrl.searchParams.get('urls');
        urls = raw ? raw.split(',').map((u) => u.trim()).filter(Boolean) : [];
      }

      if (!urls.length) {
        const healthObj = {};
        for (const [u, val] of CHANNEL_HEALTH.entries()) {
          healthObj[u] = val.ok;
        }
        return sendJson(req, res, 200, { ok: true, health: healthObj, total: Object.keys(healthObj).length });
      }

      const results = await Promise.all(urls.map((u) => checkSingleStreamHealth(u)));
      const healthObj = {};
      urls.forEach((u, idx) => {
        healthObj[u] = results[idx].ok;
      });
      return sendJson(req, res, 200, { ok: true, health: healthObj, total: urls.length });
    }

    if (req.method === 'POST' && ['/api/os/volume', '/api/os/appearance', '/api/os/power', '/api/captions/segment', '/api/m3u/fetch'].includes(pathname)) {
      try {
        const body = await readJsonBody(req);
        if (pathname === '/api/os/volume') {
          if (process.platform === 'darwin') {
            if (typeof body.volume === 'number') {
              const v = Math.max(0, Math.min(100, Math.round(body.volume)));
              await runCmd('osascript', ['-e', `set volume output volume ${v}`]);
            }
            if (typeof body.muted === 'boolean') {
              await runCmd('osascript', ['-e', `set volume output muted ${body.muted ? 'true' : 'false'}`]);
            }
          } else if (process.platform === 'linux') {
            if (typeof body.volume === 'number') {
              const v = Math.max(0, Math.min(100, Math.round(body.volume)));
              await runCmd('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${v}%`]);
              await runCmd('amixer', ['set', 'Master', `${v}%`, ...(body.muted === true ? [] : ['unmute'])]);
            }
            if (typeof body.muted === 'boolean') {
              await runCmd('pactl', ['set-sink-mute', '@DEFAULT_SINK@', body.muted ? '1' : '0']);
              await runCmd('amixer', ['set', 'Master', body.muted ? 'mute' : 'unmute']);
            }
          }
          const updated = await getRealOsStatus();
          return sendJson(req, res, 200, { ok: true, audio: updated.audio });
        }

        if (pathname === '/api/os/appearance') {
          let result = { ok: false };
          if (process.platform === 'darwin') {
            const modeStr = body.darkMode ? 'true' : 'false';
            result = await runCmd('osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${modeStr}`]);
          } else if (process.platform === 'win32') {
            const val = body.darkMode ? '0' : '1';
            const r1 = await runCmd('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme', '/t', 'REG_DWORD', '/d', val, '/f']);
            await runCmd('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme', '/t', 'REG_DWORD', '/d', val, '/f']);
            result = r1;
          }
          return sendJson(req, res, 200, { ok: result.ok, error: result.ok ? null : result.stderr });
        }

        if (pathname === '/api/os/power') {
          if (body.action === 'sleep-display') {
            if (process.platform === 'darwin') {
              await runCmd('pmset', ['displaysleepnow']);
              return sendJson(req, res, 200, { ok: true });
            } else if (process.platform === 'win32') {
              await runCmd('powershell', ['-NoProfile', '-Command', "(Add-Type '[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)"]);
              return sendJson(req, res, 200, { ok: true });
            } else if (process.platform === 'linux') {
              await runCmd('systemctl', ['suspend']);
              return sendJson(req, res, 200, { ok: true });
            }
          }
          if (body.action === 'reboot' && process.platform === 'linux') {
            await runCmd('systemctl', ['reboot']);
            return sendJson(req, res, 200, { ok: true });
          }
          if (body.action === 'poweroff' && process.platform === 'linux') {
            await runCmd('systemctl', ['poweroff']);
            return sendJson(req, res, 200, { ok: true });
          }
          return sendJson(req, res, 400, { ok: false, error: 'Unsupported power action' });
        }

        if (pathname === '/api/captions/segment') {
          const session = String(body.session || '').slice(0, 64);
          if (!session) return sendJson(req, res, 400, { ok: false, error: 'Missing session' });
          const mode = body.mode || 'segment';
          const lang = String(body.lang || 'auto').replace(/[^a-z-]/gi, '').slice(0, 8) || 'auto';

          if (mode === 'reset') {
            enqueueCaptionJob(session, { cmd: 'reset', session });
            return sendJson(req, res, 200, { ok: true });
          }

          if (mode === 'vod') {
            const vodUrl = String(body.url || '');
            enqueueCaptionJob(session, {
              cmd: 'vod',
              session,
              url: vodUrl,
              ss: Number(body.ss || 0),
              duration: Number(body.duration || 8),
              lang
            });
            return sendJson(req, res, 200, { ok: true });
          }

          const segUrl = String(body.url || '');
          const seq = Number(body.seq || 0);
          const start = Number(body.start || 0);
          const duration = Number(body.duration || 0);
          const cachedBuf = segmentCache.get(segUrl);
          if (cachedBuf) {
            enqueueCaptionJob(session, {
              cmd: 'segment',
              session,
              seq,
              start,
              duration,
              lang,
              byte_len: cachedBuf.length
            }, cachedBuf);
            return sendJson(req, res, 200, { ok: true, cached: true });
          }

          fetchBufferWithRedirects(segUrl)
            .then((buf) => {
              if (captionActiveSession && captionActiveSession !== session) return;
              cacheSegment(segUrl, buf);
              enqueueCaptionJob(session, {
                cmd: 'segment',
                session,
                seq,
                start,
                duration,
                lang,
                byte_len: buf.length
              }, buf);
            })
            .catch(() => {});
          return sendJson(req, res, 200, { ok: true, cached: false });
        }

        if (pathname === '/api/m3u/fetch') {
          const targetUrl = String(body.url || '').trim();
          let parsedM3u = null;
          try { parsedM3u = new URL(targetUrl); } catch (_) {}
          if (!parsedM3u || (parsedM3u.protocol !== 'http:' && parsedM3u.protocol !== 'https:')) {
            return sendJson(req, res, 400, { ok: false, error: 'URL M3U inválida' });
          }
          const buf = await fetchBufferWithRedirects(parsedM3u.toString());
          return sendJson(req, res, 200, { ok: true, content: buf.toString('utf8') });
        }
      } catch (err) {
        return sendJson(req, res, 400, { ok: false, error: err.message });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    if (pathname === '/api/system' || pathname === '/api/os/status') {
      const status = await getRealOsStatus();
      return sendJson(req, res, 200, status);
    }

    if (pathname === '/api/wifi/status') {
      try {
        const doScan = reqUrl.searchParams.get('scan') === '1';
        const netInfo = getNetworkInterfaceInfo();

        if (process.platform === 'linux') {
          // Descobre interface wireless no Linux via /sys/class/net/*/wireless ou phy80211
          const iwDevRes = await runCmd('sh', ['-c', 'for d in /sys/class/net/*; do if [ -d "$d/wireless" ] || [ -d "$d/phy80211" ]; then basename "$d"; exit 0; fi; done; iw dev 2>/dev/null | awk \'$1=="Interface"{print $2; exit}\'; ls /sys/class/net 2>/dev/null | grep -E "^(wl|wlan|ath|mlan|ra)" | head -n 1']);
          const iface = (iwDevRes.stdout || '').trim() || 'wlan0';
          let connectedSsid = '';
          let rssi = -55;
          const bySsid = new Map();

          // Tenta via nmcli primeiro, com fallback para iw / wpa_cli (Alpine / Live USB)
          const nmRes = await runCmd('nmcli', ['-t', '-f', 'ACTIVE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list']);
          if (nmRes.ok && nmRes.stdout) {
            for (const line of nmRes.stdout.split(/\r?\n/)) {
              if (!line.trim()) continue;
              const parts = line.split(':');
              const active = /^(yes|sim)$/i.test(parts[0] || '');
              const ssid = (parts[1] || '').trim();
              const sig = Number(parts[2] || 70);
              const sec = (parts[3] || '').trim();
              if (!ssid) continue;
              const dbm = Math.round(-100 + (sig * 0.5));
              if (active) {
                connectedSsid = ssid;
                rssi = dbm;
              }
              bySsid.set(ssid, {
                ssid,
                rssi: dbm,
                secure: Boolean(sec && sec !== '--'),
                saved: active,
                connected: active
              });
            }
          } else {
            const iwgetRes = await runCmd('sh', ['-c', `iwgetid -r 2>/dev/null || iw dev ${iface} link 2>/dev/null | sed -n 's/.*SSID: //p'`]);
            connectedSsid = (iwgetRes.stdout || '').trim();
            if (doScan) {
              await runCmd('sh', ['-c', `rfkill unblock all 2>/dev/null || true; ip link set ${iface} up 2>/dev/null || ifconfig ${iface} up 2>/dev/null || true`]);
              const iwScan = await runCmd('sh', ['-c', `iw dev ${iface} scan 2>/dev/null || iwlist ${iface} scanning 2>/dev/null`], 8000);
              const blocks = (iwScan.stdout || '').split(/\nBSS |\n\s*Cell /);
              for (const b of blocks) {
                const mSsid = b.match(/SSID:\s*(.+)|ESSID:"([^"]+)"/);
                const ssid = (mSsid ? (mSsid[1] || mSsid[2] || '') : '').trim();
                if (!ssid || ssid.startsWith('\\x00')) continue;
                const mSig = b.match(/signal:\s*(-?\d+)/i);
                const dbm = mSig ? Number(mSig[1]) : -65;
                const secure = /WPA|RSN|WEP|Privacy/i.test(b);
                bySsid.set(ssid, {
                  ssid,
                  rssi: dbm,
                  secure,
                  saved: ssid === connectedSsid,
                  connected: ssid === connectedSsid
                });
              }
            }
            if (connectedSsid && !bySsid.has(connectedSsid)) {
              bySsid.set(connectedSsid, {
                ssid: connectedSsid,
                rssi: -52,
                secure: true,
                saved: true,
                connected: true
              });
            }
          }

          const networks = [...bySsid.values()].sort((a, b) => (b.connected - a.connected) || (b.rssi - a.rssi));
          return sendJson(req, res, 200, {
            ok: true,
            interface: iface,
            powerOn: true,
            isAssociated: Boolean(connectedSsid || (netInfo.ip && netInfo.ip !== '127.0.0.1')),
            connectedSsid,
            ip: netInfo.ip,
            rssi,
            networks
          });
        }

        const iface = 'en0';
        const [powerRes, prefRes, scanRes] = await Promise.all([
          runCmd('networksetup', ['-getairportpower', iface]),
          runCmd('networksetup', ['-listpreferredwirelessnetworks', iface]),
          execFileAsyncSafe('/Users/macosx/Downloads/irisoS/wifi-helper', [doScan ? 'scan' : 'fast'], doScan ? 7000 : 1800)
        ]);
        const powerOn = /:\s*On/i.test(powerRes.stdout || '');
        const savedList = String(prefRes.stdout || '')
          .split(/\r?\n/)
          .slice(1)
          .map((s) => s.trim())
          .filter(Boolean);
        const savedSet = new Set(savedList);

        let helperData = {};
        try { helperData = JSON.parse(scanRes.stdout || '{}'); } catch (_) {}

        let connectedSsid = String(helperData.connectedSsid || '').trim();
        if (connectedSsid === '<redacted>') connectedSsid = '';
        const rssi = Number(helperData.rssi) || 0;
        const isAssociated = Boolean(powerOn && (connectedSsid || (netInfo.ip && netInfo.ip !== '127.0.0.1')));

        const bySsid = new Map();
        for (const n of (Array.isArray(helperData.networks) ? helperData.networks : [])) {
          if (!n?.ssid || n.ssid === '<redacted>') continue;
          bySsid.set(n.ssid, {
            ssid: n.ssid,
            rssi: Number(n.rssi) || -65,
            secure: n.secure !== false,
            saved: savedSet.has(n.ssid),
            connected: Boolean(n.connected || (connectedSsid && n.ssid === connectedSsid))
          });
        }
        for (const ssid of savedList) {
          if (!bySsid.has(ssid)) {
            bySsid.set(ssid, {
              ssid,
              rssi: connectedSsid === ssid ? (rssi || -55) : -70,
              secure: true,
              saved: true,
              connected: Boolean(connectedSsid && ssid === connectedSsid)
            });
          }
        }
        const networks = [...bySsid.values()].sort((a, b) => (b.connected - a.connected) || (b.saved - a.saved) || (b.rssi - a.rssi));
        return sendJson(req, res, 200, {
          ok: true,
          interface: iface,
          powerOn: Boolean(powerOn || helperData.powerOn),
          isAssociated,
          connectedSsid,
          ip: netInfo.ip,
          rssi,
          networks
        });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/wifi/power' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        if (process.platform === 'linux') {
          const targetState = body.enabled ? 'on' : 'off';
          await runCmd('nmcli', ['radio', 'wifi', targetState], 5000);
          if (body.enabled) {
            await runCmd('sh', ['-c', 'rfkill unblock all 2>/dev/null || true; for d in /sys/class/net/*; do if [ -d "$d/wireless" ] || [ -d "$d/phy80211" ]; then ip link set "$(basename "$d")" up 2>/dev/null || true; fi; done'], 5000);
          } else {
            await runCmd('sh', ['-c', 'killall wpa_supplicant 2>/dev/null || true; for d in /sys/class/net/*; do if [ -d "$d/wireless" ] || [ -d "$d/phy80211" ]; then ip link set "$(basename "$d")" down 2>/dev/null || true; fi; done'], 5000);
          }
          return sendJson(req, res, 200, { ok: true, powerOn: Boolean(body.enabled) });
        }
        const targetState = body.enabled ? 'on' : 'off';
        const resCmd = await runCmd('networksetup', ['-setairportpower', 'en0', targetState], 5000);
        return sendJson(req, res, resCmd.ok ? 200 : 400, { ok: resCmd.ok, powerOn: Boolean(body.enabled), error: resCmd.stderr || '' });
      } catch (err) {
        return sendJson(req, res, 400, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/wifi/disconnect' && req.method === 'POST') {
      try {
        if (process.platform === 'linux') {
          await runCmd('sh', ['-c', 'killall -9 wpa_supplicant 2>/dev/null || true; for d in /sys/class/net/*; do if [ -d "$d/wireless" ] || [ -d "$d/phy80211" ]; then ip addr flush dev "$(basename "$d")" 2>/dev/null || true; fi; done']);
          return sendJson(req, res, 200, { ok: true });
        }
        await runCmd('networksetup', ['-setairportpower', 'en0', 'off']);
        await new Promise((r) => setTimeout(r, 600));
        await runCmd('networksetup', ['-setairportpower', 'en0', 'on']);
        return sendJson(req, res, 200, { ok: true });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/wifi/connect' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const ssid = String(body.ssid || '').trim();
        const password = String(body.password || '');
        if (!ssid) return sendJson(req, res, 400, { ok: false, error: 'Nome da rede (SSID) obrigatório' });

        if (process.platform === 'linux') {
          // 1. Tenta via nmcli se NetworkManager estiver ativo
          const nmArgs = password
            ? ['dev', 'wifi', 'connect', ssid, 'password', password]
            : ['dev', 'wifi', 'connect', ssid];
          const nmJoin = await runCmd('nmcli', nmArgs, 15000);
          if (nmJoin.ok) {
            return sendJson(req, res, 200, { ok: true, ssid, error: '' });
          }
          // 2. Fallback robusto para wpa_supplicant + udhcpc (Alpine / irisOS Live USB)
          const iwDevRes = await runCmd('sh', ['-c', 'for d in /sys/class/net/*; do if [ -d "$d/wireless" ] || [ -d "$d/phy80211" ]; then basename "$d"; exit 0; fi; done; iw dev 2>/dev/null | awk \'$1=="Interface"{print $2; exit}\'; ls /sys/class/net 2>/dev/null | grep -E "^(wl|wlan|ath|mlan|ra)" | head -n 1']);
          const iface = (iwDevRes.stdout || '').trim() || 'wlan0';
          const confPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
          fs.mkdirSync('/etc/wpa_supplicant', { recursive: true });
          const safeSsid = ssid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const safePass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          if (password) {
            const pskRes = await runCmd('wpa_passphrase', [ssid, password]);
            if (pskRes.ok && pskRes.stdout) {
              fs.writeFileSync(confPath, `ctrl_interface=/var/run/wpa_supplicant\nupdate_config=1\n${pskRes.stdout}\n`);
            } else {
              fs.writeFileSync(confPath, `ctrl_interface=/var/run/wpa_supplicant\nupdate_config=1\nnetwork={\n  ssid="${safeSsid}"\n  psk="${safePass}"\n}\n`);
            }
          } else {
            fs.writeFileSync(confPath, `ctrl_interface=/var/run/wpa_supplicant\nnetwork={\n  ssid="${safeSsid}"\n  key_mgmt=NONE\n}\n`);
          }
          // Persiste no pendrive em todos os pontos possíveis de montagem
          for (const usbPath of ['/media/usb', '/media/usb_boot', '/media', '/run/media']) {
            try {
              if (fs.existsSync(usbPath)) {
                if (fs.statSync(usbPath).isDirectory()) {
                  // Se for diretório pai /media, checa subdiretórios
                  if (usbPath === '/media' || usbPath === '/run/media') {
                    for (const sub of fs.readdirSync(usbPath)) {
                      const fullSub = path.join(usbPath, sub);
                      if (fs.existsSync(path.join(fullSub, 'boot')) || fs.existsSync(path.join(fullSub, 'irisTV.apkovl.tar.gz'))) {
                        fs.copyFileSync(confPath, path.join(fullSub, 'irisos-wifi.conf'));
                      }
                    }
                  } else {
                    fs.copyFileSync(confPath, path.join(usbPath, 'irisos-wifi.conf'));
                  }
                }
              }
            } catch (_) {}
          }
          const connScript = `
            rfkill unblock all 2>/dev/null || true
            killall -9 wpa_supplicant 2>/dev/null || true
            rm -rf /var/run/wpa_supplicant
            ip link set "${iface}" up 2>/dev/null || ifconfig "${iface}" up 2>/dev/null || true
            wpa_supplicant -B -i "${iface}" -c "${confPath}" -D nl80211,wext >/dev/null 2>&1 || wpa_supplicant -B -i "${iface}" -c "${confPath}" >/dev/null 2>&1
            for _ in $(seq 1 18); do
              if iw dev "${iface}" link 2>/dev/null | grep -q "Connected"; then
                break
              fi
              sleep 0.5
            done
            udhcpc -i "${iface}" -n -q -t 6 -T 2 >/dev/null 2>&1 || udhcpc -i "${iface}" -b -q >/dev/null 2>&1 || true
            printf "nameserver 1.1.1.1\\nnameserver 8.8.8.8\\n" > /etc/resolv.conf
            iw dev "${iface}" link 2>/dev/null | grep -q "Connected"
          `;
          const joinRes = await runCmd('sh', ['-c', connScript], 25000);
          if (joinRes.ok) {
            return sendJson(req, res, 200, { ok: true, ssid, error: '' });
          }
          return sendJson(req, res, 400, { ok: false, ssid, error: 'Não foi possível conectar. Verifique a senha da rede.' });
        }

        const args = password ? ['-setairportnetwork', 'en0', ssid, password] : ['-setairportnetwork', 'en0', ssid];
        const joinRes = await execFileAsyncSafe('networksetup', args, 15000);
        const combined = `${joinRes.stdout || ''} ${joinRes.stderr || ''}`.trim();
        const failed = !joinRes.ok || /failed|could not find|error/i.test(combined);
        return sendJson(req, res, failed ? 400 : 200, {
          ok: !failed,
          ssid,
          error: failed ? (combined || 'Não foi possível conectar. Verifique a senha.') : ''
        });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/weather') {
      const q = (reqUrl.searchParams.get('q') || 'São Paulo').trim();
      const lat = reqUrl.searchParams.get('lat');
      const lon = reqUrl.searchParams.get('lon');
      const lang = reqUrl.searchParams.get('lang') || 'pt';
      try {
        const w = await fetchWeatherData({ q, lat, lon, lang });
        return sendJson(req, res, 200, w);
      } catch (err) {
        return sendJson(req, res, 400, { ok: false, error: err.message });
      }
    }

    const PASSWORD_VAULT_PATH = path.join(ROOT_DIR, 'iristv-passwords.vault.json');
    const VAULT_KEY_PATH = path.join(ROOT_DIR, '.iristv-vault.key');
    // Chave antiga (previsível: derivada de hostname/usuário). Usada só para ler senhas já salvas.
    const getLegacyVaultKey = () => crypto.scryptSync(`${os.hostname()}:${os.userInfo().username}:irisTV-OS-Vault`, 'iristv-vault-salt-v1', 32);
    // Chave nova: aleatória, criada uma vez e guardada fora do Git (.gitignore) com permissão 0600.
    const getVaultKey = () => {
      try {
        const hex = fs.readFileSync(VAULT_KEY_PATH, 'utf8').trim();
        if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
      } catch (_) {}
      const key = crypto.randomBytes(32);
      fs.writeFileSync(VAULT_KEY_PATH, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
      return key;
    };
    const normalizeVaultHost = (h) => String(h || '').toLowerCase().trim().replace(/^www\./, '');
    const readVaultMap = () => {
      try {
        if (!fs.existsSync(PASSWORD_VAULT_PATH)) return {};
        const parsed = JSON.parse(fs.readFileSync(PASSWORD_VAULT_PATH, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) { return {}; }
    };
    const writeVaultMap = (mapObj) => {
      fs.writeFileSync(PASSWORD_VAULT_PATH, JSON.stringify(mapObj, null, 2), { encoding: 'utf8', mode: 0o600 });
    };
    const encryptSecret = (plain) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', getVaultKey(), iv);
      const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
    };
    const decryptWithKey = (key, ivHex, tagHex, dataHex) => {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    };
    const decryptSecret = (packed) => {
      const [ivHex, tagHex, dataHex] = String(packed || '').split(':');
      if (!ivHex || !tagHex || !dataHex) return '';
      try {
        return decryptWithKey(getVaultKey(), ivHex, tagHex, dataHex);
      } catch (_) {
        // Senha salva antes da mudança de chave: lê com a chave antiga (será regravada na próxima vez que for salva).
        return decryptWithKey(getLegacyVaultKey(), ivHex, tagHex, dataHex);
      }
    };

    if (pathname === '/api/passwords/list') {
      const vault = readVaultMap();
      const items = Object.entries(vault).map(([host, entry]) => ({
        host,
        username: entry?.username || '',
        updatedAt: entry?.updatedAt || null
      }));
      return sendJson(req, res, 200, { ok: true, items });
    }

    if (pathname === '/api/passwords/get') {
      const host = normalizeVaultHost(reqUrl.searchParams.get('host'));
      const vault = readVaultMap();
      const entry = host ? vault[host] : null;
      if (!entry) return sendJson(req, res, 200, { ok: true, found: false });
      try {
        const password = decryptSecret(entry.secret);
        return sendJson(req, res, 200, { ok: true, found: true, host, username: entry.username || '', password });
      } catch (_) {
        return sendJson(req, res, 200, { ok: true, found: false });
      }
    }

    if (req.method === 'POST' && pathname === '/api/passwords/save') {
      try {
        const body = await readJsonBody(req);
        const host = normalizeVaultHost(body.host);
        const password = String(body.password || '');
        const username = String(body.username || '').trim();
        if (!host || !password) return sendJson(req, res, 400, { ok: false, error: 'Missing host or password' });
        const vault = readVaultMap();
        vault[host] = { username, secret: encryptSecret(password), updatedAt: Date.now() };
        writeVaultMap(vault);
        return sendJson(req, res, 200, { ok: true, host, username });
      } catch (err) {
        return sendJson(req, res, 400, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && pathname === '/api/passwords/delete') {
      try {
        const body = await readJsonBody(req);
        const host = normalizeVaultHost(body.host);
        const vault = readVaultMap();
        delete vault[host];
        writeVaultMap(vault);
        return sendJson(req, res, 200, { ok: true });
      } catch (err) {
        return sendJson(req, res, 400, { ok: false, error: err.message });
      }
    }

    const TV_ANDROID_PACKAGES = {
      spotify: 'com.spotify.tv.android',
      globoplay: 'com.globo.globotv',
      kodi: 'org.xbmc.kodi',
      stremio: 'com.stremio.one',
      plex: 'com.plexapp.android',
      youtube: 'com.google.android.youtube.tv'
    };

    const findExec = (names) => {
      for (const n of names) {
        for (const dir of ['/usr/bin', '/usr/local/bin', '/bin']) {
          const p = path.join(dir, n);
          if (fs.existsSync(p)) return p;
        }
      }
      return null;
    };

    if (pathname === '/api/os/tv-runtime') {
      return sendJson(req, res, 200, {
        ok: true,
        platform: process.platform,
        cog: Boolean(findExec(['cog'])),
        chromium: Boolean(findExec(['chromium', 'chromium-browser', 'google-chrome'])),
        waydroid: Boolean(findExec(['waydroid']))
      });
    }

    if (req.method === 'POST' && pathname === '/api/os/close-tv-app') {
      if (global.__irisActiveTvAppProc) {
        try { global.__irisActiveTvAppProc.kill('SIGTERM'); } catch (_) { }
        global.__irisActiveTvAppProc = null;
      }
      return sendJson(req, res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname === '/api/os/launch-tv-app') {
      try {
        const body = await readJsonBody(req);
        const appId = String(body.id || '').toLowerCase().trim();
        const appName = String(body.name || appId || 'TV App').trim();
        const rawUrl = String(body.url || '').trim();
        const androidPkg = String(body.androidPackage || TV_ANDROID_PACKAGES[appId] || '').trim();

        if (process.platform !== 'linux') {
          return sendJson(req, res, 200, { ok: true, launched: false, mode: 'browser-fallback' });
        }

        if (global.__irisActiveTvAppProc) {
          try { global.__irisActiveTvAppProc.kill('SIGTERM'); } catch (_) { }
          global.__irisActiveTvAppProc = null;
        }

        const cogBin = findExec(['cog']);
        const chromiumBin = findExec(['chromium', 'chromium-browser', 'google-chrome']);
        const waydroidBin = findExec(['waydroid']);
        const extDir = [
          path.join(ROOT_DIR, 'os', 'tv-nav-extension'),
          '/opt/iristv/os/tv-nav-extension',
          '/opt/iristv/tv-nav-extension'
        ].find((d) => fs.existsSync(path.join(d, 'manifest.json')));

        const preferWaydroidApps = new Set(['spotify', 'globoplay', 'kodi', 'stremio', 'plex']);
        const waydroidReady = Boolean(waydroidBin && (fs.existsSync('/var/lib/waydroid/waydroid.cfg') || fs.existsSync('/etc/waydroid.cfg')));

        // 1. Android TV Nativo via Waydroid (para apps sem Web TV real ou APKs Android TV)
        if (waydroidReady && androidPkg && (preferWaydroidApps.has(appId) || body.preferWaydroid)) {
          const proc = spawn(waydroidBin, ['app', 'launch', androidPkg], {
            env: { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/user/0' },
            detached: true,
            stdio: 'ignore'
          });
          proc.unref();
          global.__irisActiveTvAppProc = proc;
          return sendJson(req, res, 200, { ok: true, launched: true, mode: 'waydroid', package: androidPkg, name: appName });
        }

        // 2. YouTube TV oficial no Cog (WPE WebKit ultra-leve)
        if (appId === 'youtube' && cogBin) {
          const ytTvUrl = 'https://www.youtube.com/tv';
          const tvUa = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 TV Safari/537.36';
          const proc = spawn(cogBin, ['--platform=wl', ytTvUrl], {
            env: {
              ...process.env,
              XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/user/0',
              COG_PLATFORM_WL_VIEW_FULLSCREEN: '1',
              WEBKIT_USER_AGENT: tvUa
            },
            detached: true,
            stdio: 'ignore'
          });
          proc.unref();
          global.__irisActiveTvAppProc = proc;
          return sendJson(req, res, 200, { ok: true, launched: true, mode: 'cog-tv', url: ytTvUrl, name: appName });
        }

        // 3. Streaming DRM (Netflix, Prime, Disney+, Max, Apple TV+) via Chromium Kiosk + Widevine + SpatialNav
        if (chromiumBin && rawUrl) {
          const args = [
            '--kiosk',
            `--app=${rawUrl}`,
            '--autoplay-policy=no-user-gesture-required',
            '--no-first-run',
            '--disable-infobars',
            '--force-device-scale-factor=1.15',
            '--user-data-dir=/tmp/iristv-chromium-apps'
          ];
          if (extDir) args.push(`--load-extension=${extDir}`);
          if (appId === 'youtube') {
            args.push('--user-agent=Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 TV Safari/537.36');
          }
          const proc = spawn(chromiumBin, args, {
            env: { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/user/0' },
            detached: true,
            stdio: 'ignore'
          });
          proc.unref();
          global.__irisActiveTvAppProc = proc;
          return sendJson(req, res, 200, { ok: true, launched: true, mode: 'chromium-kiosk', url: rawUrl, name: appName });
        }

        // 4. Fallback leve no Cog (WPE WebKit)
        if (cogBin && rawUrl) {
          const proc = spawn(cogBin, ['--platform=wl', rawUrl], {
            env: { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/user/0' },
            detached: true,
            stdio: 'ignore'
          });
          proc.unref();
          global.__irisActiveTvAppProc = proc;
          return sendJson(req, res, 200, { ok: true, launched: true, mode: 'cog', url: rawUrl, name: appName });
        }

        return sendJson(req, res, 200, { ok: true, launched: false, mode: 'browser-fallback' });
      } catch (err) {
        return sendJson(req, res, 400, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/news/article') {
      const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        return sendJson(req, res, 400, { ok: false, error: 'Invalid URL' });
      }
      try {
        const r = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(6500)
        });
        if (!r.ok) return sendJson(req, res, 200, { ok: false, paragraphs: [] });
        const html = await r.text();
        const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        let paragraphs = [];

        // 1. Tenta JSON-LD articleBody primeiro quando disponível
        const ldMatches = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
        for (const m of ldMatches) {
          try {
            const parsed = JSON.parse(m[1]);
            const list = Array.isArray(parsed) ? parsed : [parsed];
            for (const obj of list) {
              const bodyTxt = obj?.articleBody || obj?.['@graph']?.find?.((g) => g?.articleBody)?.articleBody;
              if (typeof bodyTxt === 'string' && bodyTxt.trim().length > 120) {
                paragraphs = bodyTxt.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 25).slice(0, 80);
                break;
              }
            }
          } catch (_) { }
          if (paragraphs.length) break;
        }

        // 2. Fallback: extrai <p> do <article> ou do corpo limpo (sem remover <header>)
        if (!paragraphs.length) {
          const cleanHtml = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ');
          const articleBlock = cleanHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] || cleanHtml;
          const extractPs = (src) => {
            const seenP = new Set();
            return [...src.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
              .map((m) => stripHtmlTags(m[1]).replace(/\s+/g, ' ').trim())
              .filter((t) => {
                if (t.length <= 25 || /cookie|privacidade|assinante|cadastre-se|newsletter|todos os direitos/i.test(t)) return false;
                const norm = t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
                if (seenP.has(norm)) return false;
                seenP.add(norm);
                return true;
              });
          };
          paragraphs = extractPs(articleBlock);
          if (paragraphs.length < 2 && articleBlock !== cleanHtml) {
            paragraphs = extractPs(cleanHtml);
          }
          paragraphs = paragraphs.slice(0, 80);
        }
        return sendJson(req, res, 200, { ok: true, imageUrl: ogMatch?.[1] || null, paragraphs });
      } catch (_) {
        return sendJson(req, res, 200, { ok: false, paragraphs: [] });
      }
    }

    if (pathname === '/api/media/details') {
      const title = (reqUrl.searchParams.get('title') || '').trim();
      if (!title) return sendJson(req, res, 400, { ok: false, error: 'Missing title' });
      const type = reqUrl.searchParams.get('type') || 'ALL';
      const lang = reqUrl.searchParams.get('lang') || 'pt';
      const country = reqUrl.searchParams.get('country') || 'BR';
      try {
        const details = await fetchMediaDetails({ title, type, lang, country });
        return sendJson(req, res, 200, details);
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/media/discover') {
      const type = reqUrl.searchParams.get('type') || 'ALL';
      const q = (reqUrl.searchParams.get('q') || '').trim();
      const genreRaw = (reqUrl.searchParams.get('genre') || '').trim();
      const genres = genreRaw ? genreRaw.split(',').filter(Boolean) : [];
      const lang = reqUrl.searchParams.get('lang') || 'pt';
      const country = reqUrl.searchParams.get('country') || 'BR';
      const first = Number(reqUrl.searchParams.get('limit') || 36);
      try {
        const items = await fetchJustWatchCatalog({ type, query: q, genres, lang, country, first });
        return sendJson(req, res, 200, { ok: true, items });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/media/recommendations') {
      const genres = (reqUrl.searchParams.get('genres') || '').split(',').map((g) => g.trim()).filter(Boolean);
      const excludeRaw = (reqUrl.searchParams.get('exclude') || '').split('|').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const excludeSet = new Set(excludeRaw);
      const lang = reqUrl.searchParams.get('lang') || 'pt';
      const country = reqUrl.searchParams.get('country') || 'BR';
      try {
        const items = await fetchJustWatchCatalog({ type: 'ALL', genres, lang, country, first: 32 });
        const filtered = items.filter((it) => !excludeSet.has(it.title.toLowerCase()) && !excludeSet.has((it.originalTitle || '').toLowerCase()));
        return sendJson(req, res, 200, { ok: true, items: filtered.slice(0, 24) });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/live/globonews.m3u8') {
      ensureGloboTransmuxer();
      const m3u8Path = path.join(GLOBO_DIR, 'live.m3u8');
      for (let i = 0; i < 25; i++) {
        if (fs.existsSync(m3u8Path) && fs.statSync(m3u8Path).size > 40) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!fs.existsSync(m3u8Path)) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Transmuxer warming up');
      }
      const raw = fs.readFileSync(m3u8Path, 'utf8');
      const rewritten = raw.replace(/(live\d+\.ts)/g, '/api/live/globonews/$1');
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });
      return res.end(rewritten);
    }

    if (pathname.startsWith('/api/live/globonews/')) {
      ensureGloboTransmuxer();
      const segName = path.basename(pathname);
      const segPath = path.join(GLOBO_DIR, segName);
      if (!fs.existsSync(segPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Segment not found');
      }
      const stat = fs.statSync(segPath);
      res.writeHead(200, {
        'Content-Type': 'video/mp2t',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
        'Accept-Ranges': 'bytes'
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(segPath, { highWaterMark: 16 * 1024 }).pipe(res);
    }

    if (pathname === '/api/browser-proxy') {
      const target = reqUrl.searchParams.get('url');
      if (!target) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Missing url');
      }
      let parsedTarget;
      try {
        parsedTarget = new URL(target);
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Invalid URL');
      }

      const isHttps = parsedTarget.protocol === 'https:';
      const client = isHttps ? https : http;
      const proxyReq = client.get(
        parsedTarget,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          timeout: 15000
        },
        (proxyRes) => {
          const status = proxyRes.statusCode || 200;
          if ([301, 302, 303, 307, 308].includes(status) && proxyRes.headers.location) {
            const redirectUrl = new URL(proxyRes.headers.location, parsedTarget).toString();
            res.writeHead(302, { Location: `/api/browser-proxy?url=${encodeURIComponent(redirectUrl)}` });
            proxyRes.resume();
            return res.end();
          }

          const outHeaders = { ...proxyRes.headers };
          delete outHeaders['x-frame-options'];
          delete outHeaders['content-security-policy'];
          delete outHeaders['content-security-policy-report-only'];
          delete outHeaders['x-content-type-options'];
          outHeaders['Access-Control-Allow-Origin'] = '*';

          const ctype = (outHeaders['content-type'] || '').toLowerCase();
          if (ctype.includes('text/html')) {
            const chunks = [];
            proxyRes.on('data', (c) => chunks.push(c));
            proxyRes.on('end', () => {
              let html = Buffer.concat(chunks).toString('utf8');
              const baseTag = `<base href="${parsedTarget.origin}${parsedTarget.pathname}">`;
              if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${baseTag}`);
              } else if (html.includes('<head ')) {
                html = html.replace(/<head[^>]*>/, `$&${baseTag}`);
              } else {
                html = `${baseTag}${html}`;
              }
              delete outHeaders['content-length'];
              delete outHeaders['content-encoding'];
              res.writeHead(status, outHeaders);
              res.end(html);
            });
            return;
          }

          res.writeHead(status, outHeaders);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Erro ao carregar página: ${err.message}`);
        }
      });
      return;
    }

    if (pathname === '/api/stream-proxy' || pathname.startsWith('/api/stream-proxy/')) {
      const target = reqUrl.searchParams.get('url');
      if (!target) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Missing url');
      }
      return handleStreamProxy(target, req, res);
    }

    if (pathname === '/api/media-player/music-info') {
      const title = reqUrl.searchParams.get('title') || '';
      const artist = reqUrl.searchParams.get('artist') || '';
      const duration = Number(reqUrl.searchParams.get('duration') || 0);
      const raw = reqUrl.searchParams.get('raw') || '';
      try {
        const result = await fetchMusicInfoAndLyrics({ title, artist, duration, raw });
        return sendJson(req, res, 200, result);
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/dvr/list') {
      const recDir = path.join(__dirname, 'recordings');
      try { fs.mkdirSync(recDir, { recursive: true }); } catch (_) {}
      const metaPath = path.join(recDir, 'recordings.json');
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) {}
      const active = [];
      for (const rec of activeRecordings.values()) {
        active.push({
          id: rec.id,
          channelNum: rec.channelNum,
          channelName: rec.channelName,
          program: rec.program,
          fileName: rec.fileName,
          startedAt: rec.startedAt
        });
      }
      const files = fs.readdirSync(recDir).filter((f) => /\.(mp4|ts)$/i.test(f));
      const activeFiles = new Set(active.map((a) => a.fileName));
      const recordings = files
        .filter((f) => !activeFiles.has(f))
        .map((f) => {
          const st = fs.statSync(path.join(recDir, f));
          const info = meta[f] || {};
          return {
            fileName: f,
            channelNum: info.channelNum || '',
            channelName: info.channelName || 'TV ao Vivo',
            program: info.program || f.replace(/\.(mp4|ts)$/i, ''),
            startedAt: info.startedAt || st.birthtimeMs || st.mtimeMs,
            size: st.size,
            url: `/recordings/${encodeURIComponent(f)}`
          };
        })
        .filter((r) => r.size > 1024)
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      return sendJson(req, res, 200, { ok: true, active, recordings });
    }

    if (pathname === '/api/epg') {
      const channel = reqUrl.searchParams.get('channel') || 'TV Cultura';
      const days = Math.min(7, Math.max(1, Number(reqUrl.searchParams.get('days') || 5)));
      try {
        const result = await fetchChannelEpg(channel, days);
        return sendJson(req, res, 200, result);
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/dvr/schedules') {
      return sendJson(req, res, 200, { ok: true, schedules: loadSchedules() });
    }

    if (req.method === 'POST' && pathname === '/api/dvr/schedule') {
      try {
        const body = await readJsonBody(req);
        const streamUrl = String(body.streamUrl || '').trim();
        if (!/^https?:\/\//i.test(streamUrl)) return sendJson(req, res, 400, { ok: false, error: 'URL inválida' });
        const list = loadSchedules();
        const entry = {
          id: `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          mode: ['once', 'daily', 'weekdays'].includes(body.mode) ? body.mode : 'once',
          channelNum: String(body.channelNum || ''),
          channelName: String(body.channelName || 'TV ao Vivo'),
          program: String(body.program || 'Programa agendado'),
          streamUrl,
          time: String(body.time || '00:00'),
          startTs: Number(body.startTs || 0),
          durationMin: Math.max(5, Number(body.durationMin || 60)),
          days: Array.isArray(body.days) ? body.days.map(Number) : [],
          triggered: false,
          lastTriggeredDate: ''
        };
        list.push(entry);
        saveSchedules(list);
        return sendJson(req, res, 200, { ok: true, schedule: entry });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && pathname === '/api/dvr/schedule/delete') {
      try {
        const body = await readJsonBody(req);
        const list = loadSchedules().filter((s) => s.id !== String(body.id || ''));
        saveSchedules(list);
        return sendJson(req, res, 200, { ok: true });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && pathname === '/api/dvr/start') {
      try {
        const body = await readJsonBody(req);
        const streamUrl = String(body.streamUrl || '').trim();
        if (!/^https?:\/\//i.test(streamUrl)) return sendJson(req, res, 400, { ok: false, error: 'URL inválida' });
        const recObj = startFfmpegRecording({
          streamUrl,
          channelNum: body.channelNum,
          channelName: body.channelName,
          program: body.program,
          autoStopMin: Number(body.durationMin || 0)
        });
        return sendJson(req, res, 200, { ok: true, id: recObj.id, fileName: recObj.fileName, startedAt: recObj.startedAt });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && pathname === '/api/dvr/stop') {
      try {
        const body = await readJsonBody(req);
        const targetIds = body.id ? [String(body.id)] : Array.from(activeRecordings.keys());
        const stopped = [];
        for (const id of targetIds) {
          const item = await stopFfmpegRecording(id);
          if (item) stopped.push(item);
        }
        return sendJson(req, res, 200, { ok: true, stopped });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && pathname === '/api/dvr/delete') {
      try {
        const body = await readJsonBody(req);
        const base = path.basename(String(body.fileName || ''));
        if (!base) return sendJson(req, res, 400, { ok: false, error: 'Missing fileName' });
        const filePath = path.join(__dirname, 'recordings', base);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return sendJson(req, res, 200, { ok: true });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname.startsWith('/api/usb/')) {
      return handleUsbExplorerApi(req, res, reqUrl, pathname);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('405 Method Not Allowed');
    }

    if (pathname.startsWith('/recordings/')) {
      const base = path.basename(pathname.slice('/recordings/'.length));
      const filePath = path.join(__dirname, 'recordings', base);
      return fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Not found');
        }
        const total = stat.size;
        const mime = base.endsWith('.ts') ? 'video/mp2t' : 'video/mp4';
        const range = req.headers.range;
        if (range) {
          const m = /^bytes=(\d+)-(\d*)$/.exec(range);
          if (m) {
            const start = Number(m[1]);
            const end = m[2] ? Math.min(total - 1, Number(m[2])) : total - 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': end - start + 1,
              'Content-Type': mime
            });
            return fs.createReadStream(filePath, { start, end, highWaterMark: 16 * 1024 }).pipe(res);
          }
        }
        res.writeHead(200, {
          'Content-Length': total,
          'Accept-Ranges': 'bytes',
          'Content-Type': mime
        });
        return fs.createReadStream(filePath, { highWaterMark: 16 * 1024 }).pipe(res);
      });
    }

    if (pathname === '/api/news') {
      const scope = reqUrl.searchParams.get('scope') || 'all';
      const category = reqUrl.searchParams.get('category') || 'all';
      const q = reqUrl.searchParams.get('q') || '';
      const forceRefresh = reqUrl.searchParams.get('refresh') === '1';
      try {
        const result = await fetchRealNews({ scope, category, q, forceRefresh });
        return sendJson(req, res, 200, result);
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/captions/stream') {
      const session = String(reqUrl.searchParams.get('session') || '').slice(0, 64);
      if (!session) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Missing session');
      }

      captionActiveSession = session;
      enqueueCaptionJob(session, { cmd: 'reset', session });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const client = { session, res };
      captionClients.add(client);
      ensureCaptionWorker();

      res.write(`data: ${JSON.stringify(
        captionWorkerReady
          ? { status: 'ready', session, text: 'Legendas sincronizadas prontas' }
          : { status: 'loading', session, text: 'Carregando modelo Whisper...' }
      )}\n\n`);

      req.on('close', () => {
        captionClients.delete(client);
        if (captionActiveSession === session) {
          enqueueCaptionJob(session, { cmd: 'reset', session });
        }
      });
      return;
    }

    if (pathname === '/api/wallpapers') {
      try {
        const manifestPath = path.join(ROOT_DIR, 'media', 'wallpapers', 'manifest.json');
        let wallpapers = [];
        if (fs.existsSync(manifestPath)) {
          wallpapers = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }
        return sendJson(req, res, 200, { ok: true, wallpapers });
      } catch (err) {
        return sendJson(req, res, 500, { ok: false, error: err.message });
      }
    }

    if (pathname === '/vendor/hls.min.js') {
      return fs.stat(HLS_BUNDLE_PATH, (err, stat) => {
        if (err || !stat.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('hls.min.js not found');
        }
        getAssetEntry(HLS_BUNDLE_PATH, '.js', stat).then((entry) => {
          const headers = {
            'Content-Type': MIME_TYPES['.js'],
            'Cache-Control': 'public, max-age=604800, immutable',
            ETag: entry.etag
          };
          let body = entry.raw;
          const accept = req.headers['accept-encoding'] || '';
          if (entry.br && accept.includes('br')) {
            body = entry.br;
            headers['Content-Encoding'] = 'br';
            headers.Vary = 'Accept-Encoding';
          } else if (entry.gz && accept.includes('gzip')) {
            body = entry.gz;
            headers['Content-Encoding'] = 'gzip';
            headers.Vary = 'Accept-Encoding';
          }
          headers['Content-Length'] = body.length;
          res.writeHead(200, headers);
          if (req.method === 'HEAD') return res.end();
          res.end(body);
        });
      });
    }

    if (pathname === '/') pathname = '/index.html';

    const resolvedPath = path.resolve(ROOT_DIR, `.${pathname}`);
    if (!resolvedPath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden');
    }

    const allowedFiles = new Set(['index.html', 'styles.css', 'app.js', 'app-store.js', 'app-native.js', 'app-games.js', 'app-player.js', 'logo.svg', 'default-theme.json', 'webos/webos-bridge.js', 'NOTICIA_MIGRACAO_WPE_WEBKIT_E_REQUISITOS.md']);
    const relPath = path.relative(ROOT_DIR, resolvedPath).replace(/\\/g, '/');
    const isSiteAsset = /^site\/[a-z0-9_.\/-]+\.(html|css|js|svg|png|jpg|webp)$/i.test(relPath);
    const isMediaAsset = /^(icons|media|sounds)\/[a-z0-9_.\/-]+\.(jpg|jpeg|png|mp3|svg|webp|json)$/i.test(relPath);
    if (!allowedFiles.has(relPath) && !isMediaAsset && !isSiteAsset) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    fs.stat(resolvedPath, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      getAssetEntry(resolvedPath, ext, stat)
        .then((entry) => {
          const cacheHeader = isMediaAsset
            ? 'public, max-age=604800, immutable'
            : 'no-store';

          if (req.headers['if-none-match'] === entry.etag) {
            res.writeHead(304, { ETag: entry.etag, 'Cache-Control': cacheHeader });
            return res.end();
          }

          const headers = {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': cacheHeader,
            ETag: entry.etag
          };

          let body = entry.raw;
          const accept = req.headers['accept-encoding'] || '';
          if (entry.br && accept.includes('br')) {
            body = entry.br;
            headers['Content-Encoding'] = 'br';
            headers.Vary = 'Accept-Encoding';
          } else if (entry.gz && accept.includes('gzip')) {
            body = entry.gz;
            headers['Content-Encoding'] = 'gzip';
            headers.Vary = 'Accept-Encoding';
          }

          headers['Content-Length'] = body.length;
          res.writeHead(200, headers);
          if (req.method === 'HEAD') return res.end();
          res.end(body);
        })
        .catch(() => {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('500 Internal Server Error');
        });
    });
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  return server;
}

function prewarmCoreAssets() {
  return Promise.all(
    ['index.html', 'styles.css', 'app.js', 'app-store.js', 'app-native.js', 'app-games.js', 'app-player.js', 'logo.svg'].map(async (name) => {
      const fp = path.join(ROOT_DIR, name);
      const stat = await fs.promises.stat(fp);
      return getAssetEntry(fp, path.extname(name), stat);
    })
  ).catch(() => {});
}

function prewarmMediaCatalog() {
  Promise.all([
    fetchJustWatchCatalog({ type: 'ALL', lang: 'pt', country: 'BR', first: 36 }),
    fetchJustWatchCatalog({ type: 'SHOW', lang: 'pt', country: 'BR', first: 36 }),
    fetchJustWatchCatalog({ type: 'MOVIE', lang: 'pt', country: 'BR', first: 36 })
  ]).catch(() => {});
}

/* =========================================================
   Real-Time National & International News RSS Aggregator
   ========================================================= */
const NEWS_FEEDS = [
  { id: 'g1-br', source: 'G1 Brasil', scope: 'br', category: 'general', url: 'https://g1.globo.com/rss/g1/' },
  { id: 'g1-eco', source: 'G1 Economia', scope: 'br', category: 'economy', url: 'https://g1.globo.com/rss/g1/economia/' },
  { id: 'g1-tech', source: 'G1 Tecnologia', scope: 'br', category: 'tech', url: 'https://g1.globo.com/rss/g1/tecnologia/' },
  { id: 'uol-br', source: 'UOL Notícias', scope: 'br', category: 'general', url: 'https://rss.uol.com.br/feed/noticias.xml' },
  { id: 'agencia-br', source: 'Agência Brasil', scope: 'br', category: 'general', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' },
  { id: 'bbc-world', source: 'BBC News', scope: 'intl', category: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'bbc-tech', source: 'BBC Tech', scope: 'intl', category: 'tech', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'npr-world', source: 'NPR World', scope: 'intl', category: 'world', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'aljazeera', source: 'Al Jazeera', scope: 'intl', category: 'world', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'nyt-world', source: 'NY Times World', scope: 'intl', category: 'world', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' }
];

let newsCache = { ts: 0, items: [] };
const newsTranslateCache = new Map();
const NEWS_CACHE_TTL_MS = 180000;

const HTML_NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã', auml: 'ä', Auml: 'Ä',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', Ecirc: 'Ê', euml: 'ë', Euml: 'Ë',
  iacute: 'í', Iacute: 'Í', igrave: 'ì', Igrave: 'Ì', icirc: 'î', Icirc: 'Î', iuml: 'ï', Iuml: 'Ï',
  oacute: 'ó', Oacute: 'Ó', ograve: 'ò', Ograve: 'Ò', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ', ouml: 'ö', Ouml: 'Ö',
  uacute: 'ú', Uacute: 'Ú', ugrave: 'ù', Ugrave: 'Ù', ucirc: 'û', Ucirc: 'Û', uuml: 'ü', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
  ordm: 'º', ordf: 'ª', deg: '°', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…'
};

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&([a-z]+);/gi, (full, name) => HTML_NAMED_ENTITIES[name] ?? HTML_NAMED_ENTITIES[name.toLowerCase()] ?? full)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .trim();
}

function decodeFeedBuffer(buf, contentType = '') {
  const ctMatch = String(contentType || '').match(/charset=([^\s;]+)/i);
  const headAscii = buf.subarray(0, 256).toString('latin1');
  const xmlMatch = headAscii.match(/encoding=["']([^"']+)["']/i);
  const declared = (ctMatch?.[1] || xmlMatch?.[1] || '').toLowerCase();

  if (declared.includes('iso-8859') || declared.includes('latin1') || declared.includes('1252')) {
    return new TextDecoder('windows-1252').decode(buf);
  }
  const asUtf8 = buf.toString('utf8');
  if (asUtf8.includes('\uFFFD')) {
    return new TextDecoder('windows-1252').decode(buf);
  }
  return asUtf8;
}

async function translateStringsToPt(strings) {
  const unique = [...new Set(strings.map((s) => String(s || '').trim()).filter((s) => s && !newsTranslateCache.has(s)))];
  if (!unique.length) return;

  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const s of unique) {
    if (cur.length >= 16 || curLen + s.length > 2600) {
      chunks.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(s);
    curLen += s.length + 10;
  }
  if (cur.length) chunks.push(cur);

  await Promise.allSettled(
    chunks.map(async (chunk) => {
      const joined = chunk.join('\n@@\n');
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(joined)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) return;
      const data = await res.json();
      const translatedFull = Array.isArray(data?.[0]) ? data[0].map((seg) => seg?.[0] || '').join('') : '';
      const parts = translatedFull.split(/\s*@@\s*/);
      if (parts.length === chunk.length) {
        chunk.forEach((orig, i) => {
          const val = String(parts[i] || '').trim();
          if (val) newsTranslateCache.set(orig, val);
        });
      }
    })
  );

  if (newsTranslateCache.size > 1000) {
    const keys = [...newsTranslateCache.keys()].slice(0, 300);
    keys.forEach((k) => newsTranslateCache.delete(k));
  }
}

async function translateNewsItemsToPt(items) {
  const intl = items.filter((it) => it.scope === 'intl');
  if (!intl.length) return;
  const toTranslate = [];
  intl.forEach((it) => {
    if (it.title) toTranslate.push(it.title);
    if (it.summary) toTranslate.push(it.summary);
  });
  await translateStringsToPt(toTranslate);
  intl.forEach((it) => {
    if (it.title && newsTranslateCache.has(it.title)) {
      it.originalTitle = it.title;
      it.title = newsTranslateCache.get(it.title);
    }
    if (it.summary && newsTranslateCache.has(it.summary)) {
      it.summary = newsTranslateCache.get(it.summary);
    }
  });
}

function stripHtmlTags(html) {
  return decodeXmlEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlTag(block, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

function parseNewsRssXml(xmlText, feedMeta) {
  const text = String(xmlText || '');
  const items = [];
  const blocks = [...text.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)];
  for (const b of blocks.slice(0, 14)) {
    const raw = b[1];
    const title = stripHtmlTags(extractXmlTag(raw, 'title'));
    if (!title) continue;

    let link = stripHtmlTags(extractXmlTag(raw, 'link'));
    if (!link) {
      const atomLink = raw.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (atomLink) link = decodeXmlEntities(atomLink[1]);
    }
    if (!link) continue;

    const rawDesc = extractXmlTag(raw, 'description') || extractXmlTag(raw, 'summary') || extractXmlTag(raw, 'content:encoded') || '';
    let imageUrl = '';
    const mediaM = raw.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i)
      || raw.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)
      || decodeXmlEntities(rawDesc).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (mediaM && /^https?:\/\//i.test(mediaM[1])) imageUrl = decodeXmlEntities(mediaM[1]);

    const pubStr = stripHtmlTags(extractXmlTag(raw, 'pubDate') || extractXmlTag(raw, 'published') || extractXmlTag(raw, 'updated') || extractXmlTag(raw, 'dc:date'));
    const ts = pubStr ? Date.parse(pubStr) || Date.now() : Date.now();
    const summary = stripHtmlTags(rawDesc).slice(0, 260);

    items.push({
      id: `${feedMeta.id}-${Buffer.from(link).toString('base64').slice(0, 18)}`,
      title,
      summary,
      link,
      imageUrl,
      source: feedMeta.source,
      scope: feedMeta.scope,
      category: feedMeta.category,
      publishedAt: new Date(ts).toISOString(),
      ts
    });
  }
  return items;
}

async function fetchRealNews({ scope = 'all', category = 'all', q = '', forceRefresh = false } = {}) {
  const now = Date.now();
  if (forceRefresh || !newsCache.items.length || now - newsCache.ts > NEWS_CACHE_TTL_MS) {
    const settled = await Promise.allSettled(
      NEWS_FEEDS.map(async (feed) => {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'irisTV-NewsReader/1.0', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
          signal: AbortSignal.timeout(4800)
        });
        if (!res.ok) return [];
        const buf = Buffer.from(await res.arrayBuffer());
        const xml = decodeFeedBuffer(buf, res.headers.get('content-type') || '');
        return parseNewsRssXml(xml, feed);
      })
    );
    const merged = [];
    const seenTitles = new Set();
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const art of r.value) {
        const norm = art.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (!norm || seenTitles.has(norm)) continue;
        seenTitles.add(norm);
        merged.push(art);
      }
    }
    merged.sort((a, b) => b.ts - a.ts);
    await translateNewsItemsToPt(merged);
    if (merged.length) newsCache = { ts: Date.now(), items: merged };
  }

  let out = newsCache.items;
  if (scope === 'br' || scope === 'intl') out = out.filter((x) => x.scope === scope);
  if (category && category !== 'all') out = out.filter((x) => x.category === category);
  const query = String(q || '').trim().toLowerCase();
  if (query) {
    out = out.filter((x) => x.title.toLowerCase().includes(query) || x.summary.toLowerCase().includes(query) || x.source.toLowerCase().includes(query));
  }
  return { ok: true, updatedAt: newsCache.ts || Date.now(), total: out.length, items: out.slice(0, 60) };
}

function prewarmNewsFeeds() {
  fetchRealNews().catch(() => {});
}

/* =========================================================
   USB Pendrive Explorer & FFmpeg Media Studio (/api/usb/*)
   ========================================================= */
const USB_SYSTEM_HIDDEN = new Set([
  'apks',
  'boot',
  'efi',
  'system volume information',
  '$recycle.bin',
  'found.000',
  'lost+found',
  'iristv.apkovl.tar.gz',
  'fbsplash.ppm',
  'fbsplash0.ppm',
  'fbsplash.cfg',
  'fbsplash0.cfg',
  'irisos-wifi.conf',
  'ldlinux.sys',
  'ldlinux.c32',
  'boot.cat',
  'autorun.inf'
]);

function isUsbSystemHiddenEntry(name) {
  const n = String(name || '').trim();
  if (!n || n.startsWith('.')) return true;
  return USB_SYSTEM_HIDDEN.has(n.toLowerCase());
}

async function resolveUsbRoot(forWrite = false) {
  if (process.platform === 'linux') {
    const candidates = ['/media/usb', '/media/usb_boot'];
    for (const base of ['/media', '/run/media']) {
      try {
        if (fs.existsSync(base)) {
          for (const d of fs.readdirSync(base)) {
            const full = path.join(base, d);
            if (!candidates.includes(full)) candidates.push(full);
          }
        }
      } catch (_) {}
    }
    let chosen = '';
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
          if (fs.existsSync(path.join(c, 'boot')) || fs.existsSync(path.join(c, 'irisTV.apkovl.tar.gz'))) {
            chosen = c;
            break;
          }
          if (!chosen && c !== '/media/cdrom' && c !== '/media/floppy' && fs.readdirSync(c).length > 0) {
            chosen = c;
          }
        }
      } catch (_) {}
    }
    if (!chosen) {
      chosen = path.join(ROOT_DIR, 'usb_drive');
      try { fs.mkdirSync(chosen, { recursive: true }); } catch (_) {}
    } else if (forWrite) {
      await runCmd('sh', ['-c', `mount -o remount,rw "${chosen}" 2>/dev/null || true`], 3000);
    }
    return { rootPath: chosen, label: path.basename(chosen).toUpperCase() || 'IRISOS' };
  }

  // macOS: check /Volumes/IRISOS first, then other external volumes
  if (fs.existsSync('/Volumes/IRISOS')) {
    return { rootPath: '/Volumes/IRISOS', label: 'IRISOS' };
  }
  const ignoreMacVols = new Set(['macintosh hd', 'macintosh hd - dados', 'macintosh hd - data', 'preboot', 'recovery', 'vm', 'update', 'com.apple.timemachine.localsnapshots']);
  try {
    if (fs.existsSync('/Volumes')) {
      for (const v of fs.readdirSync('/Volumes')) {
        if (v.startsWith('.') || ignoreMacVols.has(v.toLowerCase())) continue;
        const full = path.join('/Volumes', v);
        try {
          const st = fs.lstatSync(full);
          if (st.isDirectory() && !st.isSymbolicLink()) {
            return { rootPath: full, label: v };
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  const fallback = path.join(ROOT_DIR, 'usb_drive');
  try { fs.mkdirSync(fallback, { recursive: true }); } catch (_) {}
  return { rootPath: fallback, label: 'PENDRIVE' };
}

function resolveSafeUsbTarget(rootPath, relInput, allowRoot = false) {
  const raw = String(relInput || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = raw.split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) {
    throw new Error('Caminho inválido');
  }
  if (!parts.length) {
    if (!allowRoot) throw new Error('Selecione um arquivo ou pasta válido');
    return { absPath: rootPath, relPath: '', name: '' };
  }
  if (isUsbSystemHiddenEntry(parts[0]) || parts.some((p) => p.startsWith('.'))) {
    throw new Error('Acesso a arquivos do sistema não permitido');
  }
  const absPath = path.resolve(rootPath, ...parts);
  const normRoot = path.resolve(rootPath);
  if (absPath !== normRoot && !absPath.startsWith(normRoot + path.sep)) {
    throw new Error('Caminho fora do pendrive');
  }
  return { absPath, relPath: parts.join('/'), name: parts[parts.length - 1] };
}

function isAudioOnlyMp4File(absPath) {
  if (!absPath) return false;
  try {
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
    fs.closeSync(fd);
    const slice = buf.subarray(0, bytesRead);
    return slice.includes('soun') && !slice.includes('vide');
  } catch (_) {
    return false;
  }
}

function classifyUsbFile(name, isDir, absPath = '') {
  if (isDir) return { kind: 'folder', ext: '' };
  const ext = path.extname(name).toLowerCase().replace(/^\./, '');
  if (['mp3', 'm4a', 'wav', 'flac', 'ogg', 'aac', 'opus', 'wma'].includes(ext)) return { kind: 'audio', ext };
  if (['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'ts', 'flv', 'wmv'].includes(ext)) {
    if ((ext === 'mp4' || ext === 'm4v' || ext === 'mov') && isAudioOnlyMp4File(absPath)) {
      return { kind: 'audio', ext };
    }
    return { kind: 'video', ext };
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return { kind: 'image', ext };
  if (['txt', 'md', 'json', 'srt', 'vtt', 'lrc', 'm3u', 'm3u8', 'pdf'].includes(ext)) return { kind: 'document', ext };
  return { kind: 'other', ext };
}

function getMimeForExt(ext) {
  const map = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', aac: 'audio/aac', opus: 'audio/opus',
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', m4v: 'video/mp4', ts: 'video/mp2t',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp',
    txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8', srt: 'text/plain; charset=utf-8', vtt: 'text/vtt; charset=utf-8', lrc: 'text/plain; charset=utf-8'
  };
  return map[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

function uniqueSiblingPath(dirPath, baseName, extWithDot, tag = '') {
  const cleanExt = extWithDot || '';
  const suffix = tag ? ` ${tag}` : '';
  let candidate = path.join(dirPath, `${baseName}${suffix}${cleanExt}`);
  let idx = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dirPath, `${baseName}${suffix} (${idx})${cleanExt}`);
    idx++;
  }
  return candidate;
}

function copyRecursiveSync(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      if (child.startsWith('.')) continue;
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function buildAtempoFilterChain(speed) {
  let s = Math.max(0.25, Math.min(8.0, Number(speed) || 1.0));
  if (Math.abs(s - 1.0) < 0.01) return '';
  const filters = [];
  while (s > 2.0) {
    filters.push('atempo=2.0');
    s /= 2.0;
  }
  while (s < 0.5) {
    filters.push('atempo=0.5');
    s /= 0.5;
  }
  filters.push(`atempo=${s.toFixed(4)}`);
  return filters.join(',');
}

async function handleUsbExplorerApi(req, res, reqUrl, pathname) {
  try {
    if (pathname === '/api/usb/list' && req.method === 'GET') {
      const { rootPath, label } = await resolveUsbRoot(false);
      const relReq = reqUrl.searchParams.get('path') || '';
      const target = resolveSafeUsbTarget(rootPath, relReq, true);
      if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isDirectory()) {
        return sendJson(req, res, 404, { ok: false, error: 'Pasta não encontrada no pendrive' });
      }
      const rawEntries = fs.readdirSync(target.absPath);
      const items = [];
      for (const name of rawEntries) {
        if (isUsbSystemHiddenEntry(name)) continue;
        const full = path.join(target.absPath, name);
        let st;
        try { st = fs.statSync(full); } catch (_) { continue; }
        const isDir = st.isDirectory();
        const { kind, ext } = classifyUsbFile(name, isDir, full);
        const itemRel = target.relPath ? `${target.relPath}/${name}` : name;
        items.push({
          name,
          relPath: itemRel,
          isDir,
          size: isDir ? 0 : st.size,
          mtimeMs: st.mtimeMs || Date.now(),
          ext,
          kind,
          streamUrl: isDir ? '' : `/api/usb/stream?path=${encodeURIComponent(itemRel)}`
        });
      }
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
      });
      const parentPath = target.relPath.includes('/')
        ? target.relPath.slice(0, target.relPath.lastIndexOf('/'))
        : '';
      return sendJson(req, res, 200, {
        ok: true,
        usbLabel: label,
        currentPath: target.relPath,
        parentPath,
        hasParent: Boolean(target.relPath),
        items
      });
    }

    if (pathname === '/api/usb/stream' && (req.method === 'GET' || req.method === 'HEAD')) {
      const { rootPath } = await resolveUsbRoot(false);
      const relReq = reqUrl.searchParams.get('path') || '';
      const transcodeMode = reqUrl.searchParams.get('transcode') || '';
      const target = resolveSafeUsbTarget(rootPath, relReq, false);
      if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }

      if (transcodeMode === 'wav') {
        const { spawn } = require('child_process');
        const ff = spawn('ffmpeg', ['-v', 'error', '-i', target.absPath, '-f', 'wav', '-acodec', 'pcm_s16le', '-ac', '2', '-ar', '44100', 'pipe:1']);
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        });
        ff.stdout.pipe(res);
        req.on('close', () => ff.kill());
        return;
      }

      const st = fs.statSync(target.absPath);
      const total = st.size;
      const ext = path.extname(target.name).toLowerCase().replace(/^\./, '');
      const mime = (ext === 'mp4' && isAudioOnlyMp4File(target.absPath)) ? 'audio/mp4' : getMimeForExt(ext);
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (m) {
          const start = Number(m[1]);
          const end = m[2] ? Math.min(total - 1, Number(m[2])) : total - 1;
          if (start >= total || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${total}` });
            return res.end();
          }
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*'
          });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(target.absPath, { start, end, highWaterMark: 16 * 1024 }).pipe(res);
        }
      }
      res.writeHead(200, {
        'Content-Length': total,
        'Accept-Ranges': 'bytes',
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*'
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(target.absPath, { highWaterMark: 16 * 1024 }).pipe(res);
    }

    if (pathname === '/api/usb/properties' && req.method === 'GET') {
      const { rootPath, label } = await resolveUsbRoot(false);
      const relReq = reqUrl.searchParams.get('path') || '';
      const target = resolveSafeUsbTarget(rootPath, relReq, false);
      if (!fs.existsSync(target.absPath)) {
        return sendJson(req, res, 404, { ok: false, error: 'Item não encontrado' });
      }
      const st = fs.statSync(target.absPath);
      const isDir = st.isDirectory();
      const { kind, ext } = classifyUsbFile(target.name, isDir, target.absPath);
      let childCount = 0;
      let totalSize = st.size;
      if (isDir) {
        try {
          const entries = fs.readdirSync(target.absPath).filter((n) => !isUsbSystemHiddenEntry(n));
          childCount = entries.length;
          totalSize = 0;
          for (const e of entries) {
            try {
              const s = fs.statSync(path.join(target.absPath, e));
              if (s.isFile()) totalSize += s.size;
            } catch (_) {}
          }
        } catch (_) {}
      }
      let mediaInfo = null;
      if (!isDir && (kind === 'audio' || kind === 'video')) {
        const probe = await runCmd('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          target.absPath
        ], 10000);
        if (probe.ok && probe.stdout) {
          try {
            const p = JSON.parse(probe.stdout);
            const vStream = (p.streams || []).find((s) => s.codec_type === 'video');
            const aStream = (p.streams || []).find((s) => s.codec_type === 'audio');
            mediaInfo = {
              duration: Number(p.format?.duration || vStream?.duration || aStream?.duration || 0),
              bitrate: Number(p.format?.bit_rate || 0),
              width: Number(vStream?.width || 0),
              height: Number(vStream?.height || 0),
              videoCodec: vStream?.codec_name || '',
              audioCodec: aStream?.codec_name || '',
              sampleRate: aStream?.sample_rate ? `${aStream.sample_rate} Hz` : '',
              channels: aStream?.channels || 0
            };
          } catch (_) {}
        }
      }
      return sendJson(req, res, 200, {
        ok: true,
        name: target.name,
        relPath: target.relPath,
        usbLabel: label,
        isDir,
        kind,
        ext: ext ? `.${ext}` : (isDir ? 'Pasta de arquivos' : 'Arquivo'),
        size: totalSize,
        childCount,
        createdMs: st.birthtimeMs || st.ctimeMs || st.mtimeMs,
        mtimeMs: st.mtimeMs,
        mediaInfo
      });
    }

    if (req.method === 'POST') {
      const { rootPath } = await resolveUsbRoot(true);
      const body = await readJsonBody(req);

      if (pathname === '/api/usb/mkdir') {
        const parent = resolveSafeUsbTarget(rootPath, body.path || body.parentPath || '', true);
        const cleanName = String(body.name || '').trim().replace(/[\\/:*?"<>|]/g, '');
        if (!cleanName || isUsbSystemHiddenEntry(cleanName)) {
          return sendJson(req, res, 400, { ok: false, error: 'Nome de pasta inválido' });
        }
        const dest = path.join(parent.absPath, cleanName);
        if (fs.existsSync(dest)) {
          return sendJson(req, res, 400, { ok: false, error: 'Já existe um item com esse nome' });
        }
        fs.mkdirSync(dest, { recursive: true });
        return sendJson(req, res, 200, { ok: true, name: cleanName });
      }

      if (pathname === '/api/usb/rename') {
        const target = resolveSafeUsbTarget(rootPath, body.path, false);
        let cleanNew = String(body.newName || '').trim().replace(/[\\/:*?"<>|]/g, '');
        if (!cleanNew || isUsbSystemHiddenEntry(cleanNew)) {
          return sendJson(req, res, 400, { ok: false, error: 'Novo nome inválido' });
        }
        if (!fs.existsSync(target.absPath)) {
          return sendJson(req, res, 404, { ok: false, error: 'Arquivo não encontrado' });
        }
        const isDir = fs.statSync(target.absPath).isDirectory();
        if (!isDir) {
          const origExt = path.extname(target.name);
          if (origExt && !cleanNew.toLowerCase().endsWith(origExt.toLowerCase()) && !path.extname(cleanNew)) {
            cleanNew += origExt;
          }
        }
        const dest = path.join(path.dirname(target.absPath), cleanNew);
        if (dest !== target.absPath && fs.existsSync(dest)) {
          return sendJson(req, res, 400, { ok: false, error: 'Já existe um arquivo com esse nome' });
        }
        fs.renameSync(target.absPath, dest);
        return sendJson(req, res, 200, { ok: true, name: cleanNew, newName: cleanNew });
      }

      if (pathname === '/api/usb/duplicate') {
        const target = resolveSafeUsbTarget(rootPath, body.path, false);
        if (!fs.existsSync(target.absPath)) {
          return sendJson(req, res, 404, { ok: false, error: 'Arquivo não encontrado' });
        }
        const st = fs.statSync(target.absPath);
        const dir = path.dirname(target.absPath);
        const ext = st.isDirectory() ? '' : path.extname(target.name);
        const base = st.isDirectory() ? target.name : target.name.slice(0, target.name.length - ext.length);
        const copyDest = uniqueSiblingPath(dir, base, ext, '(Cópia)');
        copyRecursiveSync(target.absPath, copyDest);
        return sendJson(req, res, 200, { ok: true, name: path.basename(copyDest), createdName: path.basename(copyDest) });
      }

      if (pathname === '/api/usb/paste') {
        const src = resolveSafeUsbTarget(rootPath, body.sourcePath, false);
        const dstDir = resolveSafeUsbTarget(rootPath, body.targetDir || '', true);
        const mode = body.mode === 'cut' ? 'cut' : 'copy';
        if (!fs.existsSync(src.absPath)) {
          return sendJson(req, res, 404, { ok: false, error: 'Arquivo de origem não existe mais' });
        }
        const st = fs.statSync(src.absPath);
        const ext = st.isDirectory() ? '' : path.extname(src.name);
        const base = st.isDirectory() ? src.name : src.name.slice(0, src.name.length - ext.length);
        let finalDest = path.join(dstDir.absPath, src.name);
        if (st.isDirectory() && (finalDest === src.absPath || finalDest.startsWith(src.absPath + path.sep))) {
          return sendJson(req, res, 400, { ok: false, error: 'Não é possível colar uma pasta dentro dela mesma' });
        }
        if (fs.existsSync(finalDest)) {
          if (mode === 'cut' && finalDest === src.absPath) {
            return sendJson(req, res, 200, { ok: true, name: src.name, createdName: src.name });
          }
          finalDest = uniqueSiblingPath(dstDir.absPath, base, ext, '(Cópia)');
        }
        if (mode === 'cut') {
          try {
            fs.renameSync(src.absPath, finalDest);
          } catch (_) {
            copyRecursiveSync(src.absPath, finalDest);
            fs.rmSync(src.absPath, { recursive: true, force: true });
          }
        } else {
          copyRecursiveSync(src.absPath, finalDest);
        }
        return sendJson(req, res, 200, { ok: true, name: path.basename(finalDest), createdName: path.basename(finalDest) });
      }

      if (pathname === '/api/usb/delete') {
        const target = resolveSafeUsbTarget(rootPath, body.path, false);
        if (!fs.existsSync(target.absPath)) {
          return sendJson(req, res, 404, { ok: false, error: 'Item já foi removido' });
        }
        fs.rmSync(target.absPath, { recursive: true, force: true });
        return sendJson(req, res, 200, { ok: true });
      }

      if (pathname === '/api/usb/convert') {
        const target = resolveSafeUsbTarget(rootPath, body.path, false);
        if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isFile()) {
          return sendJson(req, res, 404, { ok: false, error: 'Arquivo de mídia não encontrado' });
        }
        const targetExt = String(body.targetExt || body.targetFormat || '').toLowerCase().replace(/^\./, '');
        const allowedAudio = ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac'];
        const allowedVideo = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
        if (!allowedAudio.includes(targetExt) && !allowedVideo.includes(targetExt)) {
          return sendJson(req, res, 400, { ok: false, error: 'Formato de conversão não suportado' });
        }
        const dir = path.dirname(target.absPath);
        const origExt = path.extname(target.name);
        const base = target.name.slice(0, target.name.length - origExt.length);
        const outPath = uniqueSiblingPath(dir, base, `.${targetExt}`, '');

        let codecArgs = [];
        if (targetExt === 'mp3') codecArgs = ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'];
        else if (targetExt === 'ogg') codecArgs = ['-vn', '-c:a', 'libvorbis', '-q:a', '4'];
        else if (targetExt === 'wav') codecArgs = ['-vn', '-c:a', 'pcm_s16le'];
        else if (targetExt === 'flac') codecArgs = ['-vn', '-c:a', 'flac'];
        else if (targetExt === 'm4a' || targetExt === 'aac') codecArgs = ['-vn', '-c:a', 'aac', '-b:a', '192k'];
        else if (targetExt === 'mp4' || targetExt === 'mov') codecArgs = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'];
        else if (targetExt === 'mkv') codecArgs = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac'];
        else if (targetExt === 'webm') codecArgs = ['-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis'];
        else if (targetExt === 'avi') codecArgs = ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame'];

        let ffRes = await runCmd('ffmpeg', ['-y', '-loglevel', 'error', '-i', target.absPath, ...codecArgs, outPath], 180000);
        if (!ffRes.ok && targetExt === 'ogg') {
          ffRes = await runCmd('ffmpeg', ['-y', '-loglevel', 'error', '-i', target.absPath, '-vn', '-c:a', 'libopus', outPath], 180000);
        }
        if (!ffRes.ok) {
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
          return sendJson(req, res, 500, { ok: false, error: ffRes.stderr || 'Falha ao converter arquivo no FFmpeg' });
        }
        return sendJson(req, res, 200, { ok: true, name: path.basename(outPath), outputName: path.basename(outPath) });
      }

      if (pathname === '/api/usb/video-transform') {
        const target = resolveSafeUsbTarget(rootPath, body.path, false);
        if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isFile()) {
          return sendJson(req, res, 404, { ok: false, error: 'Vídeo não encontrado' });
        }
        const action = String(body.action || '');
        const dir = path.dirname(target.absPath);
        const origExt = path.extname(target.name) || '.mp4';
        const base = target.name.slice(0, target.name.length - origExt.length);

        if (action === 'extract-audio') {
          const rawAudioFmt = String(body.targetExt || body.audioFormat || '').toLowerCase().replace(/^\./, '');
          const audioExt = ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(rawAudioFmt) ? rawAudioFmt : 'mp3';
          const outPath = uniqueSiblingPath(dir, `${base}_audio`, `.${audioExt}`, '');
          let aArgs = ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'];
          if (audioExt === 'm4a') aArgs = ['-vn', '-c:a', 'aac', '-b:a', '192k'];
          else if (audioExt === 'wav') aArgs = ['-vn', '-c:a', 'pcm_s16le'];
          else if (audioExt === 'ogg') aArgs = ['-vn', '-c:a', 'libvorbis', '-q:a', '4'];
          else if (audioExt === 'flac') aArgs = ['-vn', '-c:a', 'flac'];
          const ffRes = await runCmd('ffmpeg', ['-y', '-loglevel', 'error', '-i', target.absPath, ...aArgs, outPath], 180000);
          if (!ffRes.ok) {
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
            return sendJson(req, res, 500, { ok: false, error: ffRes.stderr || 'Não foi possível extrair o áudio deste vídeo' });
          }
          return sendJson(req, res, 200, { ok: true, name: path.basename(outPath), outputName: path.basename(outPath) });
        }

        if (action === 'rotate') {
          const mode = String(body.mode || body.rotation || 'cw90');
          const filterMap = {
            cw90: 'transpose=1',
            '90cw': 'transpose=1',
            ccw90: 'transpose=2',
            '90ccw': 'transpose=2',
            '180': 'transpose=2,transpose=2',
            hflip: 'hflip',
            vflip: 'vflip'
          };
          const vf = filterMap[mode] || 'transpose=1';
          const outPath = uniqueSiblingPath(dir, `${base}_girado`, origExt, '');
          const ffRes = await runCmd('ffmpeg', [
            '-y', '-loglevel', 'error',
            '-i', target.absPath,
            '-vf', vf,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            outPath
          ], 180000);
          if (!ffRes.ok) {
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
            return sendJson(req, res, 500, { ok: false, error: ffRes.stderr || 'Falha ao girar vídeo' });
          }
          return sendJson(req, res, 200, { ok: true, name: path.basename(outPath), outputName: path.basename(outPath) });
        }

        if (action === 'crop') {
          const x = Math.max(0, Math.min(0.9, Number(body.xPct ?? body.cropX ?? 10) / 100));
          const y = Math.max(0, Math.min(0.9, Number(body.yPct ?? body.cropY ?? 10) / 100));
          const w = Math.max(0.1, Math.min(1 - x, Number(body.wPct ?? body.cropW ?? 80) / 100));
          const h = Math.max(0.1, Math.min(1 - y, Number(body.hPct ?? body.cropH ?? 80) / 100));
          const vf = `crop=max(32\\,trunc(iw*${w.toFixed(4)}/2)*2):max(32\\,trunc(ih*${h.toFixed(4)}/2)*2):trunc(iw*${x.toFixed(4)}/2)*2:trunc(ih*${y.toFixed(4)}/2)*2`;
          const outPath = uniqueSiblingPath(dir, `${base}_recortado`, origExt, '');
          const ffRes = await runCmd('ffmpeg', [
            '-y', '-loglevel', 'error',
            '-i', target.absPath,
            '-vf', vf,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            outPath
          ], 180000);
          if (!ffRes.ok) {
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
            return sendJson(req, res, 500, { ok: false, error: ffRes.stderr || 'Falha ao recortar tela do vídeo' });
          }
          return sendJson(req, res, 200, { ok: true, name: path.basename(outPath), outputName: path.basename(outPath) });
        }

        if (action === 'edit') {
          const startSec = Math.max(0, Number(body.startSec ?? body.trimStart) || 0);
          const endSec = Math.max(startSec + 0.2, Number(body.endSec ?? body.trimEnd) || 0);
          const speed = Math.max(0.25, Math.min(4.0, Number(body.speed) || 1.0));
          const rawSegStart = body.segStartSec ?? body.segStart;
          const rawSegEnd = body.segEndSec ?? body.segEnd;
          const segStart = rawSegStart !== undefined ? Math.max(startSec, Number(rawSegStart)) : startSec;
          const segEnd = rawSegEnd !== undefined ? Math.min(endSec, Number(rawSegEnd)) : endSec;
          const outPath = uniqueSiblingPath(dir, `${base}_editado`, '.mp4', '');

          // Check if video has an audio stream
          const probe = await runCmd('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', target.absPath], 8000);
          let hasAudio = false;
          try {
            hasAudio = JSON.parse(probe.stdout || '{}').streams?.some((s) => s.codec_type === 'audio') || false;
          } catch (_) {}

          const isPartialSpeed = Math.abs(speed - 1.0) >= 0.05 && (segStart > startSec + 0.25 || segEnd < endSec - 0.25) && segEnd > segStart + 0.2;
          let ffArgs = [];

          if (isPartialSpeed) {
            // 3-part filter_complex: [startSec..segStart] at 1x + [segStart..segEnd] at speed + [segEnd..endSec] at 1x
            const vParts = [];
            const aParts = [];
            let idx = 0;
            if (segStart > startSec + 0.15) {
              vParts.push(`[0:v]trim=start=${startSec.toFixed(2)}:end=${segStart.toFixed(2)},setpts=PTS-STARTPTS[v${idx}]`);
              if (hasAudio) aParts.push(`[0:a]atrim=start=${startSec.toFixed(2)}:end=${segStart.toFixed(2)},asetpts=PTS-STARTPTS[a${idx}]`);
              idx++;
            }
            const ptsMult = (1 / speed).toFixed(4);
            const atempo = buildAtempoFilterChain(speed);
            vParts.push(`[0:v]trim=start=${segStart.toFixed(2)}:end=${segEnd.toFixed(2)},setpts=${ptsMult}*(PTS-STARTPTS)[v${idx}]`);
            if (hasAudio) aParts.push(`[0:a]atrim=start=${segStart.toFixed(2)}:end=${segEnd.toFixed(2)},asetpts=PTS-STARTPTS${atempo ? `,${atempo}` : ''}[a${idx}]`);
            idx++;
            if (endSec > segEnd + 0.15) {
              vParts.push(`[0:v]trim=start=${segEnd.toFixed(2)}:end=${endSec.toFixed(2)},setpts=PTS-STARTPTS[v${idx}]`);
              if (hasAudio) aParts.push(`[0:a]atrim=start=${segEnd.toFixed(2)}:end=${endSec.toFixed(2)},asetpts=PTS-STARTPTS[a${idx}]`);
              idx++;
            }
            if (hasAudio) {
              const pairs = Array.from({ length: idx }, (_, i) => `[v${i}][a${i}]`).join('');
              const fc = [...vParts, ...aParts, `${pairs}concat=n=${idx}:v=1:a=1[outv][outa]`].join(';');
              ffArgs = ['-y', '-loglevel', 'error', '-i', target.absPath, '-filter_complex', fc, '-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', outPath];
            } else {
              const vIns = Array.from({ length: idx }, (_, i) => `[v${i}]`).join('');
              const fc = [...vParts, `${vIns}concat=n=${idx}:v=1:a=0[outv]`].join(';');
              ffArgs = ['-y', '-loglevel', 'error', '-i', target.absPath, '-filter_complex', fc, '-map', '[outv]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath];
            }
          } else {
            ffArgs = ['-y', '-loglevel', 'error', '-ss', startSec.toFixed(2), '-to', endSec.toFixed(2), '-i', target.absPath];
            if (Math.abs(speed - 1.0) >= 0.05) {
              const ptsMult = (1 / speed).toFixed(4);
              ffArgs.push('-vf', `setpts=${ptsMult}*PTS`);
              if (hasAudio) {
                const atempo = buildAtempoFilterChain(speed);
                if (atempo) ffArgs.push('-af', atempo);
              }
            }
            ffArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', outPath);
          }

          const ffRes = await runCmd('ffmpeg', ffArgs, 180000);
          if (!ffRes.ok) {
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
            return sendJson(req, res, 500, { ok: false, error: ffRes.stderr || 'Falha ao editar vídeo' });
          }
          return sendJson(req, res, 200, { ok: true, name: path.basename(outPath), outputName: path.basename(outPath) });
        }

        return sendJson(req, res, 400, { ok: false, error: 'Ação de vídeo desconhecida' });
      }
    }

    return sendJson(req, res, 404, { ok: false, error: 'Endpoint USB não encontrado' });
  } catch (err) {
    return sendJson(req, res, 400, { ok: false, error: err.message || 'Erro na operação do pendrive' });
  }
}

function startServer(preferredPort = PORT) {
  const triggerBackgroundPrewarm = () => {
    setTimeout(() => {
      try { startHardwareVolumeKeyWatcher(); } catch {}
      try { prewarmCoreAssets(); } catch {}
      try { prewarmMediaCatalog(); } catch {}
      try { prewarmNewsFeeds(); } catch {}
    }, 250);
  };
  return new Promise((resolve, reject) => {
    const server = createAppServer();
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && preferredPort !== 0) {
        const fallback = createAppServer();
        fallback.listen(0, HOST, () => {
          const addr = fallback.address();
          triggerBackgroundPrewarm();
          resolve({ server: fallback, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
        });
        fallback.once('error', reject);
      } else {
        reject(err);
      }
    });
    server.listen(preferredPort, HOST, () => {
      const addr = server.address();
      triggerBackgroundPrewarm();
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

if (require.main === module) {
  startServer(PORT).then(({ port }) => {
    console.log(`\n  🌈 irisTV Server (real OS + HLS proxy) rodando em: http://localhost:${port}\n`);
  });
}

module.exports = { startServer };

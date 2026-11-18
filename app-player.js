(() => {
  'use strict';

  const STORAGE_KEY = 'iristv_mediaplayer_v1';
  const IDB_NAME = 'iristv_media_blobs_v1';
  const IDB_STORE = 'files';
  const MAX_PERSIST_BYTES = 75 * 1024 * 1024;

  let activeCleanup = null;
  let audioCtx = null;
  const mediaSourceMap = new WeakMap();
  const objectUrlRegistry = new Set();

  /* =========================================================
     Crisp Vector SVG Icons (Zero Emojis)
     ========================================================= */
  const SVG = {
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4c0 .7.8 1.1 1.4.7l10.8-7.2c.5-.3.5-1.1 0-1.4L8.9 4.1c-.6-.4-1.4 0-1.4.7Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 5v14a1 1 0 0 0 2 0v-6.2l9.7 6.1c.7.4 1.6-.1 1.6-.9V6c0-.8-.9-1.3-1.6-.9L7.5 11.2V5a1 1 0 0 0-2 0Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 5v14a1 1 0 0 1-2 0v-6.2l-9.7 6.1C6.1 19.3 5.2 18.8 5.2 18V6c0-.8.9-1.3 1.6-.9l9.7 6.1V5a1 1 0 0 1 2 0Z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 5.8a9 9 0 0 1 0 12.4"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M10 10.5a2.2 2.2 0 1 0 0 3M17 10.5a2.2 2.2 0 1 0 0 3"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    /* Lucide Icons for Explorar & Context Menu */
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    folderOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
    folderPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    hardDrive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>',
    fileAudio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 22h.5a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M2 19a2 2 0 1 1 4 0v1a2 2 0 1 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 1 1-4 0v-1a2 2 0 1 1 4 0"/></svg>',
    fileVideo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 11 5 3-5 3v-6Z"/></svg>',
    fileImage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="10" cy="12" r="2"/><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',
    convert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
    rotateCw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
    crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
    extractAudio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>',
    rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
    duplicate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/><path d="M15 12v6"/><path d="M12 15h6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    scissors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>',
    paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10"/><path d="m17 10 4 4-4 4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    moreVertical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'
  };

  function trackObjUrl(url) {
    if (url && String(url).startsWith('blob:')) objectUrlRegistry.add(url);
    return url;
  }

  function revokeAllObjectUrls() {
    objectUrlRegistry.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) { } });
    objectUrlRegistry.clear();
  }

  /* =========================================================
     IndexedDB Helper for Local File Persistence
     ========================================================= */
  function openMediaDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutBlob(key, blob) {
    if (!blob || blob.size > MAX_PERSIST_BYTES) return false;
    try {
      const db = await openMediaDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, key);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      });
    } catch (_) {
      return false;
    }
  }

  async function idbGetBlob(key) {
    try {
      const db = await openMediaDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  async function idbDeleteBlob(key) {
    try {
      const db = await openMediaDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      });
    } catch (_) {
      return false;
    }
  }

  /* =========================================================
     Parsers: LRC & SRT / VTT Subtitles
     ========================================================= */
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function parseLrc(lrcText) {
    if (!lrcText) return [];
    const lines = String(lrcText).split(/\r?\n/);
    const cues = [];
    const tagRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    for (const raw of lines) {
      const matches = [...raw.matchAll(tagRe)];
      if (!matches.length) continue;
      const text = raw.replace(tagRe, '').trim();
      for (const m of matches) {
        const min = Number(m[1]);
        const sec = Number(m[2]);
        const msRaw = m[3] || '0';
        const frac = msRaw.length === 3 ? Number(msRaw) / 1000 : Number(msRaw) / (msRaw.length === 2 ? 100 : 10);
        cues.push({ time: min * 60 + sec + frac, text: text || '♪' });
      }
    }
    cues.sort((a, b) => a.time - b.time);
    return cues;
  }

  function parseTimestampSec(str) {
    const clean = String(str || '').trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return 0;
  }

  function parseSrtVtt(rawText) {
    const normalized = String(rawText || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^WEBVTT[^\n]*\n+/i, '');

    const blocks = normalized.split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const arrowIdx = lines.findIndex((l) => l.includes('-->'));
      if (arrowIdx === -1) continue;
      const [startStr, endPart] = lines[arrowIdx].split('-->');
      const start = parseTimestampSec(startStr);
      const end = parseTimestampSec(String(endPart || '').trim().split(/\s+/)[0]);
      const text = lines.slice(arrowIdx + 1)
        .join('\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\{\\[^}]+\}/g, '')
        .trim();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start && text) {
        cues.push({ start, end, text });
      }
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  /* =========================================================
     Embedded Audio Metadata & Artwork Extractor (ID3v2 / MP4)
     ========================================================= */
  function decodeBytesText(bytes, encodingByte) {
    if (!bytes || !bytes.length) return '';
    try {
      if (encodingByte === 1) return new TextDecoder('utf-16').decode(bytes).replace(/\0/g, '').trim();
      if (encodingByte === 2) return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim();
      if (encodingByte === 3) return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
      return new TextDecoder('latin1').decode(bytes).replace(/\0/g, '').trim();
    } catch (_) {
      return '';
    }
  }

  function readUint32BE(buf, offset) {
    return ((buf[offset] << 24) >>> 0) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
  }

  function readSyncsafeInt(buf, offset) {
    return ((buf[offset] & 0x7f) << 21) | ((buf[offset + 1] & 0x7f) << 14) | ((buf[offset + 2] & 0x7f) << 7) | (buf[offset + 3] & 0x7f);
  }

  function guessTitleArtistFromFilename(filename) {
    let base = String(filename || 'Faixa').replace(/\.[a-z0-9]{2,5}$/i, '');
    base = base.replace(/_/g, ' ');

    // Strip scraper sites, downloaders, bitrates and format tags
    const domainPattern = /\b[a-z0-9_-]+\.(com|net|org|pm|is|io|me|to|app|co|tv)\b/gi;
    base = base.replace(/\s*[\(\[][^\)\]]*\.(com|net|org|pm|is|io|me|to|app|co|tv)[^\)\]]*[\)\]]/gi, ' ');
    base = base.replace(domainPattern, ' ');
    base = base.replace(/\b\d{2,4}\s*kbps\b/gi, ' ');
    base = base.replace(/\s*[\[\(](official\s*(audio|video|music\s*video|lyric\s*video|clip)?|lyrics?|audio|hd|hq|320\s*kbps|flac|mp3)[\]\)]/gi, ' ');
    base = base.replace(/^\s*\d{1,3}[\s._-]+/, ' ');
    base = base.replace(/\s*[\(\[]\s*[\)\]]/g, ' ');
    base = base.trim().replace(/\s{2,}/g, ' ');

    const dashParts = base.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
      return { artist: dashParts[0], title: dashParts.slice(1).join(' - ') };
    }
    return { artist: '', title: base || 'Faixa' };
  }

  async function getExactAudioDuration(file) {
    if (!file) return 0;
    // 1) Server probe (afinfo/ffprobe read the real container duration)
    try {
      const res = await fetch('/api/media-player/probe-duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
        signal: AbortSignal.timeout(4500)
      });
      const data = await res.json();
      if (data && data.ok && data.duration > 0) return Math.round(data.duration);
    } catch (_) { }
    // 2) Decode PCM in the browser (with strict timeout so a blocked OS audio sink never hangs)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const buf = await file.arrayBuffer();
        const audioBuf = await Promise.race([
          ctx.decodeAudioData(buf),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))
        ]);
        try { ctx.close(); } catch (_) { }
        if (audioBuf && audioBuf.duration > 0) return Math.round(audioBuf.duration);
      }
    } catch (_) { }
    return 0;
  }

  function parseId3v2(u8) {
    if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return null;
    const verMajor = u8[3];
    if (verMajor < 3 || verMajor > 4) return null;
    const limit = Math.min(u8.length, 10 + readSyncsafeInt(u8, 6));
    let pos = 10;
    const out = { title: '', artist: '', album: '', coverBlob: null };

    while (pos + 10 <= limit) {
      const frameId = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      const frameSize = verMajor === 4 ? readSyncsafeInt(u8, pos + 4) : readUint32BE(u8, pos + 4);
      pos += 10;
      if (frameSize <= 0 || pos + frameSize > limit) break;
      const payload = u8.subarray(pos, pos + frameSize);

      if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TALB') {
        const val = decodeBytesText(payload.subarray(1), payload[0]);
        if (frameId === 'TIT2' && val) out.title = val;
        if (frameId === 'TPE1' && val) out.artist = val;
        if (frameId === 'TALB' && val) out.album = val;
      } else if (frameId === 'APIC' && !out.coverBlob && payload.length > 8) {
        const enc = payload[0];
        let p = 1;
        while (p < payload.length && payload[p] !== 0) p++;
        const mime = new TextDecoder('latin1').decode(payload.subarray(1, p)) || 'image/jpeg';
        p += 2;
        if (enc === 1 || enc === 2) {
          while (p + 1 < payload.length && !(payload[p] === 0 && payload[p + 1] === 0)) p += 2;
          p += 2;
        } else {
          while (p < payload.length && payload[p] !== 0) p++;
          p += 1;
        }
        if (p < payload.length) {
          const imgBytes = payload.subarray(p);
          if (imgBytes.length > 64) {
            out.coverBlob = new Blob([imgBytes], { type: mime.includes('png') ? 'image/png' : 'image/jpeg' });
          }
        }
      }
      pos += frameSize;
    }
    return out;
  }

  function parseMp4Tags(u8) {
    if (u8.length < 16 || String.fromCharCode(u8[4], u8[5], u8[6], u8[7]) !== 'ftyp') return null;
    const out = { title: '', artist: '', album: '', coverBlob: null };

    const scanAtoms = (start, end, depth = 0) => {
      if (depth > 7) return;
      let pos = start;
      while (pos + 8 <= end) {
        const size = readUint32BE(u8, pos);
        if (size < 8 || pos + size > end) break;
        const typeBytes = u8.subarray(pos + 4, pos + 8);
        const type = String.fromCharCode(...typeBytes);

        if (['moov', 'udta', 'ilst'].includes(type)) scanAtoms(pos + 8, pos + size, depth + 1);
        else if (type === 'meta') scanAtoms(pos + 12, pos + size, depth + 1);
        else if (typeBytes[0] === 0xa9 || type === 'covr') {
          let sub = pos + 8;
          while (sub + 16 <= pos + size) {
            const subSz = readUint32BE(u8, sub);
            if (subSz < 16 || sub + subSz > pos + size) break;
            const subType = String.fromCharCode(u8[sub + 4], u8[sub + 5], u8[sub + 6], u8[sub + 7]);
            if (subType === 'data') {
              const dataType = readUint32BE(u8, sub + 8);
              const valBytes = u8.subarray(sub + 16, sub + subSz);
              if (type === 'covr' && (dataType === 13 || dataType === 14)) {
                out.coverBlob = new Blob([valBytes], { type: dataType === 14 ? 'image/png' : 'image/jpeg' });
              } else if (dataType === 1) {
                const txt = new TextDecoder('utf-8').decode(valBytes).trim();
                const tagName = String.fromCharCode(typeBytes[1], typeBytes[2], typeBytes[3]);
                if (tagName === 'nam' && txt) out.title = txt;
                if (tagName === 'ART' && txt) out.artist = txt;
                if (tagName === 'alb' && txt) out.album = txt;
              }
            }
            sub += subSz;
          }
        }
        pos += size;
      }
    };

    scanAtoms(0, u8.length, 0);
    return out;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      if (!blob || blob.size > 1500000) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }

  async function extractAudioMetadata(file) {
    const guessed = guessTitleArtistFromFilename(file.name);
    let title = guessed.title;
    let artist = guessed.artist;
    let album = '';
    let embeddedCover = '';

    try {
      const slice = file.slice(0, 2 * 1024 * 1024);
      const u8 = new Uint8Array(await slice.arrayBuffer());
      const parsed = parseId3v2(u8) || parseMp4Tags(u8);
      if (parsed) {
        if (parsed.title) title = parsed.title;
        if (parsed.artist) artist = parsed.artist;
        if (parsed.album) album = parsed.album;
        if (parsed.coverBlob) embeddedCover = await blobToDataUrl(parsed.coverBlob);
      }
    } catch (_) { }

    return { title, artist, album, embeddedCover };
  }

  /* =========================================================
     Persistent Store
     ========================================================= */
  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        const store = {
          mode: raw.mode === 'video' ? 'video' : (raw.mode === 'explore' ? 'explore' : 'music'),
          musicPlaylists: Array.isArray(raw.musicPlaylists) ? raw.musicPlaylists : [],
          activeMusicPlId: raw.activeMusicPlId || null,
          videoPlaylists: Array.isArray(raw.videoPlaylists) ? raw.videoPlaylists : [],
          activeVideoPlId: raw.activeVideoPlId || null
        };
        // Ensure lyricsOffsetSec is initialized
        store.musicPlaylists.forEach((pl) => {
          (pl.tracks || []).forEach((tr) => {
            if (tr.lyricsAlignedKey) {
              delete tr.lyricsAlignedKey;
              tr.lyricsOffsetSec = 0;
            }
            if (typeof tr.lyricsOffsetSec !== 'number') tr.lyricsOffsetSec = 0;
            if (typeof tr.duration !== 'number' || tr.duration < 0) tr.duration = 0;
          });
        });
        return store;
      }
    } catch (_) { }
    return {
      mode: 'music',
      musicPlaylists: [],
      activeMusicPlId: null,
      videoPlaylists: [],
      activeVideoPlId: null
    };
  }

  function saveStore(store) {
    try {
      const clean = {
        mode: store.mode,
        activeMusicPlId: store.activeMusicPlId,
        activeVideoPlId: store.activeVideoPlId,
        musicPlaylists: store.musicPlaylists.map((pl) => ({
          ...pl,
          tracks: (pl.tracks || []).map(({ objectUrl, ...rest }) => rest)
        })),
        videoPlaylists: store.videoPlaylists.map((pl) => ({
          ...pl,
          episodes: (pl.episodes || []).map(({ objectUrl, ...rest }) => rest)
        }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (_) { }
  }

  /* =========================================================
     Fullscreen Cinema Media Player (Apple TV / Infuse Style)
     ========================================================= */
  function renderMediaPlayer(ctx) {
    cleanup();
    const { app, appStageWindow, appStageBrand, appStageBody, appStageOverlay, escHtml, playUiSound, showToast } = ctx;

    appStageWindow.classList.remove('is-details-mode');
    appStageWindow.classList.add('is-store-mode', 'is-fullscreen-app', 'is-mediaplayer-app');
    appStageOverlay.classList.remove('hidden');

    appStageBrand.innerHTML = `
      <div class="app-stage-brand-icon"><img src="${app.iconSrc}" alt="${escHtml(app.name)}" /></div>
      <div class="app-stage-brand-title">${escHtml(app.name)}</div>
    `;

    const store = loadStore();
    const audioEl = new Audio();
    audioEl.preload = 'auto';

    let currentTrack = null;
    let currentEpisode = null;
    let shuffle = false;
    let repeatMode = 'off';
    let lyricsCues = [];
    let activeLyricIdx = -1;
    let lyricsStatus = 'idle';
    let lyricsMetaBadge = '';
    let plainLyricsText = '';
    let rafId = null;
    let analyser = null;
    let freqData = null;
    let smoothBass = 0;
    let smoothMid = 0;
    let videoCcEnabled = true;
    let videoCcScale = 'md';
    let infoLookupSeq = 0;
    let musicPlayingWanted = false;
    let musicSoftClockSec = 0;
    let lastAudioNativeTime = 0;
    let lastAudioNativeMoveTs = 0;
    let lastAudioClockTickTs = 0;
    let musicClockTimer = null;
    let videoClockTimer = null;
    let drawerOpen = (store.mode === 'music' && !store.musicPlaylists.some((p) => p.tracks?.length))
      || (store.mode === 'video' && !store.videoPlaylists.some((p) => p.episodes?.length));

    appStageBody.innerHTML = `
      <div class="mp-shell" id="mp-shell">
        <div class="mp-ambient-bg">
          <img id="mp-ambient-img" src="" alt="" class="hidden" />
          <div class="mp-ambient-scrim"></div>
        </div>

        <header class="mp-header">
          <div class="mp-seg-tabs" role="tablist">
            <div id="mp-seg-indicator" class="mp-seg-indicator" aria-hidden="true"></div>
            <button id="mp-tab-music" class="mp-seg-btn ${store.mode === 'music' ? 'active' : ''}" type="button" role="tab">
              ${SVG.music}<span>Músicas</span>
            </button>
            <button id="mp-tab-video" class="mp-seg-btn ${store.mode === 'video' ? 'active' : ''}" type="button" role="tab">
              ${SVG.film}<span>Filmes &amp; Séries</span>
            </button>
            <button id="mp-tab-explore" class="mp-seg-btn ${store.mode === 'explore' ? 'active' : ''}" type="button" role="tab">
              ${SVG.folderOpen}<span>Explorar</span>
            </button>
          </div>
          <div class="mp-header-actions" id="mp-header-actions"></div>
        </header>

        <div id="mp-workspace" class="mp-workspace"></div>

        <aside id="mp-drawer" class="mp-drawer ${drawerOpen ? 'is-open' : ''}" aria-label="Biblioteca e Playlists"></aside>

        <input id="mp-audio-picker" type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac" multiple class="hidden" />
        <input id="mp-video-picker" type="file" accept="video/*,.mp4,.mkv,.webm,.mov,.m4v" multiple class="hidden" />
        <input id="mp-sub-picker" type="file" accept=".srt,.vtt,text/vtt" class="hidden" />
      </div>
    `;

    const shellEl = document.getElementById('mp-shell');
    const workspaceEl = document.getElementById('mp-workspace');
    const headerActionsEl = document.getElementById('mp-header-actions');
    const drawerEl = document.getElementById('mp-drawer');
    const ambientImg = document.getElementById('mp-ambient-img');
    const audioPicker = document.getElementById('mp-audio-picker');
    const videoPicker = document.getElementById('mp-video-picker');
    const subPicker = document.getElementById('mp-sub-picker');

    function getActiveMusicPl() {
      if (!store.musicPlaylists.length) return null;
      return store.musicPlaylists.find((p) => p.id === store.activeMusicPlId) || store.musicPlaylists[0];
    }

    function getActiveVideoPl() {
      if (!store.videoPlaylists.length) return null;
      return store.videoPlaylists.find((p) => p.id === store.activeVideoPlId) || store.videoPlaylists[0];
    }

    function toggleDrawer(force) {
      drawerOpen = typeof force === 'boolean' ? force : !drawerOpen;
      drawerEl?.classList.toggle('is-open', drawerOpen);
      document.getElementById('mp-drawer-toggle')?.classList.toggle('is-active', drawerOpen);
    }

    function syncAmbientArt() {
      if (!ambientImg) return;
      const art = store.mode === 'music'
        ? (currentTrack?.embeddedCover || currentTrack?.onlineCover || '')
        : (currentEpisode?.movieMeta?.backdrop || currentEpisode?.movieMeta?.poster || '');
      if (art) {
        if (ambientImg.src !== art) ambientImg.src = art;
        ambientImg.classList.remove('hidden');
      } else {
        ambientImg.classList.add('hidden');
      }
    }

    function openPromptModal({ title, fields, confirmLabel = 'Confirmar', onConfirm }) {
      document.getElementById('mp-inline-modal')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <form class="mp-modal-card">
          <h3>${escHtml(title)}</h3>
          ${fields.map((f) => `
            <label class="mp-modal-field">
              <span>${escHtml(f.label)}</span>
              <input class="shows-search-input" name="${escHtml(f.name)}" type="text" value="${escHtml(f.value || '')}" placeholder="${escHtml(f.placeholder || '')}" ${f.required ? 'required' : ''} />
            </label>
          `).join('')}
          <div class="mp-modal-actions">
            <button type="button" class="mp-pill-btn" id="mp-modal-cancel">Cancelar</button>
            <button type="submit" class="btn-prism" style="height:40px;padding:0 20px;">${escHtml(confirmLabel)}</button>
          </div>
        </form>
      `;
      shellEl?.appendChild(overlay);
      const firstInput = overlay.querySelector('input');
      firstInput?.focus();
      firstInput?.select();
      overlay.querySelector('#mp-modal-cancel')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      overlay.querySelector('form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const vals = {};
        overlay.querySelectorAll('input').forEach((inp) => { vals[inp.name] = inp.value.trim(); });
        overlay.remove();
        onConfirm(vals);
      });
    }

    function createPlaylistPrompt(type) {
      openPromptModal({
        title: type === 'music' ? 'Nova Playlist de Música' : 'Nova Série / Playlist de Vídeo',
        confirmLabel: 'Criar',
        fields: [{
          name: 'name',
          label: type === 'music' ? 'Nome da playlist' : 'Nome da série ou coleção',
          value: type === 'music' ? `Playlist ${store.musicPlaylists.length + 1}` : `Série ${store.videoPlaylists.length + 1}`,
          required: true
        }],
        onConfirm: ({ name }) => {
          if (!name) return;
          const clean = name.slice(0, 48);
          const id = `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          if (type === 'music') {
            store.musicPlaylists.push({ id, name: clean, tracks: [] });
            store.activeMusicPlId = id;
          } else {
            store.videoPlaylists.push({ id, name: clean, episodes: [] });
            store.activeVideoPlId = id;
          }
          saveStore(store);
          playUiSound('select');
          renderDrawer();
          renderWorkspace();
        }
      });
    }

    async function resolvePlayableUrl(item) {
      if (!item) return '';
      if (item.streamUrl) return item.streamUrl;
      if (item.usbRelPath) {
        item.streamUrl = `/api/usb/stream?path=${encodeURIComponent(item.usbRelPath)}`;
        return item.streamUrl;
      }
      if (item.objectUrl) return item.objectUrl;
      if (item.blobKey) {
        const blob = await idbGetBlob(item.blobKey);
        if (blob) {
          if (blob.name && !item.rawFilename) {
            item.rawFilename = blob.name;
            saveStore(store);
          }
          item.objectUrl = trackObjUrl(URL.createObjectURL(blob));
          return item.objectUrl;
        }
      }
      return '';
    }

    /* ----- Harmonious Reactive Vinyl Halo Visualizer ----- */
    function stopVisualizerLoop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function startVisualizerLoop() {
      // Audio visualizer disabled per user preference to keep vinyl disc animation 100% lightweight and GPU-driven.
      stopVisualizerLoop();
    }

    /* ----- Lyrics & Online Art ----- */
    async function fetchLyricsAndOnlineCover(track, durationSec, customQuery = null) {
      if (!track) return;
      const mySeq = ++infoLookupSeq;
      const searchTitle = customQuery?.title ?? track.title;
      const searchArtist = customQuery?.artist ?? track.artist;
      lyricsStatus = 'loading';
      lyricsCues = [];
      activeLyricIdx = -1;
      plainLyricsText = '';
      lyricsMetaBadge = '';
      renderLyricsPanel();

      try {
        if (!track.rawFilename && track.blobKey) {
          try {
            const stored = await idbGetBlob(track.blobKey);
            if (stored && stored.name) {
              track.rawFilename = stored.name;
              saveStore(store);
            }
          } catch (_) { }
        }
        const qs = new URLSearchParams({
          title: searchTitle || '',
          artist: searchArtist || '',
          duration: String(Math.round(durationSec || track.duration || 0)),
          raw: customQuery ? '' : (track.rawFilename || '')
        });
        const res = await fetch(`/api/media-player/music-info?${qs.toString()}`);
        const data = await res.json();
        if (mySeq !== infoLookupSeq || currentTrack?.id !== track.id) return;

        if (data.coverUrl && (!track.onlineCover || customQuery)) {
          track.onlineCover = data.coverUrl;
          saveStore(store);
          syncVinylCover();
          syncAmbientArt();
        }

        if (data.matchedTrackName && data.matchedArtistName) {
          if (String(track.title || '').toLowerCase() !== String(data.matchedTrackName).toLowerCase()) track.title = data.matchedTrackName;
          track.artist = data.matchedArtistName;
          if (data.matchedAlbumName && !track.album) track.album = data.matchedAlbumName;
          saveStore(store);
          const titleEl = document.getElementById('mp-now-title');
          const subEl = document.getElementById('mp-now-sub');
          if (titleEl) titleEl.textContent = track.title;
          if (subEl) subEl.textContent = [track.artist, track.album].filter(Boolean).join(' • ') || 'Áudio Local';
        }

        if (data.syncedLyrics) {
          lyricsCues = parseLrc(data.syncedLyrics);
          lyricsStatus = lyricsCues.length ? 'synced' : 'plain';
          plainLyricsText = data.plainLyrics || '';
          lyricsMetaBadge = 'Letra sincronizada';
        } else if (data.plainLyrics) {
          lyricsStatus = 'plain';
          plainLyricsText = data.plainLyrics;
          lyricsMetaBadge = 'Letra';
        } else {
          lyricsStatus = 'none';
          lyricsMetaBadge = 'Letra não encontrada';
        }
      } catch (_) {
        if (mySeq !== infoLookupSeq) return;
        lyricsStatus = 'none';
        lyricsMetaBadge = 'Erro ao buscar letra';
      }
      renderLyricsPanel();
      syncActiveLyric();
    }

    function hashStringColors(seed) {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const h1 = Math.abs(h) % 360;
      const h2 = (h1 + 48) % 360;
      const h3 = (h1 + 305) % 360;
      return [
        `hsla(${h1}, 78%, 46%, 0.56)`,
        `hsla(${h2}, 82%, 40%, 0.52)`,
        `hsla(${h3}, 72%, 38%, 0.5)`
      ];
    }

    const trackGradientCache = new Map();

    function applyTrackHeaderGradient(track, artSrc) {
      const topbarEl = document.querySelector('#app-stage-window .app-stage-topbar');
      if (!topbarEl) return;
      const isPlaying = Boolean(track && store.mode === 'music' && ((!audioEl.paused && !audioEl.ended && Boolean(audioEl.src)) || musicPlayingWanted));
      if (!isPlaying) {
        topbarEl.classList.remove('is-music-reactive');
        return;
      }
      const seed = `${track.title || ''}|${track.artist || ''}|${track.id || ''}`;
      const setColors = (c1, c2, c3) => {
        topbarEl.style.setProperty('--mp-grad-1', c1);
        topbarEl.style.setProperty('--mp-grad-2', c2);
        topbarEl.style.setProperty('--mp-grad-3', c3);
        topbarEl.classList.add('is-music-reactive');
      };

      const cacheKey = artSrc || seed;
      const cachedColors = trackGradientCache.get(cacheKey);
      if (cachedColors) {
        setColors(...cachedColors);
        return;
      }

      const fallback = hashStringColors(seed);
      setColors(...fallback);

      if (!artSrc) return;
      const probe = new Image();
      if (/^https?:\/\//i.test(artSrc) && !artSrc.startsWith(location.origin)) {
        probe.crossOrigin = 'anonymous';
      }
      probe.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(probe, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          const hist = new Map();
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const lum = (r + g + b) / 3;
            if (lum < 22 || lum > 215 || sat < 0.12) continue;
            const qr = (r >> 5) << 5;
            const qg = (g >> 5) << 5;
            const qb = (b >> 5) << 5;
            const key = `${qr},${qg},${qb}`;
            const cur = hist.get(key) || { r: 0, g: 0, b: 0, count: 0, weight: 0 };
            cur.r += r;
            cur.g += g;
            cur.b += b;
            cur.count += 1;
            cur.weight += 1 + sat * 1.6;
            hist.set(key, cur);
          }
          const ranked = [...hist.values()].sort((a, b) => b.weight - a.weight);
          if (ranked.length >= 1) {
            const pick = (item) => ({
              r: Math.round(item.r / item.count),
              g: Math.round(item.g / item.count),
              b: Math.round(item.b / item.count)
            });
            const p1 = pick(ranked[0]);
            const p2 = pick(ranked[1] || ranked[0]);
            const p3 = pick(ranked[2] || ranked[1] || ranked[0]);
            const extracted = [
              `rgba(${p1.r}, ${p1.g}, ${p1.b}, 0.68)`,
              `rgba(${p2.r}, ${p2.g}, ${p2.b}, 0.56)`,
              `rgba(${p3.r}, ${p3.g}, ${p3.b}, 0.52)`
            ];
            trackGradientCache.set(cacheKey, extracted);
            if (currentTrack?.id === track.id) setColors(...extracted);
          }
        } catch (_) {}
      };
      probe.src = artSrc;
    }

    function syncVinylCover() {
      const artSrc = currentTrack?.embeddedCover || currentTrack?.onlineCover || '';
      const img = document.getElementById('mp-vinyl-art');
      const fallback = document.getElementById('mp-vinyl-fallback');
      if (img && fallback) {
        if (artSrc) {
          img.src = artSrc;
          img.classList.remove('hidden');
          fallback.classList.add('hidden');
        } else {
          img.classList.add('hidden');
          fallback.classList.remove('hidden');
        }
      }
      syncAmbientArt();
      applyTrackHeaderGradient(currentTrack, artSrc);
    }

    function renderLyricsPanel() {
      const el = document.getElementById('mp-lyrics-body');
      const badgeEl = document.getElementById('mp-lyrics-badge');
      if (badgeEl) badgeEl.textContent = lyricsMetaBadge || (currentTrack ? 'Sincronização automática' : '');
      if (!el) return;

      if (!currentTrack) {
        el.innerHTML = `<div class="mp-lyrics-empty">Selecione ou adicione uma música para ver a letra sincronizada aparecer aqui em tempo real.</div>`;
        return;
      }
      if (lyricsStatus === 'loading') {
        el.innerHTML = `<div class="mp-lyrics-empty">Buscando letra sincronizada com nome exato e duração mais próxima…</div>`;
        return;
      }
      if (lyricsStatus === 'synced' && lyricsCues.length) {
        el.innerHTML = `
          <div class="mp-lyrics-flow">
            ${lyricsCues.map((c, idx) => `
              <button class="mp-lyric-btn ${idx === activeLyricIdx ? 'is-active' : ''}" data-lrc-idx="${idx}" type="button">
                ${escHtml(c.text)}
              </button>
            `).join('')}
          </div>
        `;
        el.querySelectorAll('[data-lrc-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cue = lyricsCues[Number(btn.dataset.lrcIdx)];
            if (cue && Number.isFinite(cue.time)) {
              musicSoftClockSec = cue.time;
              lastAudioNativeTime = cue.time;
              lastAudioNativeMoveTs = performance.now();
              lastAudioClockTickTs = performance.now();
              musicPlayingWanted = true;
              try { audioEl.currentTime = cue.time; } catch (_) { }
              if (audioEl.paused) audioEl.play().catch(() => { });
              syncMusicTransportUi();
              syncActiveLyric();
            }
          });
        });
        return;
      }
      if (lyricsStatus === 'plain' && plainLyricsText) {
        el.innerHTML = `<pre class="mp-lyrics-plain">${escHtml(plainLyricsText)}</pre>`;
        return;
      }
      el.innerHTML = `
        <div class="mp-lyrics-empty">
          <p>${escHtml(lyricsMetaBadge || 'Letra indisponível para esta faixa.')}</p>
          <small>Clique no ícone de edição acima para ajustar Título/Artista se o arquivo estiver com nome diferente.</small>
        </div>
      `;
    }

    function getEffectiveMusicTimes() {
      const rawDur = (Number.isFinite(audioEl.duration) && audioEl.duration > 0) ? audioEl.duration : 0;
      const dur = (currentTrack?.durationVerified && currentTrack.duration > 0)
        ? currentTrack.duration
        : (currentTrack?.duration > 0 ? currentTrack.duration : rawDur);
      const nativeCur = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
      let cur = Math.max(nativeCur, musicSoftClockSec || 0);
      cur = dur > 0 ? Math.min(cur, dur) : cur;
      return { cur, dur, rawDur };
    }

    let lyricScrollRaf = 0;

    function smoothScrollLyricsTo(body, targetTop) {
      if (!body) return;
      if (lyricScrollRaf) cancelAnimationFrame(lyricScrollRaf);
      const startTop = body.scrollTop;
      const diff = targetTop - startTop;
      if (Math.abs(diff) < 1) {
        body.scrollTop = targetTop;
        return;
      }
      const duration = 480;
      const startTime = performance.now();
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        if (!body.isConnected) return;
        const p = Math.min(1, (now - startTime) / duration);
        body.scrollTop = startTop + diff * easeOutCubic(p);
        if (p < 1) {
          lyricScrollRaf = requestAnimationFrame(step);
        } else {
          lyricScrollRaf = 0;
        }
      };
      lyricScrollRaf = requestAnimationFrame(step);
    }

    function syncActiveLyric() {
      if (lyricsStatus !== 'synced' || !lyricsCues.length) return;
      const offset = currentTrack?.lyricsOffsetSec || 0;
      const { cur } = getEffectiveMusicTimes();
      const t = cur + 0.16 + offset;
      let idx = -1;
      for (let i = lyricsCues.length - 1; i >= 0; i--) {
        if (t >= lyricsCues[i].time) { idx = i; break; }
      }
      if (idx === activeLyricIdx) return;
      activeLyricIdx = idx;
      const body = document.getElementById('mp-lyrics-body');
      if (!body) return;
      body.querySelectorAll('.mp-lyric-btn').forEach((node, i) => {
        node.classList.toggle('is-active', i === idx);
        node.classList.toggle('is-past', i < idx);
        node.classList.toggle('is-near', Math.abs(i - idx) === 1);
      });
      const activeNode = body.querySelector(`.mp-lyric-btn[data-lrc-idx="${idx}"]`);
      if (activeNode) {
        const bodyRect = body.getBoundingClientRect();
        const nodeRect = activeNode.getBoundingClientRect();
        const targetScroll = Math.max(0, (nodeRect.top - bodyRect.top) + body.scrollTop - (body.clientHeight / 2) + (activeNode.clientHeight / 2));
        smoothScrollLyricsTo(body, targetScroll);
      }
    }

    async function probeTrackDurationBackground(track, url) {
      if (!track || track.durationVerified) return;
      try {
        if (track.usbRelPath) {
          const r = await fetch(`/api/usb/properties?path=${encodeURIComponent(track.usbRelPath)}`);
          const d = await r.json();
          const probed = Math.round(Number(d?.mediaInfo?.duration) || 0);
          if (probed > 0) {
            track.duration = probed;
            track.durationVerified = true;
            saveStore(store);
            if (currentTrack?.id === track.id) syncMusicTransportUi();
            renderDrawer();
            return;
          }
        }
        let blob = track.blobKey ? await idbGetBlob(track.blobKey) : null;
        if (!blob && url && url.startsWith('blob:')) {
          blob = await (await fetch(url)).blob();
        }
        if (blob) {
          const exact = await getExactAudioDuration(blob);
          if (exact > 0) {
            track.duration = exact;
            track.durationVerified = true;
            saveStore(store);
            if (currentTrack?.id === track.id) syncMusicTransportUi();
            renderDrawer();
          }
        }
      } catch (_) { }
    }

    async function playMusicTrack(track) {
      if (!track) return;
      const url = await resolvePlayableUrl(track);
      if (!url) {
        showToast('Selecione novamente este arquivo de áudio.');
        return;
      }
      currentTrack = track;
      musicPlayingWanted = true;
      musicSoftClockSec = 0;
      lastAudioNativeTime = 0;
      lastAudioNativeMoveTs = performance.now();
      lastAudioClockTickTs = performance.now();

      let lookupDone = false;
      const triggerLookupOnce = () => {
        if (lookupDone) return;
        lookupDone = true;
        const dur = (track.duration > 0) ? track.duration : (Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? Math.round(audioEl.duration) : 0);
        if (dur > 0 && !track.duration) {
          track.duration = dur;
          saveStore(store);
        }
        fetchLyricsAndOnlineCover(track, track.duration || dur);
      };

      // Attach event listeners BEFORE assigning src to avoid missing instant metadata
      audioEl.onloadedmetadata = () => {
        if (!track.durationVerified && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
          track.duration = Math.round(audioEl.duration);
          saveStore(store);
        }
        syncMusicTransportUi();
        triggerLookupOnce();
      };
      audioEl.oncanplay = () => triggerLookupOnce();

      audioEl.onerror = (e) => {
        const err = audioEl.error;
        console.warn('[irisTV Player] Audio element error:', err ? `code=${err.code} msg=${err.message}` : e);
        if (track && !track._transcodeFallback) {
          track._transcodeFallback = true;
          const fallbackUrl = `/api/usb/stream?path=${encodeURIComponent(track.usbRelPath || '')}&transcode=wav`;
          console.log('[irisTV Player] Trying WAV transcode stream:', fallbackUrl);
          audioEl.src = fallbackUrl;
          audioEl.play().catch(() => { });
        }
      };

      audioEl.src = url;
      try { audioEl.currentTime = 0; } catch (_) { }

      renderDrawer();
      renderMusicWorkspace();
      audioEl.play().then(() => {
        lastAudioNativeMoveTs = performance.now();
        lastAudioClockTickTs = performance.now();
        syncMusicTransportUi();
        triggerLookupOnce();
      }).catch(() => {
        // Keep musicPlayingWanted = true so software clock advances even if audio device is unavailable
        syncMusicTransportUi();
        triggerLookupOnce();
      });

      // Verify exact duration in background without blocking playback start
      probeTrackDurationBackground(track, url);

      if (track.duration > 0) triggerLookupOnce();
      setTimeout(triggerLookupOnce, 220);
    }

    function playNextMusic(step = 1) {
      const pl = getActiveMusicPl();
      if (!pl || !pl.tracks.length) return;
      if (shuffle && pl.tracks.length > 1) {
        playMusicTrack(pl.tracks[Math.floor(Math.random() * pl.tracks.length)]);
        return;
      }
      const curIdx = pl.tracks.findIndex((t) => t.id === currentTrack?.id);
      let nextIdx = curIdx === -1 ? 0 : curIdx + step;
      if (nextIdx >= pl.tracks.length) nextIdx = 0;
      if (nextIdx < 0) nextIdx = pl.tracks.length - 1;
      playMusicTrack(pl.tracks[nextIdx]);
    }

    function syncMusicTransportUi() {
      const disc = document.getElementById('mp-vinyl-disc');
      const playBtn = document.getElementById('mp-play-btn');
      const curEl = document.getElementById('mp-cur-time');
      const totEl = document.getElementById('mp-tot-time');
      const seekEl = document.getElementById('mp-seek');
      const playing = Boolean(currentTrack && ((!audioEl.paused && !audioEl.ended && Boolean(audioEl.src)) || musicPlayingWanted));
      if (disc) disc.classList.toggle('is-spinning', playing);
      if (playBtn) {
        const nextState = playing ? 'pause' : 'play';
        if (playBtn.dataset.state !== nextState) {
          playBtn.dataset.state = nextState;
          playBtn.innerHTML = playing ? SVG.pause : SVG.play;
          applyTrackHeaderGradient(currentTrack, currentTrack?.embeddedCover || currentTrack?.onlineCover || '');
        }
      }
      const { cur, dur } = getEffectiveMusicTimes();
      if (curEl) curEl.textContent = fmtTime(cur);
      if (totEl) totEl.textContent = fmtTime(dur);
      if (seekEl && dur > 0) seekEl.value = String((cur / dur) * 1000);
    }

    function handleMusicTrackEnded() {
      if (repeatMode === 'one' && currentTrack) {
        musicSoftClockSec = 0;
        lastAudioNativeTime = 0;
        lastAudioNativeMoveTs = performance.now();
        lastAudioClockTickTs = performance.now();
        musicPlayingWanted = true;
        try { audioEl.currentTime = 0; } catch (_) { }
        audioEl.play().catch(() => { });
        syncMusicTransportUi();
        return;
      }
      const pl = getActiveMusicPl();
      const idx = pl?.tracks.findIndex((t) => t.id === currentTrack?.id) ?? -1;
      if (pl && (idx + 1 < pl.tracks.length || repeatMode === 'all')) {
        playNextMusic(1);
      } else {
        musicPlayingWanted = false;
        syncMusicTransportUi();
      }
    }

    musicClockTimer = setInterval(() => {
      if (!currentTrack || !musicPlayingWanted || store.mode !== 'music') return;
      const now = performance.now();
      const dt = Math.max(0, Math.min(1.0, (now - (lastAudioClockTickTs || now)) / 1000));
      lastAudioClockTickTs = now;
      const nativeCur = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
      if (Math.abs(nativeCur - lastAudioNativeTime) > 0.015) {
        lastAudioNativeTime = nativeCur;
        lastAudioNativeMoveTs = now;
        musicSoftClockSec = nativeCur;
      } else if (now - lastAudioNativeMoveTs > 450) {
        // Fallback software clock when OS audio sink is absent or stalled at 0:00
        musicSoftClockSec += dt;
      }
      const { dur } = getEffectiveMusicTimes();
      if (dur > 0 && musicSoftClockSec >= dur) {
        handleMusicTrackEnded();
        return;
      }
      syncMusicTransportUi();
      syncActiveLyric();
    }, 200);

    audioEl.addEventListener('timeupdate', () => {
      const nativeCur = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
      if (Math.abs(nativeCur - lastAudioNativeTime) > 0.01) {
        lastAudioNativeTime = nativeCur;
        lastAudioNativeMoveTs = performance.now();
        musicSoftClockSec = Math.max(musicSoftClockSec, nativeCur);
      }
      syncMusicTransportUi();
      syncActiveLyric();
    });
    audioEl.addEventListener('durationchange', () => {
      if (currentTrack && !currentTrack.durationVerified && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        currentTrack.duration = Math.round(audioEl.duration);
        saveStore(store);
      }
      syncMusicTransportUi();
    });
    audioEl.addEventListener('loadedmetadata', () => {
      if (currentTrack && !currentTrack.durationVerified && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        currentTrack.duration = Math.round(audioEl.duration);
        saveStore(store);
      }
      syncMusicTransportUi();
    });
    audioEl.addEventListener('play', () => {
      musicPlayingWanted = true;
      lastAudioClockTickTs = performance.now();
      syncMusicTransportUi();
    });
    audioEl.addEventListener('pause', () => {
      if (!musicPlayingWanted) syncMusicTransportUi();
    });
    audioEl.addEventListener('ended', handleMusicTrackEnded);

    /* ----- Slide-Over Frosted Glass Library Drawer ----- */
    function renderDrawer() {
      if (!drawerEl) return;
      const isMusic = store.mode === 'music';
      const playlists = isMusic ? store.musicPlaylists : store.videoPlaylists;
      const activePl = isMusic ? getActiveMusicPl() : getActiveVideoPl();
      const items = isMusic ? (activePl?.tracks || []) : (activePl?.episodes || []);

      drawerEl.innerHTML = `
        <div class="mp-drawer-head">
          <h3>${isMusic ? 'Playlists de Música' : 'Séries &amp; Episódios'}</h3>
          <div class="mp-drawer-head-btns">
            <button id="mp-drawer-new-pl" class="mp-icon-pill" type="button" title="Nova playlist">${SVG.plus}</button>
            <button id="mp-drawer-close" class="mp-icon-pill" type="button" title="Fechar biblioteca">${SVG.close}</button>
          </div>
        </div>

        <div class="mp-pl-strip">
          ${playlists.length ? playlists.map((pl) => `
            <div class="mp-pl-pill ${pl.id === activePl?.id ? 'is-active' : ''}">
              <button class="mp-pl-pill-btn" data-d-sel-pl="${pl.id}" type="button">${escHtml(pl.name)}</button>
              <button class="mp-pl-pill-x" data-d-del-pl="${pl.id}" type="button" title="Excluir">${SVG.close}</button>
            </div>
          `).join('') : `<div class="mp-drawer-note">Crie uma playlist ou adicione arquivos para começar.</div>`}
        </div>

        <div class="mp-drawer-subhead">
          <span>${activePl ? escHtml(activePl.name) : (isMusic ? 'Fila' : 'Episódios')}</span>
          <button id="mp-drawer-add-files" class="mp-add-mini" type="button">
            ${SVG.plus}<span>${isMusic ? 'Músicas' : 'Episódios'}</span>
          </button>
        </div>

        <div class="mp-drawer-list">
          ${items.length ? items.map((it, idx) => {
        const isCur = isMusic ? (currentTrack?.id === it.id) : (currentEpisode?.id === it.id);
        const cover = isMusic ? (it.embeddedCover || it.onlineCover || '') : '';
        return `
              <div class="mp-item-row ${isCur ? 'is-active' : ''}" data-d-play="${it.id}">
                ${isMusic ? `
                  <div class="mp-item-thumb">${cover ? `<img src="${escHtml(cover)}" alt="" />` : SVG.music}</div>
                ` : `
                  <button class="mp-ep-badge ${it.watched ? 'is-watched' : ''}" data-d-watch="${it.id}" type="button" title="Marcar como visto">${it.watched ? SVG.check : (idx + 1)}</button>
                `}
                <div class="mp-item-info">
                  <strong>${isMusic ? escHtml(it.title) : `Ep. ${idx + 1} • ${escHtml(it.title)}`}</strong>
                  <small>${isMusic
            ? `${escHtml(it.artist || 'Áudio Local')}${it.duration ? ` • ${fmtTime(it.duration)}` : ''}`
            : `${it.subName ? `Legenda • ` : ''}${it.duration ? fmtTime(it.duration) : 'Vídeo local'}`
          }</small>
                </div>
                <button class="mp-item-del" data-d-del-item="${it.id}" type="button" title="Remover">${SVG.trash}</button>
              </div>
            `;
      }).join('') : `
            <div class="mp-drawer-empty">
              ${isMusic
          ? 'Solte arquivos MP3, M4A ou FLAC aqui ou clique em <strong>+ Músicas</strong>.'
          : 'Adicione episódios em MP4, MKV ou WEBM para assistir em sequência.'}
            </div>
          `}
        </div>
      `;

      drawerEl.querySelector('#mp-drawer-close')?.addEventListener('click', () => toggleDrawer(false));
      drawerEl.querySelector('#mp-drawer-new-pl')?.addEventListener('click', () => createPlaylistPrompt(isMusic ? 'music' : 'video'));
      drawerEl.querySelector('#mp-drawer-add-files')?.addEventListener('click', () => {
        if (isMusic) {
          if (!store.musicPlaylists.length) {
            const id = `pl_${Date.now().toString(36)}`;
            store.musicPlaylists.push({ id, name: 'Minhas Músicas', tracks: [] });
            store.activeMusicPlId = id;
            saveStore(store);
          }
          audioPicker.click();
        } else {
          if (!store.videoPlaylists.length) {
            const id = `vpl_${Date.now().toString(36)}`;
            store.videoPlaylists.push({ id, name: 'Minha Série', episodes: [] });
            store.activeVideoPlId = id;
            saveStore(store);
          }
          videoPicker.click();
        }
      });

      drawerEl.querySelectorAll('[data-d-sel-pl]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (isMusic) store.activeMusicPlId = btn.dataset.dSelPl;
          else store.activeVideoPlId = btn.dataset.dSelPl;
          saveStore(store);
          playUiSound('move');
          renderDrawer();
        });
      });

      drawerEl.querySelectorAll('[data-d-del-pl]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.dDelPl;
          if (isMusic) {
            const pl = store.musicPlaylists.find((p) => p.id === id);
            (pl?.tracks || []).forEach((t) => { if (t.blobKey) idbDeleteBlob(t.blobKey); });
            store.musicPlaylists = store.musicPlaylists.filter((p) => p.id !== id);
            if (store.activeMusicPlId === id) store.activeMusicPlId = store.musicPlaylists[0]?.id || null;
          } else {
            const pl = store.videoPlaylists.find((p) => p.id === id);
            (pl?.episodes || []).forEach((ep) => { if (ep.blobKey) idbDeleteBlob(ep.blobKey); });
            store.videoPlaylists = store.videoPlaylists.filter((p) => p.id !== id);
            if (store.activeVideoPlId === id) store.activeVideoPlId = store.videoPlaylists[0]?.id || null;
          }
          saveStore(store);
          playUiSound('back');
          renderDrawer();
          renderWorkspace();
        });
      });

      drawerEl.querySelectorAll('[data-d-play]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-d-del-item],[data-d-watch]')) return;
          const id = row.dataset.dPlay;
          if (isMusic) {
            const tr = getActiveMusicPl()?.tracks.find((x) => x.id === id);
            if (tr) {
              playMusicTrack(tr);
              if (window.innerWidth < 1280) toggleDrawer(false);
            }
          } else {
            const ep = getActiveVideoPl()?.episodes.find((x) => x.id === id);
            if (ep) {
              currentEpisode = ep;
              toggleDrawer(false);
              renderVideoWorkspace(true);
            }
          }
        });
      });

      drawerEl.querySelectorAll('[data-d-watch]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const ep = getActiveVideoPl()?.episodes.find((x) => x.id === btn.dataset.dWatch);
          if (!ep) return;
          ep.watched = !ep.watched;
          saveStore(store);
          playUiSound('select');
          renderDrawer();
        });
      });

      drawerEl.querySelectorAll('[data-d-del-item]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.dDelItem;
          if (isMusic) {
            const pl = getActiveMusicPl();
            if (!pl) return;
            const tr = pl.tracks.find((x) => x.id === id);
            if (tr?.blobKey) idbDeleteBlob(tr.blobKey);
            pl.tracks = pl.tracks.filter((x) => x.id !== id);
            if (currentTrack?.id === id) { audioEl.pause(); audioEl.src = ''; currentTrack = null; }
          } else {
            const pl = getActiveVideoPl();
            if (!pl) return;
            const ep = pl.episodes.find((x) => x.id === id);
            if (ep?.blobKey) idbDeleteBlob(ep.blobKey);
            pl.episodes = pl.episodes.filter((x) => x.id !== id);
            if (currentEpisode?.id === id) currentEpisode = null;
          }
          saveStore(store);
          renderDrawer();
          renderWorkspace();
        });
      });
    }

    /* ----- Cinematic Music Stage ----- */
    function renderMusicWorkspace() {
      const activePl = getActiveMusicPl();
      const totalInPl = activePl?.tracks?.length || 0;
      const artSrc = currentTrack?.embeddedCover || currentTrack?.onlineCover || '';
      applyTrackHeaderGradient(currentTrack, artSrc);

      headerActionsEl.innerHTML = `
        <button id="mp-drawer-toggle" class="mp-pill-btn ${drawerOpen ? 'is-active' : ''}" type="button">
          ${SVG.list}<span>Playlists (${totalInPl})</span>
        </button>
        <button id="mp-add-files" class="btn-prism mp-add-main" type="button">
          ${SVG.plus}<span>Adicionar Músicas</span>
        </button>
      `;

      workspaceEl.innerHTML = `
        <div class="mp-cinema-music">
          <div class="mp-player-col">
            <div class="mp-disc-stage">
              <div id="mp-vinyl-wrap" class="mp-vinyl-wrap">
                <div id="mp-vinyl-disc" class="mp-vinyl-disc ${((!audioEl.paused && !audioEl.ended && audioEl.src) || musicPlayingWanted) ? 'is-spinning' : ''}">
                  <div class="mp-vinyl-grooves"></div>
                  <div class="mp-vinyl-sheen"></div>
                  <div class="mp-vinyl-label">
                    <img id="mp-vinyl-art" src="${escHtml(artSrc)}" alt="" class="${artSrc ? '' : 'hidden'}" />
                    <div id="mp-vinyl-fallback" class="mp-vinyl-fallback ${artSrc ? 'hidden' : ''}">${SVG.music}</div>
                  </div>
                  <div class="mp-vinyl-spindle"></div>
                </div>
              </div>
            </div>

            <div class="mp-track-headline">
              <h2 id="mp-now-title">${escHtml(currentTrack?.title || 'Pronto para tocar')}</h2>
              <p id="mp-now-sub">${escHtml(currentTrack ? ([currentTrack.artist, currentTrack.album].filter(Boolean).join(' • ') || 'Áudio Local') : 'Adicione músicas ou abra suas playlists')}</p>
            </div>

            <div class="mp-scrubber-block">
              <input id="mp-seek" class="mp-range" type="range" min="0" max="1000" value="0" />
              <div class="mp-time-row">
                <span id="mp-cur-time">0:00</span>
                <span id="mp-tot-time">0:00</span>
              </div>
            </div>

            <div class="mp-controls-dock">
              <button id="mp-shuffle-btn" class="mp-ctl ${shuffle ? 'is-on' : ''}" type="button" title="Aleatório">${SVG.shuffle}</button>
              <button id="mp-prev-btn" class="mp-ctl" type="button" title="Anterior">${SVG.prev}</button>
              <button id="mp-play-btn" class="mp-ctl-play" type="button" title="Play / Pause">${(!audioEl.paused && audioEl.src) ? SVG.pause : SVG.play}</button>
              <button id="mp-next-btn" class="mp-ctl" type="button" title="Próxima">${SVG.next}</button>
              <button id="mp-repeat-btn" class="mp-ctl ${repeatMode !== 'off' ? 'is-on' : ''}" type="button" title="Repetir">${SVG.repeat}${repeatMode === 'one' ? '<i class="mp-rep-one">1</i>' : ''}</button>
              <div class="mp-vol-dock">
                ${SVG.vol}
                <input id="mp-vol-range" class="mp-range" type="range" min="0" max="100" value="${Math.round(audioEl.volume * 100)}" />
              </div>
            </div>
          </div>

          <section class="mp-lyrics-col">
            <div class="mp-lyrics-topbar">
              <div class="mp-lyrics-top-left">
                <span id="mp-lyrics-badge" class="mp-lyrics-source">Sincronização automática</span>
                ${currentTrack ? `
                  <div class="mp-lyrics-offset-pill" title="Ajuste fino de sincronização">
                    <button id="mp-lrc-nudge-down" class="mp-nudge-btn" type="button" title="Atrasar letra 1s">-1s</button>
                    <span id="mp-lrc-offset-val">${(currentTrack.lyricsOffsetSec || 0) > 0 ? '+' : ''}${(currentTrack.lyricsOffsetSec || 0).toFixed(1)}s</span>
                    <button id="mp-lrc-nudge-up" class="mp-nudge-btn" type="button" title="Adiantar letra 1s">+1s</button>
                    ${(currentTrack.lyricsOffsetSec || 0) !== 0 ? `<button id="mp-lrc-reset-offset" class="mp-nudge-reset" type="button" title="Zerar ajuste">↺</button>` : ''}
                  </div>
                ` : ''}
              </div>
              ${currentTrack ? `<button id="mp-edit-meta-btn" class="mp-pill-btn mp-pill-sm" type="button" title="Corrigir nome/artista">${SVG.edit}<span>Buscar Letra</span></button>` : ''}
            </div>
            <div id="mp-lyrics-body" class="mp-lyrics-scroll"></div>
          </section>
        </div>
      `;

      syncAmbientArt();
      renderLyricsPanel();
      syncMusicTransportUi();

      document.getElementById('mp-drawer-toggle')?.addEventListener('click', () => toggleDrawer());
      document.getElementById('mp-add-files')?.addEventListener('click', () => {
        if (!store.musicPlaylists.length) {
          const id = `pl_${Date.now().toString(36)}`;
          store.musicPlaylists.push({ id, name: 'Minhas Músicas', tracks: [] });
          store.activeMusicPlId = id;
          saveStore(store);
        }
        audioPicker.click();
      });

      document.getElementById('mp-play-btn')?.addEventListener('click', () => {
        if (!currentTrack) {
          const first = getActiveMusicPl()?.tracks?.[0];
          if (first) playMusicTrack(first);
          else toggleDrawer(true);
          return;
        }
        const isPlayingNow = (!audioEl.paused && !audioEl.ended && Boolean(audioEl.src)) || musicPlayingWanted;
        if (!isPlayingNow) {
          musicPlayingWanted = true;
          lastAudioClockTickTs = performance.now();
          lastAudioNativeMoveTs = performance.now();
          audioEl.play().catch(() => { });
          syncMusicTransportUi();
        } else {
          musicPlayingWanted = false;
          audioEl.pause();
          syncMusicTransportUi();
        }
      });
      document.getElementById('mp-prev-btn')?.addEventListener('click', () => playNextMusic(-1));
      document.getElementById('mp-next-btn')?.addEventListener('click', () => playNextMusic(1));
      document.getElementById('mp-shuffle-btn')?.addEventListener('click', () => { shuffle = !shuffle; renderMusicWorkspace(); });
      document.getElementById('mp-repeat-btn')?.addEventListener('click', () => {
        repeatMode = repeatMode === 'off' ? 'all' : (repeatMode === 'all' ? 'one' : 'off');
        renderMusicWorkspace();
      });
      document.getElementById('mp-lrc-nudge-down')?.addEventListener('click', () => {
        if (!currentTrack) return;
        currentTrack.lyricsOffsetSec = Math.round(((currentTrack.lyricsOffsetSec || 0) - 1) * 10) / 10;
        saveStore(store);
        const valEl = document.getElementById('mp-lrc-offset-val');
        if (valEl) valEl.textContent = (currentTrack.lyricsOffsetSec > 0 ? '+' : '') + currentTrack.lyricsOffsetSec.toFixed(1) + 's';
        syncActiveLyric();
      });
      document.getElementById('mp-lrc-nudge-up')?.addEventListener('click', () => {
        if (!currentTrack) return;
        currentTrack.lyricsOffsetSec = Math.round(((currentTrack.lyricsOffsetSec || 0) + 1) * 10) / 10;
        saveStore(store);
        const valEl = document.getElementById('mp-lrc-offset-val');
        if (valEl) valEl.textContent = (currentTrack.lyricsOffsetSec > 0 ? '+' : '') + currentTrack.lyricsOffsetSec.toFixed(1) + 's';
        syncActiveLyric();
      });
      document.getElementById('mp-lrc-reset-offset')?.addEventListener('click', () => {
        if (!currentTrack) return;
        currentTrack.lyricsOffsetSec = 0;
        saveStore(store);
        const valEl = document.getElementById('mp-lrc-offset-val');
        if (valEl) valEl.textContent = '0.0s';
        syncActiveLyric();
      });
      document.getElementById('mp-seek')?.addEventListener('input', (e) => {
        const { dur } = getEffectiveMusicTimes();
        if (dur > 0) {
          const nextT = (Number(e.target.value) / 1000) * dur;
          musicSoftClockSec = nextT;
          lastAudioNativeTime = nextT;
          lastAudioNativeMoveTs = performance.now();
          lastAudioClockTickTs = performance.now();
          try { audioEl.currentTime = nextT; } catch (_) { }
          syncMusicTransportUi();
          syncActiveLyric();
        }
      });
      document.getElementById('mp-vol-range')?.addEventListener('input', (e) => {
        audioEl.volume = Math.max(0, Math.min(1, Number(e.target.value) / 100));
      });
      document.getElementById('mp-edit-meta-btn')?.addEventListener('click', () => {
        if (!currentTrack) return;
        openPromptModal({
          title: 'Buscar Letra Sincronizada e Capa',
          confirmLabel: 'Buscar',
          fields: [
            { name: 'title', label: 'Nome exato da música', value: currentTrack.title, required: true },
            { name: 'artist', label: 'Artista (opcional)', value: currentTrack.artist || '', required: false }
          ],
          onConfirm: ({ title, artist }) => {
            if (!title) return;
            currentTrack.title = title;
            currentTrack.artist = artist || '';
            saveStore(store);
            const dur = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : currentTrack.duration;
            fetchLyricsAndOnlineCover(currentTrack, dur, { title: currentTrack.title, artist: currentTrack.artist });
            const tNode = document.getElementById('mp-now-title');
            const sNode = document.getElementById('mp-now-sub');
            if (tNode) tNode.textContent = currentTrack.title;
            if (sNode) sNode.textContent = currentTrack.artist || 'Áudio Local';
          }
        });
      });
    }

    /* ----- Cinema Series & Video Theater ----- */
    function renderVideoWorkspace(autoPlayCurrent = false) {
      stopVisualizerLoop();
      musicPlayingWanted = false;
      audioEl.pause();
      if (videoClockTimer) {
        clearInterval(videoClockTimer);
        videoClockTimer = null;
      }
      syncAmbientArt();

      const activeSeries = getActiveVideoPl();
      const episodes = activeSeries?.episodes || [];
      const epIdx = currentEpisode ? episodes.findIndex((e) => e.id === currentEpisode.id) : -1;
      const isMovieMode = Boolean(currentEpisode?.isMovie || activeSeries?.kind === 'movie');
      const mMeta = currentEpisode?.movieMeta || null;
      if (currentEpisode && isMovieMode && !mMeta && !currentEpisode._metaFetched) {
        fetchMovieMetadata(currentEpisode);
      }
      const epPillLabel = currentEpisode
        ? (isMovieMode
            ? `🎬 ${mMeta?.title || currentEpisode.cleanTitle || currentEpisode.title}${mMeta?.year ? ` (${mMeta.year})` : ''}${mMeta?.rating ? ` • ★ ${mMeta.rating}` : ''}`
            : `${activeSeries?.name || 'Vídeo'} • Ep. ${epIdx + 1}: ${currentEpisode.title}`)
        : 'Nenhum filme ou episódio';

      headerActionsEl.innerHTML = `
        <button id="mp-drawer-toggle" class="mp-pill-btn ${drawerOpen ? 'is-active' : ''}" type="button">
          ${SVG.list}<span>Biblioteca (${episodes.length})</span>
        </button>
        <button id="mp-add-videos" class="btn-prism mp-add-main" type="button">
          ${SVG.plus}<span>Adicionar Filmes / Episódios</span>
        </button>
      `;

      workspaceEl.innerHTML = `
        <div class="mp-cinema-video" id="mp-video-viewport">
          <video id="mp-video-el" class="mp-video-el ${currentEpisode ? '' : 'hidden'}" playsinline></video>
          ${!currentEpisode ? `
            <div class="mp-video-empty">
              <div class="mp-video-empty-icon">${SVG.film}</div>
              <h2>Filmes &amp; Séries</h2>
              <p>Assista a <strong>filmes</strong> com capa, ano e nota automáticos ou organize suas <strong>séries</strong> por episódios com legendas <strong>.srt</strong> / <strong>.vtt</strong>.</p>
              <button id="mp-empty-open-lib" class="btn-prism" type="button" style="height:42px;padding:0 22px;margin-top:8px;">Abrir Biblioteca de Vídeos</button>
            </div>
          ` : ''}

          <div id="mp-sub-overlay" class="mp-sub-overlay size-${videoCcScale} hidden">
            <span id="mp-sub-text"></span>
          </div>

          <div class="mp-video-hud">
            <div class="mp-scrubber-block">
              <input id="mp-v-seek" class="mp-range" type="range" min="0" max="1000" value="0" />
              <div class="mp-time-row">
                <span id="mp-v-cur">0:00</span>
                <span class="mp-v-ep-pill">${escHtml(epPillLabel)}</span>
                <span id="mp-v-tot">0:00</span>
              </div>
            </div>
            <div class="mp-video-hud-row">
              <div class="mp-hud-group">
                <button id="mp-ep-prev" class="mp-ctl" type="button" title="${isMovieMode ? 'Voltar 10s' : 'Episódio anterior'}">${SVG.prev}</button>
                <button id="mp-v-play" class="mp-ctl-play" type="button" title="Play / Pause">${SVG.play}</button>
                <button id="mp-ep-next" class="mp-ctl" type="button" title="${isMovieMode ? 'Avançar 10s' : 'Próximo episódio'}">${SVG.next}</button>
              </div>
              <div class="mp-hud-group">
                <button id="mp-load-sub-btn" class="mp-pill-btn mp-pill-sm" type="button">${SVG.cc}<span>+ Legenda</span></button>
                <button id="mp-cc-toggle-btn" class="mp-pill-btn mp-pill-sm ${videoCcEnabled ? 'is-active' : ''}" type="button">CC ${videoCcEnabled ? 'ON' : 'OFF'}</button>
                <button id="mp-cc-size-btn" class="mp-pill-btn mp-pill-sm" type="button" title="Tamanho da legenda">Legenda: ${{ sm: 'Pequena', md: 'Média', lg: 'Grande' }[videoCcScale]}</button>
                <button id="mp-v-fs-btn" class="mp-ctl" type="button" title="Tela cheia">${SVG.expand}</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const vEl = document.getElementById('mp-video-el');
      const subWrap = document.getElementById('mp-sub-overlay');
      const subText = document.getElementById('mp-sub-text');
      const vPlayBtn = document.getElementById('mp-v-play');
      const vSeek = document.getElementById('mp-v-seek');
      const vCur = document.getElementById('mp-v-cur');
      const vTot = document.getElementById('mp-v-tot');

      let videoPlayingWanted = Boolean(autoPlayCurrent && currentEpisode);
      let videoSoftClockSec = (currentEpisode?.lastPos && currentEpisode.lastPos > 3) ? currentEpisode.lastPos : 0;
      let lastVideoNativeTime = videoSoftClockSec;
      let lastVideoNativeMoveTs = performance.now();
      let lastVideoClockTickTs = performance.now();

      const getEffectiveVideoTimes = () => {
        const rawDur = (vEl && Number.isFinite(vEl.duration) && vEl.duration > 0) ? vEl.duration : 0;
        const dur = rawDur > 0 ? rawDur : (currentEpisode?.duration > 0 ? currentEpisode.duration : 0);
        const nativeCur = (vEl && Number.isFinite(vEl.currentTime)) ? vEl.currentTime : 0;
        let cur = Math.max(nativeCur, videoSoftClockSec || 0);
        if (dur > 0) cur = Math.min(cur, dur);
        return { cur, dur };
      };

      const syncVideoSub = () => {
        if (!vEl || !subWrap || !subText) return;
        const cues = currentEpisode?.subCues || [];
        if (!videoCcEnabled || !cues.length) { subWrap.classList.add('hidden'); return; }
        const { cur } = getEffectiveVideoTimes();
        const cue = cues.find((c) => cur >= c.start && cur <= c.end);
        if (cue) { subText.textContent = cue.text; subWrap.classList.remove('hidden'); }
        else subWrap.classList.add('hidden');
      };

      const syncVideoUi = () => {
        if (!vEl) return;
        const playing = Boolean(currentEpisode && ((!vEl.paused && !vEl.ended && Boolean(vEl.src)) || videoPlayingWanted));
        if (vPlayBtn) vPlayBtn.innerHTML = playing ? SVG.pause : SVG.play;
        const { cur, dur } = getEffectiveVideoTimes();
        if (vCur) vCur.textContent = fmtTime(cur);
        if (vTot) vTot.textContent = fmtTime(dur);
        if (vSeek && dur > 0) vSeek.value = String((cur / dur) * 1000);
        syncVideoSub();
      };

      const probeEpisodeDurationBackground = async (ep) => {
        if (!ep || ep.duration > 0 || !ep.usbRelPath) return;
        try {
          const r = await fetch(`/api/usb/properties?path=${encodeURIComponent(ep.usbRelPath)}`);
          const d = await r.json();
          const probed = Math.round(Number(d?.mediaInfo?.duration) || 0);
          if (probed > 0) {
            ep.duration = probed;
            saveStore(store);
            if (currentEpisode?.id === ep.id) syncVideoUi();
            renderDrawer();
          }
        } catch (_) { }
      };

      const startVideoPlayback = () => {
        if (!vEl) return;
        videoPlayingWanted = true;
        lastVideoClockTickTs = performance.now();
        lastVideoNativeMoveTs = performance.now();
        vEl.play().then(() => {
          syncVideoUi();
        }).catch(() => {
          // If unmuted playback fails (e.g. missing audio sink), fallback to muted so Chromium uses WallClockTimeSource
          vEl.muted = true;
          vEl.play().then(() => syncVideoUi()).catch(() => syncVideoUi());
        });
        syncVideoUi();
      };

      const handleVideoEnded = () => {
        videoPlayingWanted = false;
        const pl = getActiveVideoPl();
        if (currentEpisode) { currentEpisode.watched = true; currentEpisode.lastPos = 0; saveStore(store); }
        const idx = pl?.episodes.findIndex((e) => e.id === currentEpisode?.id) ?? -1;
        if (pl && idx !== -1 && idx + 1 < pl.episodes.length) {
          showToast(`Próximo: Episódio ${idx + 2}`);
          playEpisode(pl.episodes[idx + 1]);
        } else {
          renderDrawer();
          syncVideoUi();
        }
      };

      const playEpisode = async (ep) => {
        if (!ep || !vEl) return;
        const url = await resolvePlayableUrl(ep);
        if (!url) { showToast('Selecione novamente este arquivo de vídeo.'); return; }
        currentEpisode = ep;
        videoSoftClockSec = (ep.lastPos && ep.lastPos > 3) ? ep.lastPos : 0;
        lastVideoNativeTime = videoSoftClockSec;
        lastVideoNativeMoveTs = performance.now();
        lastVideoClockTickTs = performance.now();
        vEl.classList.remove('hidden');
        workspaceEl.querySelector('.mp-video-empty')?.remove();
        vEl.src = url;
        if (videoSoftClockSec > 0) {
          try { vEl.currentTime = videoSoftClockSec; } catch (_) { }
        }
        startVideoPlayback();
        probeEpisodeDurationBackground(ep);
        const pill = workspaceEl.querySelector('.mp-v-ep-pill');
        const nIdx = episodes.findIndex((x) => x.id === ep.id);
        if (pill) pill.textContent = `${activeSeries?.name || 'Vídeo'} • Ep. ${nIdx + 1}: ${ep.title}`;
        window.recordIrisContinueWatching?.({
          id: `ep-${ep.id}`,
          title: `${activeSeries?.name || 'Vídeo'} • ${ep.title}`,
          sub: 'Mídia Local',
          appName: 'Mídia',
          appId: 'mediaplayer',
          progress: ep.duration ? Math.round(((ep.lastPos || 5) / ep.duration) * 100) : 10
        });
        renderDrawer();
        syncVideoUi();
      };

      if (currentEpisode && vEl) {
        probeEpisodeDurationBackground(currentEpisode);
        resolvePlayableUrl(currentEpisode).then((url) => {
          if (url && vEl) {
            vEl.src = url;
            if (currentEpisode.lastPos && currentEpisode.lastPos > 3) {
              try { vEl.currentTime = currentEpisode.lastPos; } catch (_) { }
            }
            if (autoPlayCurrent) startVideoPlayback();
            else syncVideoUi();
          }
        });
      }

      if (vEl) {
        videoClockTimer = setInterval(() => {
          if (!document.body.contains(vEl)) {
            clearInterval(videoClockTimer);
            videoClockTimer = null;
            return;
          }
          if (!currentEpisode || !videoPlayingWanted || store.mode !== 'video') return;
          const now = performance.now();
          const dt = Math.max(0, Math.min(1.0, (now - (lastVideoClockTickTs || now)) / 1000));
          lastVideoClockTickTs = now;
          const nativeCur = Number.isFinite(vEl.currentTime) ? vEl.currentTime : 0;
          if (Math.abs(nativeCur - lastVideoNativeTime) > 0.015) {
            lastVideoNativeTime = nativeCur;
            lastVideoNativeMoveTs = now;
            videoSoftClockSec = nativeCur;
          } else if (now - lastVideoNativeMoveTs > 500) {
            // Audio sink clock is blocked: switch video to muted WallClockTimeSource & advance software clock
            if (!vEl.muted) {
              vEl.muted = true;
              vEl.play().catch(() => { });
            }
            videoSoftClockSec += dt * (vEl.playbackRate || 1);
            try {
              if (vEl.readyState >= 1) vEl.currentTime = videoSoftClockSec;
            } catch (_) { }
          }
          const { dur } = getEffectiveVideoTimes();
          if (dur > 0 && videoSoftClockSec >= dur) {
            handleVideoEnded();
            return;
          }
          syncVideoUi();
        }, 200);

        vEl.addEventListener('timeupdate', () => {
          const nativeCur = Number.isFinite(vEl.currentTime) ? vEl.currentTime : 0;
          if (Math.abs(nativeCur - lastVideoNativeTime) > 0.01) {
            lastVideoNativeTime = nativeCur;
            lastVideoNativeMoveTs = performance.now();
            videoSoftClockSec = Math.max(videoSoftClockSec, nativeCur);
          }
          syncVideoUi();
          if (currentEpisode && Math.floor(videoSoftClockSec) % 5 === 0) {
            currentEpisode.lastPos = Math.floor(videoSoftClockSec);
            saveStore(store);
          }
        });
        vEl.addEventListener('loadedmetadata', () => {
          if (currentEpisode && Number.isFinite(vEl.duration) && vEl.duration > 0) {
            currentEpisode.duration = Math.round(vEl.duration);
            saveStore(store);
          }
          if (currentEpisode?.lastPos && currentEpisode.lastPos > 3 && vEl.currentTime < 1) {
            try { vEl.currentTime = currentEpisode.lastPos; } catch (_) { }
          }
          syncVideoUi();
        });
        vEl.addEventListener('play', () => {
          videoPlayingWanted = true;
          lastVideoClockTickTs = performance.now();
          syncVideoUi();
        });
        vEl.addEventListener('pause', () => {
          if (!videoPlayingWanted) syncVideoUi();
        });
        vEl.addEventListener('ended', handleVideoEnded);
      }

      document.getElementById('mp-drawer-toggle')?.addEventListener('click', () => toggleDrawer());
      document.getElementById('mp-empty-open-lib')?.addEventListener('click', () => toggleDrawer(true));
      document.getElementById('mp-add-videos')?.addEventListener('click', () => {
        if (!store.videoPlaylists.length) {
          const id = `vpl_${Date.now().toString(36)}`;
          store.videoPlaylists.push({ id, name: 'Minha Série', episodes: [] });
          store.activeVideoPlId = id;
          saveStore(store);
        }
        videoPicker.click();
      });

      vPlayBtn?.addEventListener('click', () => {
        if (!currentEpisode) {
          const first = getActiveVideoPl()?.episodes?.[0];
          if (first) playEpisode(first);
          else toggleDrawer(true);
          return;
        }
        const isPlayingNow = (!vEl.paused && !vEl.ended && Boolean(vEl.src)) || videoPlayingWanted;
        if (!isPlayingNow) {
          startVideoPlayback();
        } else {
          videoPlayingWanted = false;
          vEl.pause();
          syncVideoUi();
        }
      });

      document.getElementById('mp-ep-prev')?.addEventListener('click', () => {
        const pl = getActiveVideoPl();
        if (!pl?.episodes.length) return;
        const idx = pl.episodes.findIndex((e) => e.id === currentEpisode?.id);
        playEpisode(pl.episodes[idx > 0 ? idx - 1 : pl.episodes.length - 1]);
      });
      document.getElementById('mp-ep-next')?.addEventListener('click', () => {
        const pl = getActiveVideoPl();
        if (!pl?.episodes.length) return;
        const idx = pl.episodes.findIndex((e) => e.id === currentEpisode?.id);
        playEpisode(pl.episodes[(idx + 1) % pl.episodes.length]);
      });
      vSeek?.addEventListener('input', (e) => {
        const { dur } = getEffectiveVideoTimes();
        if (vEl && dur > 0) {
          const nextT = (Number(e.target.value) / 1000) * dur;
          videoSoftClockSec = nextT;
          lastVideoNativeTime = nextT;
          lastVideoNativeMoveTs = performance.now();
          lastVideoClockTickTs = performance.now();
          try { vEl.currentTime = nextT; } catch (_) { }
          syncVideoUi();
        }
      });
      document.getElementById('mp-load-sub-btn')?.addEventListener('click', () => {
        if (!currentEpisode) {
          const first = getActiveVideoPl()?.episodes?.[0];
          if (!first) return showToast('Adicione um vídeo primeiro.');
          currentEpisode = first;
        }
        subPicker.click();
      });
      document.getElementById('mp-cc-toggle-btn')?.addEventListener('click', (e) => {
        videoCcEnabled = !videoCcEnabled;
        e.currentTarget.classList.toggle('is-active', videoCcEnabled);
        e.currentTarget.textContent = `CC ${videoCcEnabled ? 'ON' : 'OFF'}`;
        syncVideoSub();
      });
      document.getElementById('mp-cc-size-btn')?.addEventListener('click', (e) => {
        videoCcScale = videoCcScale === 'sm' ? 'md' : (videoCcScale === 'md' ? 'lg' : 'sm');
        e.currentTarget.textContent = `Legenda: ${{ sm: 'Pequena', md: 'Média', lg: 'Grande' }[videoCcScale]}`;
        if (subWrap) {
          subWrap.classList.remove('size-sm', 'size-md', 'size-lg');
          subWrap.classList.add(`size-${videoCcScale}`);
        }
      });
      document.getElementById('mp-v-fs-btn')?.addEventListener('click', () => {
        const vp = document.getElementById('mp-video-viewport');
        if (!document.fullscreenElement) vp?.requestFullscreen?.().catch(() => { });
        else document.exitFullscreen?.().catch(() => { });
      });
    }

    /* =========================================================
       Aba Explorar (Pendrive USB + Menu de Contexto Lucide + Estúdio de Vídeo)
       ========================================================= */
    let exploreCurPath = '';
    let exploreEntries = [];
    let exploreDriveLabel = 'Pendrive irisOS';
    let exploreLoading = false;
    let exploreSearchQuery = '';
    let usbClipboard = null; // { relPath, name, mode: 'copy' | 'cut', isDir }

    function formatFileSize(bytes) {
      const b = Number(bytes) || 0;
      if (b <= 0) return '0 B';
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function getEntryIconSvg(entry) {
      if (entry.isDir) return SVG.folder;
      if (entry.kind === 'audio') return SVG.fileAudio;
      if (entry.kind === 'video') return SVG.fileVideo;
      if (entry.kind === 'image') return SVG.fileImage;
      if (entry.kind === 'text') return SVG.fileText;
      return SVG.file;
    }

    function getEntryTypeBadge(entry) {
      if (entry.isDir) return 'Pasta';
      const ext = (entry.ext || '').replace(/^\./, '').toUpperCase();
      if (entry.kind === 'audio') return `Áudio ${ext}`;
      if (entry.kind === 'video') return `Vídeo ${ext}`;
      if (entry.kind === 'image') return `Imagem ${ext}`;
      if (entry.kind === 'text') return `Texto ${ext}`;
      return ext ? `Arquivo ${ext}` : 'Arquivo';
    }

    function closeUsbContextMenu() {
      document.getElementById('mp-usb-ctx-menu')?.remove();
    }

    async function loadExploreDirectory(relPath = exploreCurPath, showToastOnErr = true) {
      closeUsbContextMenu();
      exploreLoading = true;
      renderExploreWorkspaceContent();
      try {
        const res = await fetch(`/api/usb/list?path=${encodeURIComponent(relPath || '')}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao ler o pendrive');
        exploreCurPath = data.currentPath || '';
        exploreEntries = Array.isArray(data.items) ? data.items : (Array.isArray(data.entries) ? data.entries : []);
        exploreDriveLabel = data.usbLabel || data.driveLabel || 'Pendrive USB';
      } catch (err) {
        if (showToastOnErr) showToast(err.message || 'Erro ao ler o pendrive');
      } finally {
        exploreLoading = false;
        renderExploreWorkspaceContent();
      }
    }

    async function openUsbEntry(entry) {
      if (!entry) return;
      if (entry.isDir) {
        playUiSound('select');
        await loadExploreDirectory(entry.relPath);
        return;
      }
      const streamUrl = `/api/usb/stream?path=${encodeURIComponent(entry.relPath)}`;
      if (entry.kind === 'audio') {
        playUiSound('select');
        let pl = store.musicPlaylists.find((p) => p.name === 'Pendrive USB') || store.musicPlaylists[0];
        if (!pl) {
          const id = `pl_usb_${Date.now().toString(36)}`;
          pl = { id, name: 'Pendrive USB', tracks: [] };
          store.musicPlaylists.push(pl);
        }
        store.activeMusicPlId = pl.id;
        let track = pl.tracks.find((t) => t.usbRelPath === entry.relPath);
        if (!track) {
          const guessed = guessTitleArtistFromFilename(entry.name);
          track = {
            id: `usb_trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            usbRelPath: entry.relPath,
            rawFilename: entry.name,
            title: guessed.title || entry.name.replace(/\.[^.]+$/, ''),
            artist: guessed.artist || 'Pendrive USB',
            album: exploreDriveLabel,
            embeddedCover: '',
            onlineCover: '',
            duration: 0,
            durationVerified: false,
            streamUrl,
            lyricsOffsetSec: 0
          };
          pl.tracks.push(track);
        } else {
          track.streamUrl = `${streamUrl}&t=${Date.now()}`;
        }
        currentTrack = track;
        store.mode = 'music';
        drawerOpen = false;
        toggleDrawer(false);
        saveStore(store);
        document.getElementById('mp-tab-music')?.classList.add('active');
        document.getElementById('mp-tab-video')?.classList.remove('active');
        document.getElementById('mp-tab-explore')?.classList.remove('active');
        await playMusicTrack(track);
        return;
      }

      if (entry.kind === 'video') {
        playUiSound('select');
        let vpl = store.videoPlaylists.find((p) => p.name === 'Pendrive USB') || store.videoPlaylists[0];
        if (!vpl) {
          const id = `vpl_usb_${Date.now().toString(36)}`;
          vpl = { id, name: 'Pendrive USB', episodes: [] };
          store.videoPlaylists.push(vpl);
        }
        store.activeVideoPlId = vpl.id;
        let ep = vpl.episodes.find((e) => e.usbRelPath === entry.relPath);
        if (!ep) {
          ep = {
            id: `usb_ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            usbRelPath: entry.relPath,
            title: entry.name.replace(/\.[^.]+$/, ''),
            watched: false,
            duration: 0,
            lastPos: 0,
            subName: '',
            subCues: [],
            streamUrl: `${streamUrl}&t=${Date.now()}`
          };
          vpl.episodes.push(ep);
        } else {
          ep.streamUrl = `${streamUrl}&t=${Date.now()}`;
        }
        currentEpisode = ep;
        store.mode = 'video';
        drawerOpen = false;
        toggleDrawer(false);
        saveStore(store);
        document.getElementById('mp-tab-music')?.classList.remove('active');
        document.getElementById('mp-tab-video')?.classList.add('active');
        document.getElementById('mp-tab-explore')?.classList.remove('active');
        renderDrawer();
        renderVideoWorkspace(true);
        return;
      }

      // Para imagens, textos ou outros arquivos: abre Visualização Rápida
      openQuickLookModal(entry);
    }

    async function pasteUsbClipboard(targetDir = exploreCurPath) {
      if (!usbClipboard) return showToast('Área de transferência vazia');
      try {
        showToast(usbClipboard.mode === 'cut' ? 'Movendo item…' : 'Copiando item…');
        const res = await fetch('/api/usb/paste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath: usbClipboard.relPath,
            targetDir,
            mode: usbClipboard.mode
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao colar');
        if (usbClipboard.mode === 'cut') usbClipboard = null;
        playUiSound('select');
        showToast(`Salvo: ${data.name}`);
        await loadExploreDirectory(exploreCurPath, false);
      } catch (err) {
        showToast(err.message || 'Erro ao colar arquivo');
      }
    }

    function openQuickLookModal(entry) {
      if (!entry) return;
      if (entry.isDir) {
        openUsbEntry(entry);
        return;
      }
      document.getElementById('mp-inline-modal')?.remove();
      audioEl.pause();
      const streamUrl = `/api/usb/stream?path=${encodeURIComponent(entry.relPath)}&t=${Date.now()}`;
      const isVideo = entry.kind === 'video';
      const isAudio = entry.kind === 'audio';
      const isImage = entry.kind === 'image';

      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <div class="mp-modal-card mp-modal-wide">
          <div class="mp-modal-head-row">
            <div class="mp-modal-head-title">
              <span class="mp-modal-title-icon">${SVG.eye}</span>
              <div>
                <h3>Visualização Rápida — ${escHtml(entry.name)}</h3>
                <small>${escHtml(getEntryTypeBadge(entry))} • ${formatFileSize(entry.size)}</small>
              </div>
            </div>
            <button type="button" class="mp-icon-pill" id="mp-ql-close" title="Fechar">${SVG.close}</button>
          </div>

          <div class="mp-ql-stage">
            ${isVideo ? `
              <video id="mp-ql-video" class="mp-ql-video" src="${escHtml(streamUrl)}" controls autoplay playsinline></video>
            ` : isAudio ? `
              <div class="mp-ql-audio-box">
                <div class="mp-ql-audio-icon">${SVG.fileAudio}</div>
                <strong>${escHtml(entry.name)}</strong>
                <audio id="mp-ql-audio" src="${escHtml(streamUrl)}" controls autoplay style="width:100%;max-width:460px;margin-top:10px;"></audio>
              </div>
            ` : isImage ? `
              <img src="${escHtml(streamUrl)}" alt="${escHtml(entry.name)}" class="mp-ql-image" />
            ` : `
              <div class="mp-ql-audio-box">
                <div class="mp-ql-audio-icon">${SVG.file}</div>
                <strong>${escHtml(entry.name)}</strong>
                <p style="color:var(--text-secondary);font-size:0.86rem;">Arquivo no pendrive (${formatFileSize(entry.size)})</p>
              </div>
            `}
          </div>

          ${isVideo ? `
            <div class="mp-ql-editor">
              <div class="mp-ql-editor-head">
                <div class="mp-ql-editor-title">
                  ${SVG.scissors}
                  <strong>Editor Rápido de Vídeo (Cortar Trecho &amp; Acelerar Partes)</strong>
                </div>
                <span id="mp-ql-preview-badge" class="mp-ql-badge">Velocidade: 1x</span>
              </div>

              <div class="mp-ql-grid">
                <div class="mp-ql-panel">
                  <div class="mp-ql-panel-label">1. Cortar Vídeo (Início e Fim do Vídeo)</div>
                  <div class="mp-ql-trim-row">
                    <label>
                      <span>Início (s)</span>
                      <div class="mp-ql-inp-group">
                        <input id="mp-ql-trim-start" type="number" min="0" step="0.1" value="0" class="shows-search-input" />
                        <button type="button" id="mp-ql-mark-start" class="mp-pill-btn mp-pill-sm" title="Usar o segundo atual do vídeo">Atual</button>
                      </div>
                    </label>
                    <label>
                      <span>Fim (s)</span>
                      <div class="mp-ql-inp-group">
                        <input id="mp-ql-trim-end" type="number" min="0" step="0.1" value="10" class="shows-search-input" />
                        <button type="button" id="mp-ql-mark-end" class="mp-pill-btn mp-pill-sm" title="Usar o segundo atual do vídeo">Atual</button>
                      </div>
                    </label>
                  </div>
                </div>

                <div class="mp-ql-panel">
                  <div class="mp-ql-panel-label">2. Acelerar Partes ou Mudar Velocidade</div>
                  <div class="mp-ql-speed-pills" id="mp-ql-speed-pills">
                    ${[0.5, 1, 1.25, 1.5, 2, 3, 4].map((spd) => `
                      <button type="button" class="mp-speed-chip ${spd === 1 ? 'active' : ''}" data-ql-spd="${spd}">${spd}x</button>
                    `).join('')}
                  </div>
                  <label class="mp-ql-seg-toggle">
                    <input type="checkbox" id="mp-ql-seg-mode" />
                    <span>Acelerar apenas uma parte específica (manter o resto em 1x)</span>
                  </label>
                  <div id="mp-ql-seg-row" class="mp-ql-trim-row hidden">
                    <label>
                      <span>Início da parte rápida (s)</span>
                      <div class="mp-ql-inp-group">
                        <input id="mp-ql-seg-start" type="number" min="0" step="0.1" value="2" class="shows-search-input" />
                        <button type="button" id="mp-ql-mark-seg-s" class="mp-pill-btn mp-pill-sm">Atual</button>
                      </div>
                    </label>
                    <label>
                      <span>Fim da parte rápida (s)</span>
                      <div class="mp-ql-inp-group">
                        <input id="mp-ql-seg-end" type="number" min="0" step="0.1" value="6" class="shows-search-input" />
                        <button type="button" id="mp-ql-mark-seg-e" class="mp-pill-btn mp-pill-sm">Atual</button>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <div id="mp-ql-status" class="mp-ql-status"></div>
            </div>
          ` : ''}

          <div class="mp-modal-actions">
            <button type="button" class="mp-pill-btn" id="mp-ql-cancel">Fechar</button>
            ${(isAudio || isVideo) ? `
              <button type="button" class="mp-pill-btn" id="mp-ql-open-main">${SVG.play}<span>Abrir no Player Principal</span></button>
            ` : ''}
            ${isVideo ? `
              <button type="button" class="btn-prism" id="mp-ql-save-edit" style="height:40px;padding:0 20px;">${SVG.check}<span>Salvar Vídeo Editado no Pendrive</span></button>
            ` : ''}
          </div>
        </div>
      `;

      shellEl?.appendChild(overlay);

      const closeModal = () => {
        overlay.querySelector('video')?.pause();
        overlay.querySelector('audio')?.pause();
        overlay.remove();
      };

      overlay.querySelector('#mp-ql-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#mp-ql-cancel')?.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
      overlay.querySelector('#mp-ql-open-main')?.addEventListener('click', () => {
        closeModal();
        openUsbEntry(entry);
      });

      if (isVideo) {
        const vid = overlay.querySelector('#mp-ql-video');
        const trimStartInp = overlay.querySelector('#mp-ql-trim-start');
        const trimEndInp = overlay.querySelector('#mp-ql-trim-end');
        const segModeCb = overlay.querySelector('#mp-ql-seg-mode');
        const segRow = overlay.querySelector('#mp-ql-seg-row');
        const segStartInp = overlay.querySelector('#mp-ql-seg-start');
        const segEndInp = overlay.querySelector('#mp-ql-seg-end');
        const badgeEl = overlay.querySelector('#mp-ql-preview-badge');
        const statusEl = overlay.querySelector('#mp-ql-status');
        const saveBtn = overlay.querySelector('#mp-ql-save-edit');
        let chosenSpeed = 1;

        if (vid) {
          vid.play().catch(() => {
            vid.muted = true;
            vid.play().catch(() => { });
          });
          setTimeout(() => {
            if (document.body.contains(vid) && !vid.paused && vid.currentTime === 0 && !vid.muted) {
              vid.muted = true;
              vid.play().catch(() => { });
            }
          }, 500);
        }

        vid?.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(vid.duration) && vid.duration > 0) {
            const d = Math.round(vid.duration * 10) / 10;
            trimEndInp.value = String(d);
            segStartInp.value = String(Math.round(d * 0.25 * 10) / 10);
            segEndInp.value = String(Math.round(d * 0.75 * 10) / 10);
          }
        });

        vid?.addEventListener('timeupdate', () => {
          const t = vid.currentTime || 0;
          const isEditingTrim = document.activeElement === trimStartInp || document.activeElement === trimEndInp;
          if (!isEditingTrim) {
            const ts = Math.max(0, Number(trimStartInp.value) || 0);
            const rawTe = Number(trimEndInp.value);
            const te = rawTe > ts + 0.3 ? rawTe : (vid.duration || 0);
            if (t < ts) vid.currentTime = ts;
            if (te > ts + 0.3 && t > te) {
              vid.currentTime = ts;
            }
          }
          if (segModeCb?.checked && chosenSpeed !== 1) {
            const ss = Number(segStartInp.value) || 0;
            const se = Number(segEndInp.value) || 0;
            const inSeg = t >= ss && t <= se;
            const targetRate = inSeg ? chosenSpeed : 1;
            if (vid.playbackRate !== targetRate) vid.playbackRate = targetRate;
            if (badgeEl) badgeEl.textContent = inSeg ? `Acelerando Trecho (${chosenSpeed}x)` : 'Velocidade Normal (1x)';
          } else {
            if (vid.playbackRate !== chosenSpeed) vid.playbackRate = chosenSpeed;
            if (badgeEl) badgeEl.textContent = `Velocidade: ${chosenSpeed}x`;
          }
        });

        overlay.querySelector('#mp-ql-mark-start')?.addEventListener('click', () => {
          if (vid) trimStartInp.value = String(Math.round(vid.currentTime * 10) / 10);
        });
        overlay.querySelector('#mp-ql-mark-end')?.addEventListener('click', () => {
          if (vid) trimEndInp.value = String(Math.round(vid.currentTime * 10) / 10);
        });
        overlay.querySelector('#mp-ql-mark-seg-s')?.addEventListener('click', () => {
          if (vid) segStartInp.value = String(Math.round(vid.currentTime * 10) / 10);
        });
        overlay.querySelector('#mp-ql-mark-seg-e')?.addEventListener('click', () => {
          if (vid) segEndInp.value = String(Math.round(vid.currentTime * 10) / 10);
        });

        segModeCb?.addEventListener('change', () => {
          segRow?.classList.toggle('hidden', !segModeCb.checked);
        });

        overlay.querySelectorAll('[data-ql-spd]').forEach((btn) => {
          btn.addEventListener('click', () => {
            chosenSpeed = Number(btn.dataset.qlSpd) || 1;
            overlay.querySelectorAll('[data-ql-spd]').forEach((b) => b.classList.toggle('active', b === btn));
            if (vid && !segModeCb?.checked) vid.playbackRate = chosenSpeed;
            if (badgeEl) badgeEl.textContent = `Velocidade: ${chosenSpeed}x`;
          });
        });

        saveBtn?.addEventListener('click', async () => {
          const trimStart = Math.max(0, Number(trimStartInp.value) || 0);
          const trimEnd = Math.max(trimStart + 0.2, Number(trimEndInp.value) || 0);
          const payload = {
            path: entry.relPath,
            action: 'edit',
            trimStart,
            trimEnd,
            speed: chosenSpeed
          };
          if (segModeCb?.checked && chosenSpeed !== 1) {
            payload.segStart = Number(segStartInp.value) || 0;
            payload.segEnd = Number(segEndInp.value) || 0;
          }
          saveBtn.disabled = true;
          if (statusEl) statusEl.textContent = 'Processando corte e velocidade com FFmpeg no pendrive…';
          try {
            const res = await fetch('/api/usb/video-transform', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao salvar vídeo editado');
            playUiSound('select');
            showToast(`Vídeo salvo: ${data.name}`);
            closeModal();
            await loadExploreDirectory(exploreCurPath, false);
          } catch (err) {
            if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
            saveBtn.disabled = false;
          }
        });
      }
    }

    function openConvertModal(entry) {
      if (!entry || (entry.kind !== 'audio' && entry.kind !== 'video')) {
        return showToast('A conversão está disponível apenas para arquivos de música e vídeo.');
      }
      document.getElementById('mp-inline-modal')?.remove();
      const isVideo = entry.kind === 'video';
      const curExt = (entry.ext || '').replace(/^\./, '').toLowerCase();
      const formats = isVideo
        ? [
          { ext: 'mp4', label: '.MP4 (H.264 + AAC Universal)' },
          { ext: 'mov', label: '.MOV (Apple QuickTime)' },
          { ext: 'mkv', label: '.MKV (Matroska Vídeo)' },
          { ext: 'webm', label: '.WEBM (VP9 + Opus Web)' },
          { ext: 'avi', label: '.AVI (MPEG-4 Clássico)' }
        ]
        : [
          { ext: 'mp3', label: '.MP3 (Áudio Universal 192 kbps)' },
          { ext: 'ogg', label: '.OGG (Vorbis Alta Eficiência)' },
          { ext: 'wav', label: '.WAV (PCM Sem Perdas)' },
          { ext: 'flac', label: '.FLAC (Studio Lossless)' },
          { ext: 'm4a', label: '.M4A (AAC Apple Audio)' },
          { ext: 'aac', label: '.AAC (Advanced Audio Coding)' }
        ];
      const available = formats.filter((f) => f.ext !== curExt);
      let pickedFmt = available[0]?.ext || formats[0].ext;

      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <div class="mp-modal-card">
          <div class="mp-modal-head-row">
            <div class="mp-modal-head-title">
              <span class="mp-modal-title-icon">${SVG.convert}</span>
              <div>
                <h3>Converter Formato</h3>
                <small>Origem: ${escHtml(entry.name)}</small>
              </div>
            </div>
            <button type="button" class="mp-icon-pill" id="mp-conv-close">${SVG.close}</button>
          </div>

          <div class="mp-format-list">
            ${available.map((f, i) => `
              <button type="button" class="mp-format-option ${i === 0 ? 'active' : ''}" data-conv-fmt="${f.ext}">
                <strong>.${f.ext.toUpperCase()}</strong>
                <span>${escHtml(f.label)}</span>
              </button>
            `).join('')}
          </div>

          <div id="mp-conv-status" class="mp-ql-status"></div>

          <div class="mp-modal-actions">
            <button type="button" class="mp-pill-btn" id="mp-conv-cancel">Cancelar</button>
            <button type="button" class="btn-prism" id="mp-conv-go" style="height:40px;padding:0 20px;">${SVG.convert}<span>Converter Agora</span></button>
          </div>
        </div>
      `;
      shellEl?.appendChild(overlay);

      overlay.querySelector('#mp-conv-close')?.addEventListener('click', () => overlay.remove());
      overlay.querySelector('#mp-conv-cancel')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelectorAll('[data-conv-fmt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickedFmt = btn.dataset.convFmt;
          overlay.querySelectorAll('[data-conv-fmt]').forEach((b) => b.classList.toggle('active', b === btn));
        });
      });

      const goBtn = overlay.querySelector('#mp-conv-go');
      const statusEl = overlay.querySelector('#mp-conv-status');
      goBtn?.addEventListener('click', async () => {
        goBtn.disabled = true;
        if (statusEl) statusEl.textContent = `Convertendo para .${pickedFmt.toUpperCase()} no pendrive…`;
        try {
          const res = await fetch('/api/usb/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: entry.relPath, targetFormat: pickedFmt })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Falha na conversão');
          playUiSound('select');
          showToast(`Convertido: ${data.name}`);
          overlay.remove();
          await loadExploreDirectory(exploreCurPath, false);
        } catch (err) {
          if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
          goBtn.disabled = false;
        }
      });
    }

    function openRotateVideoModal(entry) {
      if (!entry || entry.kind !== 'video') return;
      document.getElementById('mp-inline-modal')?.remove();
      const streamUrl = `/api/usb/stream?path=${encodeURIComponent(entry.relPath)}&t=${Date.now()}`;
      let pickedRot = '90cw';

      const rotOptions = [
        { id: '90cw', label: 'Girar 90° Horário (Direita)', css: 'rotate(90deg) scale(0.75)' },
        { id: '90ccw', label: 'Girar 90° Anti-horário (Esquerda)', css: 'rotate(-90deg) scale(0.75)' },
        { id: '180', label: 'Girar 180° (Ponta-Cabeça)', css: 'rotate(180deg)' },
        { id: 'hflip', label: 'Espelhar Horizontalmente', css: 'scaleX(-1)' },
        { id: 'vflip', label: 'Espelhar Verticalmente', css: 'scaleY(-1)' }
      ];

      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <div class="mp-modal-card mp-modal-wide">
          <div class="mp-modal-head-row">
            <div class="mp-modal-head-title">
              <span class="mp-modal-title-icon">${SVG.rotateCw}</span>
              <div>
                <h3>Girar Vídeo — ${escHtml(entry.name)}</h3>
                <small>Escolha a orientação e salve uma nova cópia no pendrive</small>
              </div>
            </div>
            <button type="button" class="mp-icon-pill" id="mp-rot-close">${SVG.close}</button>
          </div>

          <div class="mp-ql-stage" style="overflow:hidden;">
            <video id="mp-rot-video" class="mp-ql-video" src="${escHtml(streamUrl)}" autoplay loop muted playsinline style="transition:transform 0.28s ease;transform:rotate(90deg) scale(0.75);"></video>
          </div>

          <div class="mp-format-list">
            ${rotOptions.map((o, i) => `
              <button type="button" class="mp-format-option ${i === 0 ? 'active' : ''}" data-rot-id="${o.id}" data-rot-css="${o.css}">
                <strong>${escHtml(o.label)}</strong>
              </button>
            `).join('')}
          </div>

          <div id="mp-rot-status" class="mp-ql-status"></div>

          <div class="mp-modal-actions">
            <button type="button" class="mp-pill-btn" id="mp-rot-cancel">Cancelar</button>
            <button type="button" class="btn-prism" id="mp-rot-go" style="height:40px;padding:0 20px;">${SVG.rotateCw}<span>Salvar Vídeo Girado</span></button>
          </div>
        </div>
      `;
      shellEl?.appendChild(overlay);

      const closeModal = () => {
        overlay.querySelector('video')?.pause();
        overlay.remove();
      };
      overlay.querySelector('#mp-rot-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#mp-rot-cancel')?.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

      const vid = overlay.querySelector('#mp-rot-video');
      overlay.querySelectorAll('[data-rot-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickedRot = btn.dataset.rotId;
          overlay.querySelectorAll('[data-rot-id]').forEach((b) => b.classList.toggle('active', b === btn));
          if (vid) vid.style.transform = btn.dataset.rotCss || '';
        });
      });

      const goBtn = overlay.querySelector('#mp-rot-go');
      const statusEl = overlay.querySelector('#mp-rot-status');
      goBtn?.addEventListener('click', async () => {
        goBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Girando vídeo com FFmpeg no pendrive…';
        try {
          const res = await fetch('/api/usb/video-transform', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: entry.relPath, action: 'rotate', rotation: pickedRot })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao girar vídeo');
          playUiSound('select');
          showToast(`Vídeo girado salvo: ${data.name}`);
          closeModal();
          await loadExploreDirectory(exploreCurPath, false);
        } catch (err) {
          if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
          goBtn.disabled = false;
        }
      });
    }

    function openCropVideoModal(entry) {
      if (!entry || entry.kind !== 'video') return;
      document.getElementById('mp-inline-modal')?.remove();
      const streamUrl = `/api/usb/stream?path=${encodeURIComponent(entry.relPath)}&t=${Date.now()}`;
      let cropState = { x: 10, y: 10, w: 80, h: 80 };

      const presets = [
        { label: 'Central 80%', x: 10, y: 10, w: 80, h: 80 },
        { label: 'Central 60% (Zoom)', x: 20, y: 20, w: 60, h: 60 },
        { label: 'Vertical 9:16 (Reels/Shorts)', x: 34, y: 0, w: 32, h: 100 },
        { label: 'Quadrado 1:1', x: 22, y: 0, w: 56, h: 100 },
        { label: 'Cinema 21:9', x: 0, y: 12, w: 100, h: 76 },
        { label: 'Clássico 4:3', x: 12, y: 0, w: 76, h: 100 }
      ];

      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <div class="mp-modal-card mp-modal-wide">
          <div class="mp-modal-head-row">
            <div class="mp-modal-head-title">
              <span class="mp-modal-title-icon">${SVG.crop}</span>
              <div>
                <h3>Recortar Tela do Vídeo — ${escHtml(entry.name)}</h3>
                <small>Recorte a área visível do quadro para deixar a tela menor ou mudar a proporção</small>
              </div>
            </div>
            <button type="button" class="mp-icon-pill" id="mp-crop-close">${SVG.close}</button>
          </div>

          <div class="mp-crop-stage-wrap">
            <div class="mp-crop-video-container">
              <video id="mp-crop-video" class="mp-ql-video" src="${escHtml(streamUrl)}" autoplay loop muted playsinline></video>
              <div id="mp-crop-box" class="mp-crop-box">
                <span id="mp-crop-box-label" class="mp-crop-box-label">80% × 80%</span>
              </div>
            </div>
          </div>

          <div class="mp-ql-speed-pills" style="margin:10px 0;">
            ${presets.map((p, i) => `
              <button type="button" class="mp-speed-chip ${i === 0 ? 'active' : ''}" data-crop-preset="${i}">${escHtml(p.label)}</button>
            `).join('')}
          </div>

          <div class="mp-crop-sliders-grid">
            <label>
              <span>Largura da Tela (<strong id="mp-lbl-cw">80%</strong>)</span>
              <input id="mp-inp-cw" type="range" min="20" max="100" value="80" class="mp-range" />
            </label>
            <label>
              <span>Altura da Tela (<strong id="mp-lbl-ch">80%</strong>)</span>
              <input id="mp-inp-ch" type="range" min="20" max="100" value="80" class="mp-range" />
            </label>
            <label>
              <span>Posição Horizontal X (<strong id="mp-lbl-cx">10%</strong>)</span>
              <input id="mp-inp-cx" type="range" min="0" max="80" value="10" class="mp-range" />
            </label>
            <label>
              <span>Posição Vertical Y (<strong id="mp-lbl-cy">10%</strong>)</span>
              <input id="mp-inp-cy" type="range" min="0" max="80" value="10" class="mp-range" />
            </label>
          </div>

          <div id="mp-crop-status" class="mp-ql-status"></div>

          <div class="mp-modal-actions">
            <button type="button" class="mp-pill-btn" id="mp-crop-cancel">Cancelar</button>
            <button type="button" class="btn-prism" id="mp-crop-go" style="height:40px;padding:0 20px;">${SVG.crop}<span>Salvar Vídeo Recortado</span></button>
          </div>
        </div>
      `;
      shellEl?.appendChild(overlay);

      const closeModal = () => {
        overlay.querySelector('video')?.pause();
        overlay.remove();
      };
      overlay.querySelector('#mp-crop-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#mp-crop-cancel')?.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

      const cropBox = overlay.querySelector('#mp-crop-box');
      const cropBoxLbl = overlay.querySelector('#mp-crop-box-label');
      const inpW = overlay.querySelector('#mp-inp-cw');
      const inpH = overlay.querySelector('#mp-inp-ch');
      const inpX = overlay.querySelector('#mp-inp-cx');
      const inpY = overlay.querySelector('#mp-inp-cy');

      const syncCropUi = () => {
        cropState.w = Math.max(20, Math.min(100, Number(inpW.value) || 80));
        cropState.h = Math.max(20, Math.min(100, Number(inpH.value) || 80));
        cropState.x = Math.max(0, Math.min(100 - cropState.w, Number(inpX.value) || 0));
        cropState.y = Math.max(0, Math.min(100 - cropState.h, Number(inpY.value) || 0));
        inpX.value = String(cropState.x);
        inpY.value = String(cropState.y);
        overlay.querySelector('#mp-lbl-cw').textContent = `${cropState.w}%`;
        overlay.querySelector('#mp-lbl-ch').textContent = `${cropState.h}%`;
        overlay.querySelector('#mp-lbl-cx').textContent = `${cropState.x}%`;
        overlay.querySelector('#mp-lbl-cy').textContent = `${cropState.y}%`;
        if (cropBox) {
          cropBox.style.left = `${cropState.x}%`;
          cropBox.style.top = `${cropState.y}%`;
          cropBox.style.width = `${cropState.w}%`;
          cropBox.style.height = `${cropState.h}%`;
        }
        if (cropBoxLbl) cropBoxLbl.textContent = `${cropState.w}% × ${cropState.h}%`;
      };

      [inpW, inpH, inpX, inpY].forEach((el) => el?.addEventListener('input', syncCropUi));
      overlay.querySelectorAll('[data-crop-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = presets[Number(btn.dataset.cropPreset)];
          if (!p) return;
          overlay.querySelectorAll('[data-crop-preset]').forEach((b) => b.classList.toggle('active', b === btn));
          inpW.value = String(p.w);
          inpH.value = String(p.h);
          inpX.value = String(p.x);
          inpY.value = String(p.y);
          syncCropUi();
        });
      });
      syncCropUi();

      const goBtn = overlay.querySelector('#mp-crop-go');
      const statusEl = overlay.querySelector('#mp-crop-status');
      goBtn?.addEventListener('click', async () => {
        goBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Recortando quadro do vídeo com FFmpeg no pendrive…';
        try {
          const res = await fetch('/api/usb/video-transform', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: entry.relPath,
              action: 'crop',
              cropX: cropState.x,
              cropY: cropState.y,
              cropW: cropState.w,
              cropH: cropState.h
            })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao recortar vídeo');
          playUiSound('select');
          showToast(`Vídeo recortado salvo: ${data.name}`);
          closeModal();
          await loadExploreDirectory(exploreCurPath, false);
        } catch (err) {
          if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
          goBtn.disabled = false;
        }
      });
    }

    function openExtractAudioModal(entry) {
      if (!entry || entry.kind !== 'video') return;
      document.getElementById('mp-inline-modal')?.remove();
      const formats = [
        { ext: 'mp3', label: '.MP3 (Áudio Universal 192 kbps)' },
        { ext: 'm4a', label: '.M4A (AAC Alta Qualidade)' },
        { ext: 'wav', label: '.WAV (PCM Sem Perdas)' },
        { ext: 'ogg', label: '.OGG (Vorbis Compacto)' },
        { ext: 'flac', label: '.FLAC (Lossless Studio)' }
      ];
      let pickedFmt = 'mp3';

      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <div class="mp-modal-card">
          <div class="mp-modal-head-row">
            <div class="mp-modal-head-title">
              <span class="mp-modal-title-icon">${SVG.extractAudio}</span>
              <div>
                <h3>Extrair Áudio do Vídeo</h3>
                <small>Salvar o áudio de "${escHtml(entry.name)}" em um arquivo separado</small>
              </div>
            </div>
            <button type="button" class="mp-icon-pill" id="mp-ext-close">${SVG.close}</button>
          </div>

          <div class="mp-format-list">
            ${formats.map((f, i) => `
              <button type="button" class="mp-format-option ${i === 0 ? 'active' : ''}" data-ext-fmt="${f.ext}">
                <strong>.${f.ext.toUpperCase()}</strong>
                <span>${escHtml(f.label)}</span>
              </button>
            `).join('')}
          </div>

          <div id="mp-ext-status" class="mp-ql-status"></div>

          <div class="mp-modal-actions">
            <button type="button" class="mp-pill-btn" id="mp-ext-cancel">Cancelar</button>
            <button type="button" class="btn-prism" id="mp-ext-go" style="height:40px;padding:0 20px;">${SVG.extractAudio}<span>Extrair Áudio Agora</span></button>
          </div>
        </div>
      `;
      shellEl?.appendChild(overlay);

      overlay.querySelector('#mp-ext-close')?.addEventListener('click', () => overlay.remove());
      overlay.querySelector('#mp-ext-cancel')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelectorAll('[data-ext-fmt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickedFmt = btn.dataset.extFmt;
          overlay.querySelectorAll('[data-ext-fmt]').forEach((b) => b.classList.toggle('active', b === btn));
        });
      });

      const goBtn = overlay.querySelector('#mp-ext-go');
      const statusEl = overlay.querySelector('#mp-ext-status');
      goBtn?.addEventListener('click', async () => {
        goBtn.disabled = true;
        if (statusEl) statusEl.textContent = `Extraindo faixa de áudio em .${pickedFmt.toUpperCase()}…`;
        try {
          const res = await fetch('/api/usb/video-transform', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: entry.relPath, action: 'extract-audio', audioFormat: pickedFmt })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao extrair áudio');
          playUiSound('select');
          showToast(`Áudio extraído: ${data.name}`);
          overlay.remove();
          await loadExploreDirectory(exploreCurPath, false);
        } catch (err) {
          if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
          goBtn.disabled = false;
        }
      });
    }

    async function openPropertiesModal(entry) {
      if (!entry) return;
      document.getElementById('mp-inline-modal')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'mp-inline-modal';
      overlay.className = 'mp-modal-backdrop';
      overlay.innerHTML = `
        <div class="mp-modal-card">
          <div class="mp-modal-head-row">
            <div class="mp-modal-head-title">
              <span class="mp-modal-title-icon">${SVG.info}</span>
              <div>
                <h3>Propriedades</h3>
                <small>${escHtml(entry.name)}</small>
              </div>
            </div>
            <button type="button" class="mp-icon-pill" id="mp-prop-close">${SVG.close}</button>
          </div>
          <div id="mp-prop-body" class="mp-prop-grid">
            <div style="padding:14px;color:var(--text-secondary);">Lendo metadados do arquivo no pendrive…</div>
          </div>
          <div class="mp-modal-actions">
            <button type="button" class="btn-prism" id="mp-prop-ok" style="height:38px;padding:0 20px;">Fechar</button>
          </div>
        </div>
      `;
      shellEl?.appendChild(overlay);
      overlay.querySelector('#mp-prop-close')?.addEventListener('click', () => overlay.remove());
      overlay.querySelector('#mp-prop-ok')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      try {
        const res = await fetch(`/api/usb/properties?path=${encodeURIComponent(entry.relPath)}`);
        const d = await res.json();
        const bodyEl = overlay.querySelector('#mp-prop-body');
        if (!bodyEl) return;
        if (!res.ok || !d.ok) throw new Error(d.error || 'Erro ao obter propriedades');
        const rows = [
          ['Nome', d.name],
          ['Tipo', getEntryTypeBadge(entry)],
          ['Local no Pendrive', `/${d.relPath}`],
          ['Tamanho', d.isDir ? `${d.childCount ?? d.itemCount ?? 0} itens (${formatFileSize(d.size)})` : `${formatFileSize(d.size)} (${Number(d.size).toLocaleString('pt-BR')} bytes)`],
          ['Modificado em', new Date(d.mtimeMs).toLocaleString('pt-BR')]
        ];
        if (d.mediaInfo) {
          if (d.mediaInfo.duration > 0) rows.push(['Duração', fmtTime(d.mediaInfo.duration)]);
          if (d.mediaInfo.width && d.mediaInfo.height) rows.push(['Resolução de Vídeo', `${d.mediaInfo.width} × ${d.mediaInfo.height}${d.mediaInfo.fps ? ` (${d.mediaInfo.fps} fps)` : ''}`]);
          if (d.mediaInfo.videoCodec) rows.push(['Codec de Vídeo', d.mediaInfo.videoCodec.toUpperCase()]);
          if (d.mediaInfo.audioCodec) rows.push(['Codec de Áudio', `${d.mediaInfo.audioCodec.toUpperCase()}${d.mediaInfo.sampleRate ? ` • ${d.mediaInfo.sampleRate} Hz` : ''}`]);
          if (d.mediaInfo.bitrate > 0) rows.push(['Taxa de Bits', `${Math.round(d.mediaInfo.bitrate / 1000)} kbps`]);
        }
        bodyEl.innerHTML = rows.map(([k, v]) => `
          <div class="mp-prop-row">
            <span>${escHtml(k)}</span>
            <strong>${escHtml(String(v))}</strong>
          </div>
        `).join('');
      } catch (err) {
        const bodyEl = overlay.querySelector('#mp-prop-body');
        if (bodyEl) bodyEl.innerHTML = `<div style="padding:14px;color:#f87171;">${escHtml(err.message)}</div>`;
      }
    }

    function openUsbContextMenu(entry, clientX, clientY) {
      closeUsbContextMenu();
      const menu = document.createElement('div');
      menu.id = 'mp-usb-ctx-menu';
      menu.className = 'mp-usb-ctx-menu';

      const isMedia = entry && (entry.kind === 'audio' || entry.kind === 'video');
      const isVideo = entry && entry.kind === 'video';
      const hasClip = Boolean(usbClipboard);

      const items = [];
      if (entry) {
        items.push(
          { id: 'open', icon: entry.isDir ? SVG.folderOpen : SVG.play, label: entry.isDir ? 'Abrir Pasta' : 'Abrir e Reproduzir' },
          { id: 'quicklook', icon: SVG.eye, label: isVideo ? 'Visualização Rápida & Editor' : 'Visualização Rápida' }
        );
        if (isMedia) {
          items.push({ divider: true });
          items.push({ id: 'convert', icon: SVG.convert, label: 'Converter Formato…' });
        }
        if (isVideo) {
          items.push(
            { id: 'rotate', icon: SVG.rotateCw, label: 'Girar Vídeo…' },
            { id: 'crop', icon: SVG.crop, label: 'Recortar Vídeo (Tela Menor)…' },
            { id: 'extract-audio', icon: SVG.extractAudio, label: 'Extrair Áudio em Arquivo…' }
          );
        }
        items.push(
          { divider: true },
          { id: 'rename', icon: SVG.rename, label: 'Renomear' },
          { id: 'duplicate', icon: SVG.duplicate, label: 'Duplicar' },
          { id: 'copy', icon: SVG.copy, label: 'Copiar' },
          { id: 'cut', icon: SVG.scissors, label: 'Recortar' }
        );
        if (hasClip) {
          items.push({ id: 'paste', icon: SVG.paste, label: `Colar (${usbClipboard.name})` });
        }
        items.push(
          { divider: true },
          { id: 'properties', icon: SVG.info, label: 'Propriedades' },
          { id: 'delete', icon: SVG.trash, label: 'Deletar', danger: true }
        );
      } else {
        items.push(
          { id: 'new-folder', icon: SVG.folderPlus, label: 'Nova Pasta' },
          { id: 'paste', icon: SVG.paste, label: hasClip ? `Colar Aqui (${usbClipboard.name})` : 'Colar Aqui', disabled: !hasClip },
          { id: 'refresh', icon: SVG.convert, label: 'Atualizar Pendrive' }
        );
      }

      menu.innerHTML = items.map((it) => {
        if (it.divider) return `<div class="mp-usb-ctx-divider" role="separator"></div>`;
        return `
          <button type="button" class="mp-usb-ctx-item ${it.danger ? 'is-danger' : ''}" data-ctx-act="${it.id}" ${it.disabled ? 'disabled' : ''}>
            <span class="mp-usb-ctx-icon">${it.icon}</span>
            <span class="mp-usb-ctx-label">${escHtml(it.label)}</span>
          </button>
        `;
      }).join('');

      shellEl?.appendChild(menu);

      // Keep menu inside viewport bounds
      const shellRect = shellEl.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      let left = clientX - shellRect.left;
      let top = clientY - shellRect.top;
      if (left + menuRect.width > shellRect.width - 16) left = Math.max(16, shellRect.width - menuRect.width - 16);
      if (top + menuRect.height > shellRect.height - 16) top = Math.max(16, shellRect.height - menuRect.height - 16);
      menu.style.left = `${Math.max(12, left)}px`;
      menu.style.top = `${Math.max(12, top)}px`;

      menu.querySelectorAll('[data-ctx-act]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.ctxAct;
          closeUsbContextMenu();
          if (act === 'open') {
            await openUsbEntry(entry);
          } else if (act === 'quicklook') {
            openQuickLookModal(entry);
          } else if (act === 'convert') {
            openConvertModal(entry);
          } else if (act === 'rotate') {
            openRotateVideoModal(entry);
          } else if (act === 'crop') {
            openCropVideoModal(entry);
          } else if (act === 'extract-audio') {
            openExtractAudioModal(entry);
          } else if (act === 'rename') {
            const origExt = entry.isDir ? '' : (entry.name.lastIndexOf('.') > 0 ? entry.name.slice(entry.name.lastIndexOf('.')) : '');
            const baseName = origExt ? entry.name.slice(0, entry.name.length - origExt.length) : entry.name;
            openPromptModal({
              title: 'Renomear no Pendrive',
              confirmLabel: 'Renomear',
              fields: [{
                name: 'newName',
                label: origExt ? `Novo nome (${origExt} será preservado)` : 'Novo nome',
                value: baseName,
                required: true
              }],
              onConfirm: async ({ newName }) => {
                if (!newName) return;
                const finalName = (origExt && !newName.toLowerCase().endsWith(origExt.toLowerCase()))
                  ? `${newName.trim()}${origExt}`
                  : newName.trim();
                if (finalName === entry.name) return;
                try {
                  const r = await fetch('/api/usb/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: entry.relPath, newName: finalName })
                  });
                  const d = await r.json();
                  if (!r.ok || !d.ok) throw new Error(d.error || 'Falha ao renomear');
                  playUiSound('select');
                  showToast(`Renomeado para ${d.name}`);
                  await loadExploreDirectory(exploreCurPath, false);
                } catch (err) {
                  showToast(err.message);
                }
              }
            });
          } else if (act === 'duplicate') {
            try {
              showToast('Duplicando…');
              const r = await fetch('/api/usb/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: entry.relPath })
              });
              const d = await r.json();
              if (!r.ok || !d.ok) throw new Error(d.error || 'Falha ao duplicar');
              playUiSound('select');
              showToast(`Duplicado: ${d.name}`);
              await loadExploreDirectory(exploreCurPath, false);
            } catch (err) {
              showToast(err.message);
            }
          } else if (act === 'copy') {
            usbClipboard = { relPath: entry.relPath, name: entry.name, mode: 'copy', isDir: entry.isDir };
            playUiSound('select');
            showToast(`Copiado: ${entry.name}`);
            renderExploreWorkspaceContent();
          } else if (act === 'cut') {
            usbClipboard = { relPath: entry.relPath, name: entry.name, mode: 'cut', isDir: entry.isDir };
            playUiSound('select');
            showToast(`Recortado: ${entry.name}`);
            renderExploreWorkspaceContent();
          } else if (act === 'paste') {
            const dest = entry && entry.isDir ? entry.relPath : exploreCurPath;
            await pasteUsbClipboard(dest);
          } else if (act === 'properties') {
            openPropertiesModal(entry);
          } else if (act === 'delete') {
            try {
              const r = await fetch('/api/usb/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: entry.relPath })
              });
              const d = await r.json();
              if (!r.ok || !d.ok) throw new Error(d.error || 'Falha ao deletar');
              playUiSound('back');
              showToast(`Deletado: ${entry.name}`);
              await loadExploreDirectory(exploreCurPath, false);
            } catch (err) {
              showToast(err.message);
            }
          } else if (act === 'new-folder') {
            document.getElementById('mp-exp-mkdir')?.click();
          } else if (act === 'refresh') {
            await loadExploreDirectory(exploreCurPath, true);
          }
        });
      });
    }

    function renderExploreWorkspaceContent() {
      if (store.mode !== 'explore') return;
      const parts = exploreCurPath ? exploreCurPath.split('/').filter(Boolean) : [];
      const filtered = exploreEntries.filter((e) => !exploreSearchQuery || e.name.toLowerCase().includes(exploreSearchQuery.toLowerCase()));

      headerActionsEl.innerHTML = `
        ${usbClipboard ? `
          <button id="mp-exp-paste-top" class="mp-pill-btn is-active" type="button" title="Colar ${escHtml(usbClipboard.name)} aqui">
            ${SVG.paste}<span>Colar (${escHtml(usbClipboard.name.slice(0, 18))})</span>
          </button>
        ` : ''}
        <button id="mp-exp-mkdir" class="mp-pill-btn" type="button">
          ${SVG.folderPlus}<span>Nova Pasta</span>
        </button>
        <button id="mp-exp-refresh" class="mp-pill-btn" type="button" title="Atualizar arquivos do pendrive">
          ${SVG.convert}<span>Atualizar</span>
        </button>
      `;

      let accum = '';
      const crumbsHtml = [
        `<button type="button" class="mp-crumb-btn ${!parts.length ? 'is-current' : ''}" data-exp-nav="">${SVG.hardDrive}<span>${escHtml(exploreDriveLabel)}</span></button>`,
        ...parts.map((seg, idx) => {
          accum = accum ? `${accum}/${seg}` : seg;
          const isLast = idx === parts.length - 1;
          return `<span class="mp-crumb-sep">${SVG.chevronRight}</span><button type="button" class="mp-crumb-btn ${isLast ? 'is-current' : ''}" data-exp-nav="${escHtml(accum)}">${escHtml(seg)}</button>`;
        })
      ].join('');

      workspaceEl.innerHTML = `
        <div class="mp-explore-shell" id="mp-explore-shell">
          <div class="mp-explore-toolbar">
            <div class="mp-explore-nav-left">
              <button type="button" id="mp-exp-up" class="mp-icon-pill" ${!parts.length ? 'disabled' : ''} title="Voltar para pasta anterior">
                ${SVG.arrowLeft}
              </button>
              <div class="mp-breadcrumbs">${crumbsHtml}</div>
            </div>
            <div class="mp-explore-nav-right">
              <input id="mp-exp-search" type="search" class="shows-search-input mp-exp-search" value="${escHtml(exploreSearchQuery)}" placeholder="Filtrar nesta pasta…" />
            </div>
          </div>

          <div class="mp-explore-grid" id="mp-explore-grid">
            ${exploreLoading ? `
              <div class="mp-explore-empty">Lendo pastas e arquivos do pendrive…</div>
            ` : filtered.length ? filtered.map((item, idx) => {
        const isCut = usbClipboard && usbClipboard.mode === 'cut' && usbClipboard.relPath === item.relPath;
        return `
                <div class="mp-exp-card ${item.isDir ? 'is-dir' : `is-${item.kind}`} ${isCut ? 'is-cut' : ''}" data-exp-idx="${idx}" tabindex="0">
                  <div class="mp-exp-card-main" data-exp-open="${idx}">
                    <div class="mp-exp-icon">${getEntryIconSvg(item)}</div>
                    <div class="mp-exp-meta">
                      <strong class="mp-exp-name">${escHtml(item.name)}</strong>
                      <small class="mp-exp-sub">${escHtml(getEntryTypeBadge(item))}${item.isDir ? '' : ` • ${formatFileSize(item.size)}`}</small>
                    </div>
                  </div>
                  <div class="mp-exp-card-actions">
                    ${!item.isDir ? `
                      <button type="button" class="mp-exp-act-btn" data-exp-ql="${idx}" title="Visualização Rápida">${SVG.eye}</button>
                    ` : ''}
                    <button type="button" class="mp-exp-act-btn" data-exp-ctx="${idx}" title="Opções (Menu de Contexto)">${SVG.moreVertical}</button>
                  </div>
                </div>
              `;
      }).join('') : `
              <div class="mp-explore-empty">
                <div class="mp-video-empty-icon">${SVG.folderOpen}</div>
                <h3>Esta pasta está vazia</h3>
                <p>Coloque suas músicas, séries ou vídeos no pendrive (as pastas do sistema ficam ocultas automaticamente).</p>
              </div>
            `}
          </div>
        </div>
      `;

      document.getElementById('mp-exp-refresh')?.addEventListener('click', () => loadExploreDirectory(exploreCurPath, true));
      document.getElementById('mp-exp-paste-top')?.addEventListener('click', () => pasteUsbClipboard(exploreCurPath));
      document.getElementById('mp-exp-mkdir')?.addEventListener('click', () => {
        openPromptModal({
          title: 'Nova Pasta no Pendrive',
          confirmLabel: 'Criar Pasta',
          fields: [{ name: 'name', label: 'Nome da nova pasta', value: 'Nova Pasta', required: true }],
          onConfirm: async ({ name }) => {
            if (!name) return;
            try {
              const r = await fetch('/api/usb/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentPath: exploreCurPath, name })
              });
              const d = await r.json();
              if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao criar pasta');
              playUiSound('select');
              showToast(`Pasta criada: ${d.name}`);
              await loadExploreDirectory(exploreCurPath, false);
            } catch (err) {
              showToast(err.message);
            }
          }
        });
      });

      document.getElementById('mp-exp-up')?.addEventListener('click', () => {
        if (!parts.length) return;
        const parent = parts.slice(0, -1).join('/');
        playUiSound('back');
        loadExploreDirectory(parent);
      });

      workspaceEl.querySelectorAll('[data-exp-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
          playUiSound('move');
          loadExploreDirectory(btn.dataset.expNav || '');
        });
      });

      const searchInp = document.getElementById('mp-exp-search');
      searchInp?.addEventListener('input', () => {
        exploreSearchQuery = searchInp.value;
        renderExploreWorkspaceContent();
        const nextInp = document.getElementById('mp-exp-search');
        if (nextInp) {
          nextInp.focus();
          const len = nextInp.value.length;
          try { nextInp.setSelectionRange(len, len); } catch (_) { }
        }
      });

      workspaceEl.querySelectorAll('[data-exp-open]').forEach((el) => {
        el.addEventListener('click', () => {
          const item = filtered[Number(el.dataset.expOpen)];
          if (item) openUsbEntry(item);
        });
      });

      workspaceEl.querySelectorAll('[data-exp-ql]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = filtered[Number(btn.dataset.expQl)];
          if (item) openQuickLookModal(item);
        });
      });

      workspaceEl.querySelectorAll('[data-exp-ctx]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = filtered[Number(btn.dataset.expCtx)];
          const rect = btn.getBoundingClientRect();
          if (item) openUsbContextMenu(item, rect.left, rect.bottom + 6);
        });
      });

      workspaceEl.querySelectorAll('.mp-exp-card').forEach((card) => {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const item = filtered[Number(card.dataset.expIdx)];
          if (item) openUsbContextMenu(item, e.clientX, e.clientY);
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const item = filtered[Number(card.dataset.expIdx)];
            if (item) openUsbEntry(item);
          } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const item = filtered[Number(card.dataset.expIdx)];
            const r = card.getBoundingClientRect();
            if (item) openUsbContextMenu(item, r.left + 40, r.top + 40);
          }
        });
      });

      document.getElementById('mp-explore-grid')?.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.mp-exp-card')) return;
        e.preventDefault();
        openUsbContextMenu(null, e.clientX, e.clientY);
      });
    }

    function renderExploreWorkspace() {
      stopVisualizerLoop();
      toggleDrawer(false);
      syncAmbientArt();
      loadExploreDirectory(exploreCurPath, false);
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#mp-usb-ctx-menu')) closeUsbContextMenu();
    });

    function updateMpTabIndicator() {
      const segTabs = document.querySelector('.mp-seg-tabs');
      const indicator = document.getElementById('mp-seg-indicator');
      if (!segTabs || !indicator) return;
      const activeBtn = segTabs.querySelector('.mp-seg-btn.active');
      if (!activeBtn) {
        indicator.style.opacity = '0';
        return;
      }
      const left = activeBtn.offsetLeft;
      const width = activeBtn.offsetWidth;
      if (width === 0) return;
      indicator.style.opacity = '1';
      indicator.style.width = `${width}px`;
      indicator.style.transform = `translate3d(${left}px, 0, 0)`;
    }

    const segTabsEl = document.querySelector('.mp-seg-tabs');
    if (segTabsEl && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => updateMpTabIndicator()).observe(segTabsEl);
    }
    document.fonts?.ready?.then(() => requestAnimationFrame(updateMpTabIndicator));
    setTimeout(updateMpTabIndicator, 120);

    function renderWorkspace() {
      document.getElementById('mp-tab-music')?.classList.toggle('active', store.mode === 'music');
      document.getElementById('mp-tab-video')?.classList.toggle('active', store.mode === 'video');
      document.getElementById('mp-tab-explore')?.classList.toggle('active', store.mode === 'explore');
      requestAnimationFrame(updateMpTabIndicator);
      closeUsbContextMenu();
      renderDrawer();
      const ws = document.getElementById('mp-workspace');
      if (ws) {
        ws.classList.remove('mp-view-entering');
        void ws.offsetWidth;
        ws.classList.add('mp-view-entering');
      }
      if (store.mode === 'music') renderMusicWorkspace();
      else {
        applyTrackHeaderGradient(null, '');
        if (store.mode === 'video') renderVideoWorkspace();
        else renderExploreWorkspace();
      }
    }

    async function handleAudioFiles(files) {
      if (!files.length) return;
      if (!store.musicPlaylists.length) {
        const id = `pl_${Date.now().toString(36)}`;
        store.musicPlaylists.push({ id, name: 'Minhas Músicas', tracks: [] });
        store.activeMusicPlId = id;
      }
      const pl = getActiveMusicPl();
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      let firstAdded = null;
      for (const f of files) {
        const meta = await extractAudioMetadata(f);
        const id = `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const blobKey = `blob_${id}`;
        const savedInDb = await idbPutBlob(blobKey, f);
        const item = {
          id,
          rawFilename: f.name || '',
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          embeddedCover: meta.embeddedCover,
          onlineCover: '',
          duration: 0,
          durationVerified: false,
          blobKey: savedInDb ? blobKey : '',
          objectUrl: trackObjUrl(URL.createObjectURL(f)),
          lyricsOffsetSec: 0
        };
        pl.tracks.push(item);
        if (!firstAdded) firstAdded = item;
        // Probe exact duration in background without blocking playback start
        getExactAudioDuration(f).then((exactDur) => {
          if (exactDur > 0) {
            item.duration = exactDur;
            item.durationVerified = true;
            saveStore(store);
            if (currentTrack?.id === item.id) syncMusicTransportUi();
            renderDrawer();
          }
        }).catch(() => { });
      }
      saveStore(store);
      playUiSound('select');
      renderDrawer();
      if (!currentTrack && firstAdded) {
        drawerOpen = false;
        toggleDrawer(false);
        await playMusicTrack(firstAdded);
      } else {
        renderMusicWorkspace();
      }
    }

    function parseVideoMeta(filename) {
      const base = String(filename || '').replace(/\.[^.]+$/, '');
      const isSeriesEp = /\b(?:s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}|ep\.?\s*\d+|epis[oó]dio\s*\d+)\b/i.test(base);
      const yearMatch = base.match(/\b(19\d{2}|20\d{2})\b/);
      const cleaned = base
        .replace(/[\._]/g, ' ')
        .replace(/\b(1080p|2160p|720p|4k|uhd|hdr|bluray|bdrip|web-dl|webrip|x264|x265|hevc|aac|dts|dual|dublado|legendado)\b.*$/i, '')
        .replace(/\((19\d{2}|20\d{2})\)|\[(19\d{2}|20\d{2})\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        isMovie: !isSeriesEp,
        cleanTitle: cleaned || base,
        year: yearMatch ? Number(yearMatch[1]) : null
      };
    }

    async function fetchMovieMetadata(item) {
      if (!item || item._metaFetched) return;
      item._metaFetched = true;
      try {
        const q = new URLSearchParams({
          title: item.cleanTitle || item.title,
          type: 'MOVIE',
          lang: 'pt',
          country: 'BR'
        });
        const r = await fetch(`/api/media/details?${q.toString()}`);
        if (!r.ok) return;
        const d = await r.json();
        if (d && (d.title || d.poster || d.backdrop)) {
          item.movieMeta = {
            title: d.title || item.cleanTitle || item.title,
            year: d.year || item.year || null,
            poster: d.poster || '',
            backdrop: d.backdrop || '',
            rating: d.ratings?.imdb || d.ratings?.tmdb || null,
            synopsis: d.synopsis || ''
          };
          saveStore(store);
          if (currentEpisode?.id === item.id && store.mode === 'video') {
            syncAmbientArt();
            const pill = document.querySelector('.mp-v-ep-pill');
            if (pill) {
              pill.textContent = `🎬 ${item.movieMeta.title}${item.movieMeta.year ? ` (${item.movieMeta.year})` : ''}${item.movieMeta.rating ? ` • ★ ${item.movieMeta.rating}` : ''}`;
            }
          }
        }
      } catch (_) { }
    }

    async function handleVideoFiles(files) {
      if (!files.length) return;
      const firstMeta = parseVideoMeta(files[0].name);
      if (!store.videoPlaylists.length) {
        const id = `vpl_${Date.now().toString(36)}`;
        store.videoPlaylists.push({
          id,
          name: firstMeta.isMovie ? 'Meus Filmes' : 'Minha Série',
          kind: firstMeta.isMovie ? 'movie' : 'series',
          episodes: []
        });
        store.activeVideoPlId = id;
      }
      const pl = getActiveVideoPl();
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      let firstAdded = null;
      for (const f of files) {
        const vMeta = parseVideoMeta(f.name);
        const id = `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const blobKey = `vblob_${id}`;
        const savedInDb = await idbPutBlob(blobKey, f);
        const item = {
          id,
          title: f.name.replace(/\.[^.]+$/, ''),
          cleanTitle: vMeta.cleanTitle,
          isMovie: vMeta.isMovie,
          year: vMeta.year,
          movieMeta: null,
          watched: false,
          duration: 0,
          lastPos: 0,
          subName: '',
          subCues: [],
          blobKey: savedInDb ? blobKey : '',
          objectUrl: trackObjUrl(URL.createObjectURL(f))
        };
        pl.episodes.push(item);
        if (item.isMovie) fetchMovieMetadata(item);
        if (!firstAdded) firstAdded = item;
      }
      saveStore(store);
      playUiSound('select');
      if (!currentEpisode && firstAdded) {
        currentEpisode = firstAdded;
        drawerOpen = false;
        toggleDrawer(false);
        renderDrawer();
        renderVideoWorkspace(true);
      } else {
        renderDrawer();
        renderVideoWorkspace(false);
      }
    }

    document.getElementById('mp-tab-music')?.addEventListener('click', () => {
      if (store.mode === 'music') return;
      store.mode = 'music';
      saveStore(store);
      playUiSound('move');
      renderWorkspace();
    });
    document.getElementById('mp-tab-video')?.addEventListener('click', () => {
      if (store.mode === 'video') return;
      store.mode = 'video';
      saveStore(store);
      playUiSound('move');
      renderWorkspace();
    });
    document.getElementById('mp-tab-explore')?.addEventListener('click', () => {
      if (store.mode === 'explore') return;
      store.mode = 'explore';
      saveStore(store);
      playUiSound('move');
      renderWorkspace();
    });

    audioPicker.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      handleAudioFiles(files);
    });
    videoPicker.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      handleVideoFiles(files);
    });
    subPicker.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !currentEpisode) return;
      const cues = parseSrtVtt(await file.text());
      if (!cues.length) return showToast('Legenda inválida (.srt / .vtt)');
      currentEpisode.subCues = cues;
      currentEpisode.subName = file.name;
      videoCcEnabled = true;
      saveStore(store);
      playUiSound('select');
      showToast(`Legenda carregada (${cues.length} falas)`);
      renderDrawer();
    });

    // Drag & Drop support directly onto Mídia
    shellEl?.addEventListener('dragover', (e) => { e.preventDefault(); });
    shellEl?.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const aud = files.filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|flac|wav|ogg|aac)$/i.test(f.name));
      const vid = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|m4v)$/i.test(f.name));
      if (aud.length) {
        store.mode = 'music';
        handleAudioFiles(aud);
      } else if (vid.length) {
        store.mode = 'video';
        handleVideoFiles(vid);
      }
    });

    const onKeyDown = (e) => {
      if (appStageOverlay.classList.contains('hidden')) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (store.mode === 'music') document.getElementById('mp-play-btn')?.click();
        else document.getElementById('mp-v-play')?.click();
      } else if (e.key.toLowerCase() === 'l') {
        toggleDrawer();
      } else if (e.key.toLowerCase() === 'c' && store.mode === 'video') {
        document.getElementById('mp-cc-toggle-btn')?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    renderWorkspace();

    activeCleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      stopVisualizerLoop();
      musicPlayingWanted = false;
      if (musicClockTimer) {
        clearInterval(musicClockTimer);
        musicClockTimer = null;
      }
      if (videoClockTimer) {
        clearInterval(videoClockTimer);
        videoClockTimer = null;
      }
      audioEl.pause();
      audioEl.removeAttribute('src');
      try { audioEl.load(); } catch (_) { }
      const vEl = document.getElementById('mp-video-el');
      if (vEl) {
        vEl.pause();
        vEl.removeAttribute('src');
        try { vEl.load(); } catch (_) { }
      }
      revokeAllObjectUrls();
      appStageWindow.classList.remove('is-mediaplayer-app');
    };
  }

  function cleanup() {
    if (typeof activeCleanup === 'function') {
      try { activeCleanup(); } catch (_) { }
      activeCleanup = null;
    }
  }

  window.IrisMediaPlayer = {
    renderMediaPlayer,
    parseSrtVtt,
    parseLrc,
    cleanup
  };
})();

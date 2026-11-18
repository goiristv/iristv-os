(function () {
  const hasPalm = Boolean(window.PalmSystem);
  const hasWebOS = Boolean(window.webOS && window.webOS.service);
  const isWebOS = hasPalm || hasWebOS || /Web0S|webOS/i.test(navigator.userAgent || '');

  const WEBOS_APP_MAP = {
    netflix: 'netflix',
    prime: 'amazon',
    disney: 'com.disney.disneyplus-prod',
    max: 'com.wbd.stream',
    youtube: 'youtube.leanback.v4',
    youtubekids: 'youtube.leanback.kids.v4',
    spotify: 'spotify-beehive',
    appletv: 'com.apple.appletv',
    globoplay: 'globoplay.app',
    paramount: 'com.cbs.ott',
    crunchyroll: 'com.crunchyroll.crunchyroll',
    plutotv: 'tv.pluto.webos',
    plex: 'cdp-30',
    twitch: 'tv.twitch.starship',
    dazn: 'com.dazn'
  };

  function lunaCall(uri, method, params, onSuccess, onFailure) {
    if (window.webOS && window.webOS.service && window.webOS.service.request) {
      return window.webOS.service.request(uri, {
        method,
        parameters: params || {},
        onSuccess: onSuccess || function () {},
        onFailure: onFailure || function () {}
      });
    }
    if (window.PalmServiceBridge) {
      try {
        const bridge = new window.PalmServiceBridge();
        bridge.onservicecallback = (msg) => {
          try {
            const parsed = JSON.parse(msg);
            if (parsed.returnValue === false) onFailure && onFailure(parsed);
            else onSuccess && onSuccess(parsed);
          } catch (_) { }
        };
        bridge.call(`${uri.replace(/\/$/, '')}/${method}`, JSON.stringify(params || {}));
        return bridge;
      } catch (_) { }
    }
    if (onFailure) onFailure({ errorText: 'Luna unavailable' });
    return null;
  }

  if (isWebOS) {
    document.documentElement.classList.add('is-webos');
    // Mapeia o botão Voltar (keyCode 461) do Magic Remote da LG para Escape
    document.addEventListener('keydown', (e) => {
      if (e.keyCode === 461 || e.key === 'GoBack') {
        e.preventDefault();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      }
    }, true);
  }

  window.IrisWebOS = {
    isWebOS,
    appMap: WEBOS_APP_MAP,
    lunaCall,
    launchApp(appId, fallbackUrl) {
      const targetId = WEBOS_APP_MAP[String(appId || '').toLowerCase()];
      if (isWebOS && targetId) {
        lunaCall(
          'luna://com.webos.applicationManager',
          'launch',
          { id: targetId },
          () => {},
          () => { if (fallbackUrl) window.location.href = fallbackUrl; }
        );
        return true;
      }
      return false;
    },
    setVolume(vol) {
      if (!isWebOS) return false;
      lunaCall('luna://com.webos.audio', 'setVolume', { volume: Math.max(0, Math.min(100, Math.round(vol))) });
      return true;
    },
    setMuted(muted) {
      if (!isWebOS) return false;
      lunaCall('luna://com.webos.audio', 'setMuted', { muted: Boolean(muted) });
      return true;
    }
  };
})();

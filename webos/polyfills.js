/**
 * irisTV — Essential Polyfills for LG webOS 4.x (Chromium 53)
 * Chromium 53 lacks: Object.entries, Object.values, padStart, padEnd,
 * Promise.finally, matchAll, and ResizeObserver.
 */
(function () {
  'use strict';

  // Object.entries (Chrome 54)
  if (!Object.entries) {
    Object.entries = function (obj) {
      var ownProps = Object.keys(obj);
      var i = ownProps.length;
      var resArray = new Array(i);
      while (i--) resArray[i] = [ownProps[i], obj[ownProps[i]]];
      return resArray;
    };
  }

  // Object.values (Chrome 54)
  if (!Object.values) {
    Object.values = function (obj) {
      var ownProps = Object.keys(obj);
      var i = ownProps.length;
      var resArray = new Array(i);
      while (i--) resArray[i] = obj[ownProps[i]];
      return resArray;
    };
  }

  // String.prototype.padStart (Chrome 57)
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
      targetLength = targetLength >> 0;
      padString = String(typeof padString !== 'undefined' ? padString : ' ');
      if (this.length > targetLength) return String(this);
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length);
      }
      return padString.slice(0, targetLength) + String(this);
    };
  }

  // String.prototype.padEnd (Chrome 57)
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (targetLength, padString) {
      targetLength = targetLength >> 0;
      padString = String(typeof padString !== 'undefined' ? padString : ' ');
      if (this.length > targetLength) return String(this);
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length);
      }
      return String(this) + padString.slice(0, targetLength);
    };
  }

  // Promise.prototype.finally (Chrome 63)
  if (!Promise.prototype['finally']) {
    Promise.prototype['finally'] = function (callback) {
      var constructor = this.constructor;
      return this.then(
        function (value) {
          return constructor.resolve(callback()).then(function () { return value; });
        },
        function (reason) {
          return constructor.resolve(callback()).then(function () { throw reason; });
        }
      );
    };
  }

  // String.prototype.matchAll (Chrome 73)
  if (!String.prototype.matchAll) {
    String.prototype.matchAll = function (regexp) {
      var str = String(this);
      var flags = regexp.flags || '';
      if (flags.indexOf('g') === -1) flags += 'g';
      var rx = new RegExp(regexp.source, flags);
      var matches = [];
      var match;
      while ((match = rx.exec(str)) !== null) {
        matches.push(match);
        if (rx.lastIndex === match.index) rx.lastIndex++;
      }
      return matches[Symbol.iterator] ? matches[Symbol.iterator]() : matches;
    };
  }

  // ResizeObserver stub / fallback (Chrome 64)
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = function (callback) {
      this.callback = callback;
      this.targets = [];
      var self = this;
      this._handler = function () {
        var entries = self.targets.map(function (t) {
          var rect = t.getBoundingClientRect();
          return { target: t, contentRect: rect };
        });
        if (entries.length && self.callback) {
          try { self.callback(entries, self); } catch (_) {}
        }
      };
    };
    window.ResizeObserver.prototype.observe = function (target) {
      if (this.targets.indexOf(target) === -1) {
        this.targets.push(target);
        if (this.targets.length === 1) {
          window.addEventListener('resize', this._handler, { passive: true });
        }
      }
    };
    window.ResizeObserver.prototype.unobserve = function (target) {
      var idx = this.targets.indexOf(target);
      if (idx !== -1) {
        this.targets.splice(idx, 1);
        if (this.targets.length === 0) {
          window.removeEventListener('resize', this._handler);
        }
      }
    };
    window.ResizeObserver.prototype.disconnect = function () {
      this.targets = [];
      window.removeEventListener('resize', this._handler);
    };
  }

  // Smooth scroll guard for Chrome 53
  var origScrollTo = window.scrollTo;
  window.scrollTo = function () {
    if (arguments.length === 1 && typeof arguments[0] === 'object' && arguments[0] !== null) {
      var opts = arguments[0];
      return origScrollTo.call(window, opts.left || window.pageXOffset, opts.top || window.pageYOffset);
    }
    return origScrollTo.apply(window, arguments);
  };

  if (Element.prototype.scrollIntoView) {
    var origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg) {
      if (typeof arg === 'object' && arg !== null) {
        return origScrollIntoView.call(this, arg.block !== 'end');
      }
      return origScrollIntoView.apply(this, arguments);
    };
  }

  // Global API_BASE and relative fetch patcher for webOS (local file:// origin)
  (function () {
    var origFetch = window.fetch;
    if (!origFetch) return;

    function getApiBase() {
      if (window.IrisConfig && window.IrisConfig.apiBase) return window.IrisConfig.apiBase;
      try {
        var saved = localStorage.getItem('iristv_hub_url') || localStorage.getItem('iristv_api_base');
        if (saved) return saved.replace(/\/+$/, '');
      } catch (_) {}
      return '';
    }

    window.IrisResolveApiUrl = function (path) {
      if (!path) return '';
      if (/^(https?:|\/\/|data:|blob:)/i.test(path)) return path;
      var base = getApiBase();
      if (!base) return path;
      var cleanPath = path.charAt(0) === '/' ? path : '/' + path;
      return base + cleanPath;
    };

    window.fetch = function (resource, init) {
      try {
        var base = getApiBase();
        if (base) {
          if (typeof resource === 'string' && resource.charAt(0) === '/') {
            resource = base + resource;
          } else if (resource && typeof resource.url === 'string' && resource.url.charAt(0) === '/') {
            resource = new Request(base + resource.url, resource);
          }
        }
      } catch (_) {}
      return origFetch.call(this, resource, init);
    };
  })();
})();

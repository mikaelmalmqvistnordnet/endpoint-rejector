// Endpoint Rejector - Content Script (runs in MAIN world to intercept fetch/XHR)

(function () {
  const STORAGE_KEY = '__endpoint_rejector_rules__';

  function getRules() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function matchesRule(url, rules) {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      try {
        if (rule.pattern.includes('*')) {
          const regex = new RegExp(
            '^' + rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
          );
          if (regex.test(url)) return rule;
        } else {
          if (url.includes(rule.pattern)) return rule;
        }
      } catch {
        if (url.includes(rule.pattern)) return rule;
      }
    }
    return null;
  }

  // --- Patch fetch ---
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const rules = getRules();
    const match = matchesRule(url, rules);

    if (match) {
      console.warn(
        `[Endpoint Rejector] Blocking ${url} with status ${match.statusCode}`,
        match
      );
      const body = JSON.stringify({
        error: `Endpoint Rejector: simulated ${match.statusCode}`,
        statusCode: match.statusCode,
        pattern: match.pattern,
      });
      return Promise.resolve(
        new Response(body, {
          status: match.statusCode,
          statusText: getStatusText(match.statusCode),
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    return originalFetch.apply(window, arguments);
  };

  // --- Patch XMLHttpRequest ---
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__er_url = url;
    return XHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const rules = getRules();
    const match = matchesRule(this.__er_url, rules);

    if (match) {
      console.warn(
        `[Endpoint Rejector] Blocking XHR ${this.__er_url} with status ${match.statusCode}`,
        match
      );
      Object.defineProperty(this, 'status', { get: () => match.statusCode });
      Object.defineProperty(this, 'statusText', { get: () => getStatusText(match.statusCode) });
      Object.defineProperty(this, 'responseText', {
        get: () =>
          JSON.stringify({
            error: `Endpoint Rejector: simulated ${match.statusCode}`,
            statusCode: match.statusCode,
            pattern: match.pattern,
          }),
      });
      Object.defineProperty(this, 'response', { get: () => this.responseText });
      Object.defineProperty(this, 'readyState', { get: () => 4 });

      setTimeout(() => {
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new Event('load'));
        this.dispatchEvent(new Event('loadend'));
        if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
        if (typeof this.onload === 'function') this.onload();
        if (typeof this.onloadend === 'function') this.onloadend();
      }, 0);
      return;
    }
    return XHRSend.call(this, body);
  };

  // --- Patch EventSource (SSE) ---
  const OriginalEventSource = window.EventSource;
  window.EventSource = function (url, config) {
    const rules = getRules();
    const match = matchesRule(url, rules);

    if (match) {
      console.warn(
        `[Endpoint Rejector] Blocking EventSource ${url} with status ${match.statusCode}`,
        match
      );
      // Return a fake EventSource that immediately errors
      const fake = Object.create(OriginalEventSource.prototype);
      fake.url = url;
      fake.readyState = 2; // CLOSED
      fake.close = () => {};
      fake.addEventListener = (type, handler) => {
        if (type === 'error') {
          setTimeout(() => handler(new Event('error')), 0);
        }
      };
      fake.removeEventListener = () => {};
      setTimeout(() => {
        if (typeof fake.onerror === 'function') fake.onerror(new Event('error'));
      }, 0);
      return fake;
    }
    return new OriginalEventSource(url, config);
  };
  window.EventSource.CONNECTING = 0;
  window.EventSource.OPEN = 1;
  window.EventSource.CLOSED = 2;

  function getStatusText(code) {
    const texts = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      408: 'Request Timeout',
      409: 'Conflict',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return texts[code] || 'Error';
  }

  // Listen for rule updates from the popup
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'ENDPOINT_REJECTOR_SYNC') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(event.data.rules));
    }
  });

  const rules = getRules();
  if (rules.length === 0) {
    console.log('[Endpoint Rejector] Active and monitoring requests. No endpoints configured.');
  } else {
    const ruleLines = rules.map(
      (r) =>
        `  ${r.enabled ? '🟢' : '⚪'} ${r.pattern} → ${r.statusCode} ${getStatusText(r.statusCode)} ${r.enabled ? '(active)' : '(inactive)'}`
    );
    console.log(
      `[Endpoint Rejector] Active and monitoring requests.\n\nEndpoints (${rules.length}):\n${ruleLines.join('\n')}`
    );
  }
})();

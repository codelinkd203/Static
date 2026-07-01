(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.previewUrlHelpers = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function normalizePreviewInput(origin, input) {
    const text = (input || '').trim();
    if (!text) return origin;

    if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(text)) {
      return text;
    }

    const baseOrigin = origin || 'http://localhost:9090';
    const normalizedPath = text.startsWith('/') ? text : `/${text}`;
    return new URL(normalizedPath, baseOrigin).toString();
  }

  function getDisplayAddress(url, origin) {
    try {
      const parsed = new URL(url, origin || 'http://localhost:9090');
      if (parsed.origin === new URL(origin || 'http://localhost:9090').origin) {
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        return path || '/';
      }
      return parsed.toString();
    } catch (err) {
      return url || '/';
    }
  }

  function isLocalPreviewUrl(url, origin) {
    try {
      return new URL(url, origin || 'http://localhost:9090').origin === new URL(origin || 'http://localhost:9090').origin;
    } catch (err) {
      return false;
    }
  }

  return {
    normalizePreviewInput,
    getDisplayAddress,
    isLocalPreviewUrl,
  };
});

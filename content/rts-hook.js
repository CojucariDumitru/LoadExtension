(() => {
  if (window.__loadExtensionRtsHook) return;
  window.__loadExtensionRtsHook = true;

  const publish = (payload) => {
    window.postMessage({ source: "loadextension-rts", ...payload }, "*");
  };

  const handlePayload = (url, data) => {
    if (!/credit|broker|rating|score/i.test(url) && !extractCredits(data).length) return;
    publish({ type: "RTS_RESPONSE", url, data });
  };

  function extractCredits(data) {
    const results = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      const lower = {};
      for (const [key, value] of Object.entries(node)) lower[key.toLowerCase()] = value;
      if (lower.grade || lower.creditscore || lower.mcnumber || lower.mc) {
        results.push(node);
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
    return results;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      const clone = response.clone();
      clone
        .json()
        .then((data) => handlePayload(url, data))
        .catch(() => {});
    } catch {
      // ignore hook errors
    }
    return response;
  };
})();

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function isVisible(el) {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

function leafNodes(root) {
  const nodes = [];
  const walk = (el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.closest("#loadextension-overlay-root, .le-dat-widget")) return;
    if (el.children.length === 0) nodes.push(el);
    else el.childNodes.forEach((child) => walk(child));
  };
  walk(root);
  return nodes;
}

export function findDetailPanel(load) {
  const candidates = [...document.querySelectorAll("div, section, article, main")].filter((el) => {
    if (el.closest("#loadextension-overlay-root, #loadextension-toolbar")) return false;
    const text = el.textContent || "";
    if (!text.includes(load.originCity) || !text.includes(load.destinationCity)) return false;
    if (!String(load.rate) || !text.includes(String(load.rate))) return false;
    const rect = el.getBoundingClientRect();
    return rect.height >= 160 && rect.width >= 500;
  });

  candidates.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
  return candidates.find((el) => /factoring eligible|rate\s*\/\s*mile|view route/i.test(el.textContent)) || candidates[0] || null;
}

function findCityLeaf(panel, city, state) {
  const target = `${city}, ${state}`;
  return leafNodes(panel).find((el) => {
    const text = (el.textContent || "").trim();
    return text.includes(target) && text.length <= 60;
  });
}

function scanAnchorsIn(root, load, anchors) {
  if (!root) return;

  for (const el of leafNodes(root)) {
    const text = (el.textContent || "").trim();
    if (/^\$[\d,.]+\s*\*?\s*\/\s*mi/i.test(text) || /^\$[\d,.]+\/mi/i.test(text)) {
      anchors.loadedRpm = el;
    }
  }

  if (!anchors.originCity) {
    anchors.originCity = findCityLeaf(root, load.originCity, load.originState);
  }
  if (!anchors.destCity) {
    anchors.destCity = findCityLeaf(root, load.destinationCity, load.destinationState);
  }

  for (const el of root.querySelectorAll("*")) {
    const text = (el.textContent || "").trim();
    if (text.length > 80) continue;
    if (!anchors.factoring && /factoring eligible/i.test(text)) anchors.factoring = el;
    if (!anchors.mc && /^MC#?\s*\d+/i.test(text)) anchors.mc = el;
  }

  if (!anchors.email) {
    const mailLink = root.querySelector('a[href^="mailto:"]');
    if (mailLink) anchors.email = mailLink;
  }

  if (!anchors.emailText) {
    for (const el of leafNodes(root)) {
      const text = el.textContent || "";
      if (EMAIL_RE.test(text) && text.length < 80) {
        anchors.emailText = el;
        break;
      }
    }
  }
}

export function findDatAnchors(load) {
  const panel = findDetailPanel(load);
  const roots = [panel, load.element].filter(Boolean);
  if (!roots.length) return {};

  const anchors = { panel: panel || load.element };

  for (const root of roots) {
    scanAnchorsIn(root, load, anchors);
  }

  if (anchors.loadedRpm && !isVisible(anchors.loadedRpm)) delete anchors.loadedRpm;
  if (anchors.factoring && !isVisible(anchors.factoring)) delete anchors.factoring;

  return anchors;
}

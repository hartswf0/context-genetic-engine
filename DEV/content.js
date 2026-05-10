(() => {
  if (window.__CGE_CONTENT_READY__) return;
  window.__CGE_CONTENT_READY__ = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.action === "EXTRACT_CONTEXT") {
        sendResponse({ success: true, data: { context: extractContext() } });
        return;
      }

      if (message.action === "APPLY_CSS") {
        applyCss(message.payload?.css || "");
        sendResponse({ success: true, data: { applied: true } });
        return;
      }

      sendResponse({ success: false, error: `Unknown content action: ${message.action}` });
    } catch (error) {
      sendResponse({ success: false, error: error.message || String(error) });
    }
  });

  function extractContext() {
    const clone = document.body ? document.body.cloneNode(true) : document.createElement("body");
    clone.querySelectorAll("script, style, nav, footer, header, iframe, noscript, svg, canvas").forEach((node) => node.remove());

    const selection = window.getSelection ? String(window.getSelection()).trim() : "";
    const description = document.querySelector('meta[name="description"]')?.content || "";
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((node) => node.innerText.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join("\n");
    const bodyText = (clone.innerText || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 14000);

    return [
      `[URL]\n${location.href}`,
      `[TITLE]\n${document.title || "Untitled"}`,
      description ? `[DESCRIPTION]\n${description}` : "",
      selection ? `[USER SELECTION]\n${selection.slice(0, 4000)}` : "",
      headings ? `[HEADINGS]\n${headings}` : "",
      `[VISIBLE TEXT]\n${bodyText}`
    ].filter(Boolean).join("\n\n");
  }

  function applyCss(css) {
    if (!css.trim()) return;
    let style = document.getElementById("context-genetics-engine-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "context-genetics-engine-style";
      document.documentElement.appendChild(style);
    }
    style.textContent = css;
  }
})();

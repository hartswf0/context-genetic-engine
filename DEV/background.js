const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!chrome.sidePanel || !chrome.sidePanel.open || !tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.warn("Unable to open side panel", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
  return true;
});

async function routeMessage(message) {
  const { action, payload } = message || {};

  if (action === "GEMINI_API") return callGemini(payload);
  if (action === "GET_TAB_CONTEXT") return getActiveTabContext();
  if (action === "MUTATE_DOM") return sendToActiveTab("APPLY_CSS", payload);
  if (action === "FETCH_URL") return fetchUrl(payload);

  return { success: false, error: `Unknown action: ${action}` };
}

async function callGemini(payload) {
  const { geminiApiKey } = await chrome.storage.local.get(["geminiApiKey"]);
  const apiKey = (geminiApiKey || "").trim();

  if (!apiKey) {
    return {
      success: false,
      error: "Gemini API key missing. Create one in Google AI Studio, then paste it into the API key field."
    };
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(payload || {})
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    return {
      success: false,
      error: data.error?.message || data.raw || `Gemini request failed with HTTP ${response.status}.`
    };
  }

  return { success: true, data };
}

async function fetchUrl(payload) {
  const url = payload && payload.url ? String(payload.url) : "";
  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { success: false, error: "Only http and https URLs can be ingested." };
  }

  const response = await fetch(parsed.href);
  if (!response.ok) {
    return { success: false, error: `Fetch failed with HTTP ${response.status}.` };
  }

  const content = await response.text();
  return { success: true, data: { url: parsed.href, content } };
}

async function getActiveTabContext() {
  return sendToActiveTab("EXTRACT_CONTEXT", {});
}

async function sendToActiveTab(action, payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { success: false, error: "No active tab found." };
  }

  if (!/^https?:|^file:/.test(tab.url || "")) {
    return { success: false, error: "This tab is restricted. Open a normal web page and try again." };
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  return chrome.tabs.sendMessage(tab.id, { action, payload });
}

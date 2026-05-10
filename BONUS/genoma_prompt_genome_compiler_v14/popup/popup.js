document.getElementById('open').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

document.getElementById('openPanel').addEventListener('click', function () {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) chrome.sidePanel.open({ tabId: tabs[0].id });
    window.close();
  });
});

const SIDE_PANEL_PATH = "popup.html";

async function openCollectorSidePanel(tabId, windowId) {
  if (!tabId || !windowId) {
    throw new Error("未找到当前标签页。");
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: SIDE_PANEL_PATH,
    enabled: true
  });
  await chrome.sidePanel.open({ windowId });
}

chrome.runtime.onInstalled.addListener(() => {
  if (typeof chrome.sidePanel.setPanelBehavior !== "function") {
    return;
  }

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Older Chrome versions can still open the panel through action.onClicked.
  });
});

chrome.action.onClicked.addListener((tab) => {
  openCollectorSidePanel(tab.id, tab.windowId).catch(() => {
    // The side panel API only opens from eligible browser pages.
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PROMPTNEST_OPEN_COLLECTOR") {
    return false;
  }

  openCollectorSidePanel(sender.tab?.id, sender.tab?.windowId)
    .then(() => sendResponse({ ok: true, target: "sidePanel" }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "侧边栏打开失败。"
      });
    });

  return true;
});

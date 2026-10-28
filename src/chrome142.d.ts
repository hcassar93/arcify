/** Chrome 142 lifecycle surface, absent from the pinned DefinitelyTyped snapshot. */
declare namespace chrome.sidePanel {
  interface PanelInfo {
    windowId: number;
    tabId?: number;
    path: string;
  }
  const onOpened: chrome.events.Event<(info: PanelInfo) => void>;
  const onClosed: chrome.events.Event<(info: PanelInfo) => void>;
  function close(options: { windowId?: number; tabId?: number }): Promise<void>;
}

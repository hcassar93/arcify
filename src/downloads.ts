export interface RecentDownload {
  id: number;
  name: string;
  state: chrome.downloads.DownloadItem["state"];
  paused: boolean;
  exists: boolean;
  received: number;
  total: number;
  start: string;
  danger: string;
}
export const DOWNLOAD_LIMIT = 50;
export function summarizeDownload(
  d: chrome.downloads.DownloadItem,
): RecentDownload {
  return {
    id: d.id,
    name: d.filename.split(/[\\/]/).at(-1) || "Unnamed download",
    state: d.state,
    paused: d.paused,
    exists: d.exists,
    received: Math.max(0, d.bytesReceived),
    total: d.totalBytes,
    start: d.startTime,
    danger: d.danger,
  };
}
export function downloadStatus(d: RecentDownload): string {
  if (d.state === "complete") return d.exists ? "Complete" : "File missing";
  if (d.state === "interrupted") return "Interrupted · manage in Chrome";
  if (d.paused) return "Paused";
  return d.total > 0
    ? Math.min(100, Math.round((d.received / d.total) * 100)) + "% downloaded"
    : "Downloading…";
}
export function canReveal(d: RecentDownload): boolean {
  return d.state === "complete" && d.exists;
}
/** A bounded in-memory projection. No URLs, full paths or download history are persisted. */
export class DownloadStore {
  items: RecentDownload[] = [];
  error = "";
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private again = false;
  constructor(private api: typeof chrome.downloads) {}
  async refresh(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      this.items = (
        await this.api.search({
          limit: DOWNLOAD_LIMIT,
          orderBy: ["-startTime"],
        })
      )
        .filter((d) => !d.incognito)
        .slice(0, DOWNLOAD_LIMIT)
        .map(summarizeDownload);
      this.error = "";
    } catch {
      this.error = "Downloads are unavailable. Try again.";
    } finally {
      this.running = false;
      this.listeners.forEach((fn) => fn());
      if (this.again) {
        this.again = false;
        void this.refresh();
      }
    }
  }
  watch(fn: () => void): void {
    this.listeners.add(fn);
    const changed = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.refresh(), 100);
    };
    this.api.onCreated.addListener(changed);
    this.api.onChanged.addListener(changed);
    this.api.onErased.addListener(changed);
    // Chrome does not emit byte-progress changes consistently; poll only while this UI is visible.
    const interval = setInterval(() => {
      if (this.items.some((d) => d.state === "in_progress" && !d.paused))
        changed();
    }, 1000);
    window.addEventListener(
      "pagehide",
      () => {
        clearInterval(interval);
        clearTimeout(this.timer);
        this.api.onCreated.removeListener(changed);
        this.api.onChanged.removeListener(changed);
        this.api.onErased.removeListener(changed);
      },
      { once: true },
    );
    void this.refresh();
  }
}

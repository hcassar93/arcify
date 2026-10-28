/** The only module permitted to create or update navigation destinations. Never attach context. */
export function canonical(value: string): string | null {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function enteredURL(value: string): string | null {
  const text = value.trim();
  if (/\s/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return canonical(text);
  if (
    /^(localhost|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?([/?#].*)?$/u.test(
      text,
    )
  )
    return canonical("https://" + text);
  return null;
}
export const internal = {
  downloads: "chrome://downloads/",
  newTab: "chrome://newtab/",
  shortcuts: "chrome://extensions/shortcuts",
} as const;
export function destination(url: string, allowInternal = false): string {
  const safe = canonical(url);
  if (safe) return safe;
  if (
    allowInternal &&
    Object.values(internal).includes(url as typeof internal.newTab)
  )
    return url;
  throw new Error(
    "Only HTTP and HTTPS destinations without embedded credentials are supported.",
  );
}
export async function openURL(
  url: string,
  windowId: number,
  allowInternal = false,
): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({
    windowId,
    url: destination(url, allowInternal),
    active: true,
  });
}
export async function resetURL(
  tabId: number,
  url: string,
): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.update(tabId, {
    url: destination(url),
    active: true,
  });
  if (!tab) throw new Error("The tab is no longer available.");
  return tab;
}
export async function switchTab(id: number): Promise<void> {
  const t = await chrome.tabs.get(id);
  await chrome.tabs.update(id, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
}

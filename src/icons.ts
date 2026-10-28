const paths: Record<string, string> = {
  download: "M8 1v9 M4 6l4 4 4-4 M2 11v3h12v-3",
  search: "m14 14-4-4 M11.5 6.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  folder: "M1 3h5l2 2h7v9H1Z",
  chevron: "m6 4 4 4-4 4",
  down: "m4 6 4 4 4-4",
  plus: "M8 3v10 M3 8h10",
  settings:
    "M8 2v2 M8 12v2 M2 8h2 M12 8h2 M3.8 3.8l1.4 1.4 M10.8 10.8l1.4 1.4 M3.8 12.2l1.4-1.4 M10.8 5.2l1.4-1.4 M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  fullscreen: "M6 2H2v4 M10 2h4v4 M14 10v4h-4 M2 10v4h4",
  close: "m4 4 8 8 M12 4l-8 8",
  panel: "M2 3h12v10H2Z M6 3v10",
  more: "M3 8h.01 M8 8h.01 M13 8h.01",
  command:
    "M5 5h6v6H5Z M5 5H3a2 2 0 1 1 2-2v2 M11 5V3a2 2 0 1 1 2 2h-2 M11 11h2a2 2 0 1 1-2 2v-2 M5 11v2a2 2 0 1 1-2-2h2",
  pin: "m5 2 6 0-1 5 3 3H3l3-3Z M8 10v4",
  arrow: "M3 8h10 M9 4l4 4-4 4",
};
export function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ui-icon");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name] ?? paths.arrow);
  svg.append(path);
  return svg;
}
export const packagedSites: Record<string, string> = {
  "github.com": "github.png",
  "mail.google.com": "gmail.png",
  "calendar.google.com": "calendar.png",
  "notion.so": "notion.png",
  "www.notion.so": "notion.png",
  "notion.com": "notion.png",
  "www.notion.com": "notion.png",
};
export function siteAsset(url: string | undefined): string | undefined {
  try {
    const u = new URL(url ?? "");
    if (!["https:", "http:"].includes(u.protocol)) return;
    const file = packagedSites[u.hostname];
    return file ? "site-icons/" + file : undefined;
  } catch {
    return;
  }
}
/** Chrome's extension-local favicon cache, approved separately from host access. */
export function cachedIconURL(
  url: string | undefined,
  getURL: (path: string) => string,
): string | undefined {
  try {
    const page = new URL(url ?? "");
    if (
      !["http:", "https:"].includes(page.protocol) ||
      page.username ||
      page.password
    )
      return;
    const endpoint = new URL(getURL("_favicon/"));
    endpoint.searchParams.set("pageUrl", page.href);
    endpoint.searchParams.set("size", "32");
    return endpoint.href;
  } catch {
    return;
  }
}
export function siteIcon(
  title: string,
  url?: string,
  override?: string,
  image?: string,
): HTMLElement {
  const box = document.createElement("span");
  box.className = "site-icon";
  box.setAttribute("aria-hidden", "true");
  const monogram = () => {
    box.replaceChildren();
    box.classList.remove("cached", "packaged");
    delete box.dataset.site;
    box.textContent = override || [...title.trim()][0]?.toUpperCase() || "•";
    box.classList.add(override ? "emoji" : "monogram");
    let hash = 0;
    for (const c of url ?? title) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    box.dataset.tint = String(hash % 6);
  };
  if (image) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = image;
    img.onerror = monogram;
    box.append(img);
    return box;
  }
  if (override) {
    monogram();
    return box;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.width = 20;
  img.height = 20;
  const packaged = () => {
    const asset = siteAsset(url);
    box.classList.remove("cached");
    if (!asset) {
      monogram();
      return;
    }
    box.classList.add("packaged");
    box.dataset.site = asset.split("/").at(-1)?.split(".")[0] ?? "";
    img.onerror = () => {
      img.onerror = null;
      monogram();
    };
    img.src = asset;
    box.replaceChildren(img);
  };
  const cached =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? cachedIconURL(url, chrome.runtime.getURL)
      : undefined;
  if (cached) {
    box.classList.add("cached");
    img.onerror = packaged;
    img.src = cached;
    box.append(img);
  } else packaged();
  return box;
}

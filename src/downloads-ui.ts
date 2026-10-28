import { DownloadStore, downloadStatus, canReveal } from "./downloads";
import { el, button } from "./ui";
import { request } from "./browser";
import { icon } from "./icons";
export function downloadsView(
  store: DownloadStore,
  windowId: number,
): HTMLElement {
  const section = el("section", "", "downloads-view");
  section.ariaLabel = "Recent downloads";
  const heading = el("div", "", "download-heading");
  heading.append(
    el("h2", "Downloads"),
    button("Manage in Chrome", () => request("downloads", { windowId })),
  );
  section.append(
    heading,
    el("p", "Your 50 most recent downloads · stays on this device", "hint"),
  );
  if (store.error) {
    const error = el("p", store.error, "error");
    error.role = "alert";
    section.append(
      error,
      button("Try again", () => store.refresh()),
    );
  }
  if (!store.items.length && !store.error)
    section.append(
      el("p", "No recent downloads", "empty"),
      el("p", "Files you download in Chrome will appear here.", "hint"),
    );
  for (const d of store.items) {
    const row = el("article", "", "download-row"),
      copy = el("div", "", "download-copy");
    const date = new Date(d.start);
    const detail =
      downloadStatus(d) +
      (Number.isFinite(date.valueOf())
        ? " · " +
          date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "");
    copy.append(
      el("div", d.name, "row-label"),
      el("div", detail, "result-detail"),
    );
    if (d.state === "in_progress") {
      const progress = el("progress");
      progress.max = 100;
      if (d.total > 0)
        progress.value = Math.min(100, (d.received / d.total) * 100);
      progress.ariaLabel = "Download progress for " + d.name;
      copy.append(progress);
    }
    if (
      !["safe", "accepted", "allowlistedByPolicy", "deepScannedSafe"].includes(
        d.danger,
      )
    )
      copy.append(el("div", "Review safety status in Chrome", "hint"));
    const reveal = button(
      "Reveal",
      () => request("reveal-download", { downloadId: d.id }),
      "download-reveal",
    );
    reveal.dataset.key = "download-" + d.id;
    reveal.disabled = !canReveal(d);
    reveal.ariaLabel = "Reveal " + d.name + " in Finder or file manager";
    row.append(icon("download"), copy, reveal);
    section.append(row);
  }
  return section;
}

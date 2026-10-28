import { snapshot, preferences, type Snapshot } from "./browser";
import { flatten, defaults } from "./model";
import { el, button, safely, theme, short, runCommand } from "./ui";
let state: Snapshot;
const app = document.querySelector<HTMLElement>("#app")!;
async function refresh() {
  state = await snapshot();
  theme(state);
  app.replaceChildren(
    el("h1", "arcify"),
    el("p", "A quieter place for your tabs.", "muted"),
  );
  const label = el("label", "Bookmark folder");
  const select = el("select");
  for (const b of flatten(state.tree).filter((n) => !n.url && n.parentId)) {
    const option = el(
      "option",
      (b.path ? b.path + " / " : "") +
        b.title +
        (b.unmodifiable ? " (read-only)" : ""),
    );
    option.value = b.id;
    select.append(option);
  }
  select.value = state.prefs.bookmarkRootId ?? "";
  select.onchange = () =>
    void safely(async () => {
      await preferences({
        ...(await snapshot()).prefs,
        bookmarkRootId: select.value,
      });
      await refresh();
    });
  label.append(select);
  app.append(label);
  const themes = el("label", "Theme");
  const choice = el("select");
  for (const value of ["system", "light", "dark"] as const) {
    const o = el("option", value[0].toUpperCase() + value.slice(1));
    o.value = value;
    choice.append(o);
  }
  choice.value = state.prefs.theme;
  choice.onchange = () =>
    void safely(async () => {
      await preferences({
        ...(await snapshot()).prefs,
        theme: choice.value as "system" | "light" | "dark",
      });
      await refresh();
    });
  themes.append(choice);
  app.append(themes);
  app.append(el("h2", "Favourites"));
  const all = flatten(state.tree);
  for (const id of state.prefs.favourites) {
    const b = all.find((n) => n.id === id);
    if (!b) continue;
    const row = el("div", "", "option-row");
    const icon = el("input");
    icon.value = state.prefs.icons[id] ?? "";
    icon.maxLength = 16;
    icon.placeholder = "Emoji";
    icon.ariaLabel = "Icon for " + b.title;
    icon.onchange = () =>
      void safely(async () => {
        const current = (await snapshot()).prefs;
        await preferences({
          ...current,
          icons: { ...current.icons, [id]: icon.value },
        });
        await refresh();
      });
    row.append(
      el("span", b.title),
      icon,
      button("Move up", async () => {
        const current = (await snapshot()).prefs;
        const ids = [...current.favourites],
          i = ids.indexOf(id);
        if (i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
        await preferences({ ...current, favourites: ids });
        await refresh();
      }),
    );
    app.append(row);
  }
  app.append(
    el("h2", "Keyboard"),
    el("p", "Palette: " + short(state, "_execute_action")),
    el("p", "Sidebar: " + short(state, "toggle-sidebar")),
    button("Configure shortcuts", () => runCommand("shortcuts", state)),
    button("Open sidebar", () => runCommand("show-sidebar", state)),
  );
  app.append(
    el("h2", "Help"),
    el(
      "p",
      "Choose left or right placement in Chrome Settings → Appearance → Side panel. Chrome owns the panel frame and popup placement.",
    ),
    el(
      "p",
      "Search locally with > for actions, @ for tabs, and # for bookmarks. Enter activates; Command+Enter (Control+Enter on Windows/Linux) opens a fresh tab. Escape closes a picker first, then the palette.",
    ),
    el(
      "p",
      "Right-click rows for actions. Favourites are local references to native bookmarks. Removing a favourite preserves the bookmark. Deleting a bookmark is a separate confirmed action.",
    ),
    el("h2", "Appearance and icons"),
    el(
      "p",
      "System follows the browser’s light/dark appearance signal live. Explicit Light or Dark overrides it. Chrome custom-theme colours are not available through the allowed APIs.",
    ),
    el(
      "p",
      "Selected website icons are packaged locally. Other sites use local monograms or your chosen emoji. The approved favicon permission reads Chrome’s extension-local favicon endpoint. On load failure, packaged website icons or local monograms are used. Chrome may return its own generic icon for a cache miss. No external favicon service is called.",
    ),
    el(
      "p",
      "The Arc logo and website marks belong to their respective owners and are excluded from the source MIT licence. arcify is an independent project, without affiliation or endorsement.",
    ),
    el("h2", "Privacy"),
    el(
      "p",
      "No accounts, telemetry, remote assets or extension-owned sync. Tab titles and URLs stay local. The tabs permission exposes metadata and may be described by Chrome as reading browsing history. The bookmarks permission includes both reading and writing; Chrome offers no read-only variant.",
    ),
    el(
      "p",
      "Chrome may sync native bookmarks according to your browser settings. Uninstall removes arcify preferences, but does not undo confirmed bookmark changes.",
    ),
    el("p", "Source: github.com/hcassar93/arcify · MIT licence"),
    button("Reset extension preferences…", async () => {
      if (
        confirm("Reset arcify preferences? Native bookmarks will be preserved.")
      ) {
        await preferences({ ...defaults });
        await refresh();
      }
    }),
  );
}
void safely(refresh);

export type CommandId =
  | "new-tab"
  | "toggle-sidebar"
  | "show-sidebar"
  | "hide-sidebar"
  | "fullscreen"
  | "close-tab"
  | "reload"
  | "mute"
  | "pin"
  | "save"
  | "favourite"
  | "collapse-saved"
  | "jump-open"
  | "settings"
  | "shortcuts";
export interface Command {
  id: CommandId;
  label: string;
  aliases: string;
  needsTab?: boolean;
}
export const commands: Command[] = [
  { id: "new-tab", label: "New blank tab", aliases: "new tab create" },
  { id: "toggle-sidebar", label: "Toggle sidebar", aliases: "panel show hide" },
  { id: "show-sidebar", label: "Show sidebar", aliases: "panel open" },
  { id: "hide-sidebar", label: "Hide sidebar", aliases: "panel close" },
  {
    id: "fullscreen",
    label: "Toggle fullscreen",
    aliases: "full screen restore",
  },
  {
    id: "close-tab",
    label: "Close current tab",
    aliases: "close remove",
    needsTab: true,
  },
  {
    id: "reload",
    label: "Reload current tab",
    aliases: "refresh",
    needsTab: true,
  },
  {
    id: "mute",
    label: "Mute or unmute current tab",
    aliases: "audio sound",
    needsTab: true,
  },
  {
    id: "pin",
    label: "Pin or unpin in Chrome",
    aliases: "native pinned",
    needsTab: true,
  },
  {
    id: "save",
    label: "Save current tab to folder",
    aliases: "bookmark",
    needsTab: true,
  },
  {
    id: "favourite",
    label: "Add current tab to favourites",
    aliases: "favorite bookmark",
    needsTab: true,
  },
  { id: "collapse-saved", label: "Collapse saved", aliases: "folders" },
  { id: "jump-open", label: "Jump to open tabs", aliases: "temporary" },
  { id: "settings", label: "Settings", aliases: "theme privacy help" },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    aliases: "configure bindings",
  },
];
export interface CommandContext {
  windowId: number;
  tabId?: number;
  panel: boolean;
  execute: (id: CommandId) => Promise<void>;
}
export function available(c: Command, ctx: CommandContext): boolean {
  return !c.needsTab || ctx.tabId !== undefined;
}
export async function executeCommand(
  id: CommandId,
  ctx: CommandContext,
): Promise<void> {
  const c = commands.find((c) => c.id === id);
  if (!c || !available(c, ctx))
    throw new Error("This action needs an open content tab.");
  await ctx.execute(id);
}

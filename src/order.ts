import { canMove, type Bookmark } from "./model";
export type Placement = "before" | "after" | "inside";
/** Convert a relative target to Chrome's final post-removal sibling index. */
export function bookmarkPlacement(
  source: Bookmark,
  target: Bookmark,
  placement: Placement,
  all: Bookmark[],
): { parentId: string; index?: number } {
  const parent =
    placement === "inside" ? target : all.find((b) => b.id === target.parentId);
  if (!parent || !canMove(source, parent, all) || source.id === target.id)
    throw new Error("Choose a writable destination outside this folder.");
  if (placement === "inside") return { parentId: parent.id };
  const siblings = all
    .filter((b) => b.parentId === parent.id && b.id !== source.id)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const targetIndex = siblings.findIndex((b) => b.id === target.id);
  if (targetIndex < 0)
    throw new Error("The destination moved. Please try again.");
  return {
    parentId: parent.id,
    index: targetIndex + (placement === "after" ? 1 : 0),
  };
}
export function reorderIDs(
  ids: string[],
  source: string,
  target: string,
  placement: "before" | "after",
): string[] {
  if (source === target) return [...ids];
  if (!ids.includes(source) || !ids.includes(target))
    throw new Error("This favourite is no longer available.");
  const list = ids.filter((id) => id !== source);
  list.splice(
    list.indexOf(target) + (placement === "after" ? 1 : 0),
    0,
    source,
  );
  return list;
}

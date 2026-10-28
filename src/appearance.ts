export interface Appearance {
  name?: string;
  emoji?: string;
  image?: string;
}
export function validateAppearance(raw: unknown): Appearance {
  if (!raw || typeof raw !== "object") return {};
  const v = raw as Appearance,
    out: Appearance = {};
  if (v.name !== undefined) {
    if (typeof v.name !== "string" || v.name.length > 120)
      throw new Error("Display names must be at most 120 characters.");
    if (v.name.trim()) out.name = v.name.trim();
  }
  if (v.emoji !== undefined) {
    if (typeof v.emoji !== "string" || v.emoji.length > 16)
      throw new Error("Choose a short icon or emoji.");
    if (v.emoji.trim()) out.emoji = v.emoji.trim();
  }
  if (v.image !== undefined) {
    if (
      typeof v.image !== "string" ||
      v.image.length > 100000 ||
      !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(v.image)
    )
      throw new Error("Choose a validated PNG image.");
    out.image = v.image;
  }
  return out;
}
export function readAppearances(raw: unknown): Record<string, Appearance> {
  const result: Record<string, Appearance> = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [id, value] of Object.entries(raw)) {
    if (["__proto__", "constructor", "prototype"].includes(id)) continue;
    try {
      result[id] = validateAppearance(value);
    } catch {
      /* Recover malformed optional settings. */
    }
  }
  return JSON.stringify(result).length <= 2000000 ? result : {};
}
export function checkAppearanceQuota(value: unknown): void {
  if (JSON.stringify(value).length > 2000000)
    throw new Error(
      "Custom images use 2 MB. Remove an image before adding another.",
    );
}
export async function localImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 2000000
  )
    throw new Error("Choose a PNG, JPEG or WebP smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid =
    file.type === "image/png"
      ? bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71
      : file.type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid) throw new Error("The file contents do not match its image type.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width > 4096 ||
      bitmap.height > 4096
    )
      throw new Error("Images must be no larger than 4096 × 4096.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return validateAppearance({ image: canvas.toDataURL("image/png") }).image!;
  } finally {
    bitmap.close();
  }
}

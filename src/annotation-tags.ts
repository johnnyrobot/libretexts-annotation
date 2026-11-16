import { Problem } from "./store.ts";
export function annotationTags(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    value.some(
      (t) => typeof t !== "string" || !t.trim() || t.trim().length > 40,
    )
  )
    throw new Problem(400, "Use up to 10 tags of 1 to 40 characters.");
  return [...new Set((value as string[]).map((t) => t.trim()))];
}

export type Selector = { start: number; end: number; quote: string };
export function normalizeText(value: string): string;
export function validSelector(
  text: string,
  selector: unknown,
): selector is Selector;
export function matchesAnchor(
  candidate: unknown,
  expected: Record<string, unknown>,
): boolean;

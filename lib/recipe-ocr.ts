import type { Recipe } from "@/lib/types";

/** Normalize for section matching (OCR may drop umlauts). */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reject lines that look like OCR garbage (symbols, too short, no readable content). */
function isLikelyGarbage(line: string): boolean {
  const t = line.trim();
  if (t.length < 5) return true;
  const letters = (t.match(/[a-zA-ZäöüÄÖÜß]/g) ?? []).length;
  const digits = (t.match(/\d/g) ?? []).length;
  const weird = (t.match(/[©£°§®™€¶†‡]/g) ?? []).length;
  if (weird > 1) return true;
  const alphaNum = letters + digits;
  if (alphaNum < 3) return true;
  if (letters > 0 && alphaNum / t.length >= 0.35) return false;
  if (digits > 0 && letters >= 1) return false;
  return alphaNum < t.length * 0.4;
}

/** True if line looks like a subsection header only (e.g. "FÜR DIE KNÖDEL") - skip from list. */
function isSubsectionHeaderOnly(line: string): boolean {
  const n = normalizeForMatch(line);
  const short = line.length < 45;
  if (!short) return false;
  if (n.startsWith("fur die ") || n.startsWith("fur das ") || n === "zutaten") return true;
  if (/^fur (die|das) [a-z]/.test(n) && line.length < 35) return true;
  return false;
}

/** Avoid treating "Für 4 Personen" as ingredient section: "für die/das" must be followed by letters. */
function isRealIngredientSectionStart(line: string, marker: string): boolean {
  const n = normalizeForMatch(line);
  const m = normalizeForMatch(marker);
  if (m !== "fur die" && m !== "fur das") return true;
  const after = n.slice(n.indexOf(m) + m.length).trim();
  if (after.length === 0) return true;
  return /^[a-zäöüß]/i.test(after);
}

const SECTION_MARKERS = [
  "ingredients",
  "ingredient",
  "for the",
  "für das",
  "für die",
  "fur das",
  "fur die",
  "zutaten",
  "instructions",
  "instruction",
  "directions",
  "direction",
  "method",
  "steps",
  "preparation",
  "zubereitung",
  "anleitung",
];

const ING_MARKERS = [
  "ingredients",
  "ingredient",
  "for the",
  "für das",
  "für die",
  "fur das",
  "fur die",
  "zutaten",
];

const INST_MARKERS = [
  "instructions",
  "instruction",
  "directions",
  "direction",
  "method",
  "steps",
  "preparation",
  "zubereitung",
  "anleitung",
];

const ING_HINTS =
  /\d|cup|tbsp|tsp|oz|lb|clove|pinch|salt|pepper|garlic|onion|zucker|mehl|salz|öl|g\s|kg\s|ml\s|el\s|tl\s|prise|becher|päckchen|zehe|zehen|bund|stück|tasse|messerspitze|etwas|geschmack|pfeffer|paprika|brühe|suppe|creme|sahne|butter|margarine|öl|tomaten|zwiebel|knoblauch|^[•\-\*]\s|^\d+[\.\)]\s/i;

/** Parse OCR text from a recipe photo into a structured Recipe. Supports English and German. */
export function parseOcrIntoRecipe(fullText: string): Recipe {
  const text = fullText.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const title =
    lines.find(
      (l) =>
        l.length > 2 &&
        l.length < 120 &&
        !/^\d+[\.\)]/.test(l) &&
        !isLikelyGarbage(l)
    ) ?? "Recipe from photo";

  const normalizedText = normalizeForMatch(text);
  const hasIngredients =
    ING_MARKERS.some((m) => normalizedText.includes(normalizeForMatch(m)));
  const hasInstructions =
    INST_MARKERS.some((m) => normalizedText.includes(normalizeForMatch(m)));

  let ingredients: string[] = [];
  let instructions: string[] = [];

  if (hasIngredients || hasInstructions) {
    const sections: { key: string; start: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lineNorm = normalizeForMatch(lines[i]);
      const lineLow = lines[i].toLowerCase();
      for (const m of SECTION_MARKERS) {
        const mNorm = normalizeForMatch(m);
        const matches =
          lineNorm === mNorm ||
          lineNorm.startsWith(mNorm + " ") ||
          lineNorm.startsWith(mNorm + ":") ||
          lineLow === m ||
          lineLow.startsWith(m + " ") ||
          lineLow.startsWith(m + ":");
        if (matches && isRealIngredientSectionStart(lines[i], m)) {
          sections.push({ key: m, start: i });
          break;
        }
      }
    }
    sections.sort((a, b) => a.start - b.start);

    let ingStart = -1;
    let instStart = -1;
    for (const s of sections) {
      if (ING_MARKERS.some((m) => s.key === m || s.key.startsWith(m)) && ingStart === -1)
        ingStart = s.start;
      if (INST_MARKERS.some((m) => s.key === m || s.key.startsWith(m)) && instStart === -1)
        instStart = s.start;
    }

    if (ingStart >= 0) {
      const end =
        instStart >= 0 ? Math.min(instStart, lines.length) : lines.length;
      ingredients = lines.slice(ingStart + 1, end).filter((l) => {
        if (isLikelyGarbage(l)) return false;
        if (isSubsectionHeaderOnly(l)) return false;
        if (l.length < 3) return false;
        return (
          /\d|[a-zA-ZäöüÄÖÜß]{2,}/.test(l) &&
          (ING_HINTS.test(l) || l.length >= 10)
        );
      });
    }
    if (instStart >= 0) {
      instructions = lines.slice(instStart + 1).filter((l) => {
        if (isLikelyGarbage(l)) return false;
        if (l.length < 8) return false;
        return (
          /^\d+[\.\)]\s|^[•\-\*]\s|^step\s|^schritt\s/i.test(l) ||
          (l.length >= 12 && /[a-zA-ZäöüÄÖÜß]/.test(l))
        );
      });
    }
  }

  if (ingredients.length === 0 && instructions.length === 0) {
    const bulletLines = lines.filter(
      (l) =>
        !isLikelyGarbage(l) &&
        (/^[•\-\*]\s/.test(l) || /^\d+[\.\)]\s/.test(l) || /^\d+\./.test(l))
    );
    const firstNum = bulletLines.findIndex((l) => /^\d+[\.\)]\s/.test(l));
    if (firstNum >= 0) {
      instructions = bulletLines.slice(firstNum).filter((l) => l.length > 5);
      ingredients = bulletLines.slice(0, firstNum).filter((l) => l.length > 2 && !isLikelyGarbage(l));
    } else {
      ingredients = lines.filter(
        (l) =>
          !isLikelyGarbage(l) &&
          l.length >= 4 &&
          l.length < 120 &&
          (ING_HINTS.test(l) || l.length >= 10)
      );
      instructions = lines.filter(
        (l) =>
          !isLikelyGarbage(l) &&
          l.length >= 18 &&
          (/^\d+[\.\)]\s/.test(l) || /^step\s|^schritt\s/i.test(l) || l.includes("."))
      );
    }
  }

  ingredients = ingredients.filter((l) => !isLikelyGarbage(l) && !isSubsectionHeaderOnly(l));
  instructions = instructions.filter((l) => !isLikelyGarbage(l));

  return {
    name: isLikelyGarbage(title) ? "Recipe from photo" : title,
    ingredients: ingredients.length ? ingredients : ["(Check photo for ingredients)"],
    instructions: instructions.length
      ? instructions
      : ["(Check photo for instructions)"],
  };
}

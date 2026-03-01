import { NextResponse } from "next/server";
import type { Locale } from "@/lib/i18n";
import type { Recipe } from "@/lib/types";

const LIBRETRANSLATE_URL = "https://libretranslate.com/translate";
const MAX_CHARS = 2000;
const DELIM = "\n";

const LOCALE_TO_CODE: Record<Locale, string> = {
  en: "en",
  de: "de",
  zh: "zh",
  ko: "ko",
};

async function translateText(
  text: string,
  targetCode: string,
  apiKey?: string
): Promise<string> {
  if (!text.trim()) return text;
  const chunk = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: chunk,
      source: "auto",
      target: targetCode,
      format: "text",
      ...(apiKey && { api_key: apiKey }),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Translation failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { translatedText?: string };
  return data.translatedText ?? text;
}

/** True if text likely needs translation into the target (e.g. contains CJK when target is en). */
function likelyNeedsTranslation(text: string, target: Locale): boolean {
  const hasCJK = /[\u4e00-\u9fff\u3100-\u312f\uac00-\ud7af]/.test(text);
  const hasCyrillic = /[\u0400-\u04ff]/.test(text);
  const hasArabic = /[\u0600-\u06ff]/.test(text);
  if (target === "en" && (hasCJK || hasCyrillic || hasArabic)) return true;
  if (target === "de" && (hasCJK || hasCyrillic || hasArabic)) return true;
  if (target === "zh" || target === "ko") {
    const mainlyLatin = /^[\x00-\x7f\s\u00c0-\u024f.,;:!?'"-]+$/u.test(text.trim());
    if (mainlyLatin && text.trim().length > 20) return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      target?: Locale;
      recipe?: Pick<Recipe, "name" | "ingredients" | "instructions" | "notes">;
    };
    const target = body.target ?? "en";
    const code = LOCALE_TO_CODE[target];
    if (!code) {
      return NextResponse.json({ error: "Invalid target language" }, { status: 400 });
    }
    const apiKey = process.env.LIBRETRANSLATE_API_KEY;

    if (body.recipe) {
      const { name, ingredients, instructions, notes } = body.recipe;
      const sample = [name, ingredients?.[0] ?? "", instructions?.[0] ?? ""].join(" ");
      if (!likelyNeedsTranslation(sample, target)) {
        return NextResponse.json({
          recipe: {
            name: body.recipe.name,
            ingredients: body.recipe.ingredients ?? [],
            instructions: body.recipe.instructions ?? [],
            notes: body.recipe.notes,
          },
        });
      }
      const [translatedName, ingredientsBlock, instructionsBlock, translatedNotes] =
        await Promise.all([
          name ? translateText(name, code, apiKey) : Promise.resolve(""),
          ingredients?.length
            ? translateText(ingredients.join(DELIM), code, apiKey).then((s) =>
                s.split(DELIM).map((t) => t.trim()).filter(Boolean)
              )
            : Promise.resolve([] as string[]),
          instructions?.length
            ? translateText(instructions.join(DELIM), code, apiKey).then((s) =>
                s.split(DELIM).map((t) => t.trim()).filter(Boolean)
              )
            : Promise.resolve([] as string[]),
          notes ? translateText(notes, code, apiKey) : Promise.resolve(undefined),
        ]);
      return NextResponse.json({
        recipe: {
          name: translatedName || name,
          ingredients: ingredientsBlock.length ? ingredientsBlock : ingredients ?? [],
          instructions: instructionsBlock.length ? instructionsBlock : instructions ?? [],
          notes: translatedNotes ?? notes,
        },
      });
    }

    if (body.text != null) {
      const translated = await translateText(body.text, code, apiKey);
      return NextResponse.json({ translatedText: translated });
    }

    return NextResponse.json(
      { error: "Provide text or recipe" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Translate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 }
    );
  }
}

import * as cheerio from "cheerio";
import type { Recipe } from "@/lib/types";

/** Try to extract a Recipe from JSON-LD or microdata when the main scraper fails. */
export async function fallbackRecipeFromUrl(url: string): Promise<Recipe | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; RecipeSlate/1.0; +https://github.com/recipe-slate)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);

  // 1. Try JSON-LD script tags
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const text = $(scripts[i]).html()?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text) as unknown;
      const recipe = extractRecipeFromJsonLd(data);
      if (recipe) {
        return { ...recipe, source: url };
      }
    } catch {
      // skip invalid JSON
    }
  }

  // 2. Try microdata (itemprop)
  const nameEl = $('[itemprop="name"]').first();
  const name = nameEl.text().trim() || null;
  const ingredients: string[] = [];
  $('[itemprop="recipeIngredient"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) ingredients.push(text);
  });
  const instructions: string[] = [];
  $('[itemprop="recipeInstructions"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) instructions.push(text);
  });
  if (name && (ingredients.length > 0 || instructions.length > 0)) {
    const imageEl = $('[itemprop="image"]').first();
    let image: string | null = null;
    if (imageEl.attr("content")) image = imageEl.attr("content") ?? null;
    else if (imageEl.find("img").attr("src")) image = imageEl.find("img").attr("src") ?? null;
    return {
      name,
      source: url,
      image,
      ingredients: ingredients.length ? ingredients : ["(See page for ingredients)"],
      instructions: instructions.length ? instructions : ["(See page for instructions)"],
    };
  }

  return null;
}

function extractRecipeFromJsonLd(data: unknown): Omit<Recipe, "source"> | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;

  // @graph array: find first Recipe
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"] as unknown[]) {
      const recipe = extractRecipeFromJsonLd(item);
      if (recipe) return recipe;
    }
  }

  const type = obj["@type"];
  const isRecipe =
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"));

  if (!isRecipe) return null;

  const name = stringOrFirst(obj.name);
  const ingredients = stringArray(obj.recipeIngredient ?? obj.ingredients);
  const instructions = instructionArray(obj.recipeInstructions);
  const image = stringOrFirst(obj.image);

  const prepTime = stringOrFirst(obj.prepTime);
  const cookTime = stringOrFirst(obj.cookTime);
  const totalTime = stringOrFirst(obj.totalTime);
  const recipeYield = obj.recipeYield != null ? String(obj.recipeYield) : undefined;

  if (!name && ingredients.length === 0 && instructions.length === 0) return null;

  return {
    name: name || "Untitled Recipe",
    image: image || null,
    ingredients: ingredients.length ? ingredients : ["(See page for ingredients)"],
    instructions: instructions.length ? instructions : ["(See page for instructions)"],
    prepTime,
    cookTime,
    totalTime,
    servings: recipeYield,
  };
}

function stringOrFirst(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string")
    return (v[0] as string).trim() || undefined;
  return undefined;
}

function stringArray(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : String(x)).trim()).filter(Boolean);
  return [];
}

function instructionArray(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const step of v) {
    if (typeof step === "string") {
      if (step.trim()) out.push(step.trim());
    } else if (step && typeof step === "object" && "text" in step && typeof (step as { text: string }).text === "string") {
      const t = (step as { text: string }).text.trim();
      if (t) out.push(t);
    } else if (step && typeof step === "object" && "name" in step && typeof (step as { name: string }).name === "string") {
      const t = (step as { name: string }).name.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

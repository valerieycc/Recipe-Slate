import { NextResponse } from "next/server";
import getRecipeData from "@dimfu/recipe-scraper";
import type { Recipe } from "@/lib/types";
import { fallbackRecipeFromUrl } from "@/lib/recipe-fallback";

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid URL" },
        { status: 400 }
      );
    }

    let data: Awaited<ReturnType<typeof getRecipeData>> | null = null;

    try {
      data = await getRecipeData(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("402") || msg.includes("PAYMENT_REQUIRED")) {
        return NextResponse.json({ error: "PAYWALLED", errorCode: "PAYWALLED" }, { status: 422 });
      }
      // Try fallback on any scraper failure (e.g. "r is not a function" from library)
      try {
        const fallback = await fallbackRecipeFromUrl(url);
        if (fallback) return NextResponse.json(fallback);
      } catch (fallbackErr) {
        const fm = fallbackErr instanceof Error ? fallbackErr.message : "";
        if (fm === "PAYMENT_REQUIRED" || fm.includes("402")) {
          return NextResponse.json({ error: "PAYWALLED", errorCode: "PAYWALLED" }, { status: 422 });
        }
        // don't replace original error with fallback error
      }
      throw err;
    }

    if (!data) {
      try {
        const fallback = await fallbackRecipeFromUrl(url);
        if (fallback) return NextResponse.json(fallback);
      } catch (fallbackErr) {
        const fm = fallbackErr instanceof Error ? fallbackErr.message : "";
        if (fm === "PAYMENT_REQUIRED" || fm.includes("402")) {
          return NextResponse.json({ error: "PAYWALLED", errorCode: "PAYWALLED" }, { status: 422 });
        }
        throw fallbackErr;
      }
      return NextResponse.json(
        { error: "No recipe data found at this URL", errorCode: "NO_RECIPE_DATA" },
        { status: 422 }
      );
    }

    let recipe: Recipe;
    try {
      const instructions: string[] = Array.isArray(data.recipeInstructions)
        ? (data.recipeInstructions as unknown[]).map((step) =>
            typeof step === "string" ? step : (step as { text?: string })?.text ?? String(step)
          )
        : [];

      recipe = {
        name: data.name ?? "Untitled Recipe",
        source: data.url ?? url,
        image: data.image ?? null,
        ingredients: Array.isArray(data.recipeIngredients)
          ? data.recipeIngredients.map(String)
          : [],
        instructions,
        prepTime: data.prepTime ?? undefined,
        cookTime: data.cookTime ?? undefined,
        totalTime: data.totalTime ?? undefined,
        servings: data.recipeYield != null ? String(data.recipeYield) : undefined,
      };
    } catch (buildErr) {
      // Scraper returned data in an unexpected shape (e.g. causes "r is not a function")
      try {
        const fallback = await fallbackRecipeFromUrl(url);
        if (fallback) return NextResponse.json(fallback);
      } catch (fallbackErr) {
        const fm = fallbackErr instanceof Error ? fallbackErr.message : "";
        if (fm === "PAYMENT_REQUIRED" || fm.includes("402")) {
          return NextResponse.json({ error: "PAYWALLED", errorCode: "PAYWALLED" }, { status: 422 });
        }
      }
      throw buildErr;
    }

    return NextResponse.json(recipe);
  } catch (err) {
    console.error("Recipe URL scrape error:", err);
    const msg = err instanceof Error ? err.message : "Failed to scrape recipe";
    if (msg.includes("402") || msg.includes("PAYMENT_REQUIRED")) {
      return NextResponse.json({ error: "PAYWALLED", errorCode: "PAYWALLED" }, { status: 422 });
    }
    const isValidation = msg.includes("not valid") || msg.includes("Recipe is not valid");
    // Don't expose minified/library errors like "r is not a function" to the user
    const userMessage =
      isValidation
        ? "No recipe data found at this URL. The site may not include structured recipe data."
        : /\b\w+ is not a function\b/i.test(msg) || msg.length < 30
          ? "Something went wrong importing this recipe. Try again or use a different URL."
          : msg;
    const errorCode = isValidation ? "NO_RECIPE_DATA" : "IMPORT_FAILED";
    return NextResponse.json(
      { error: userMessage, errorCode },
      { status: isValidation ? 422 : 500 }
    );
  }
}

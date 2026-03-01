declare module "@dimfu/recipe-scraper" {
  interface ScrapedRecipe {
    url?: string;
    name?: string;
    image?: string;
    description?: string;
    cookTime?: string;
    prepTime?: string;
    totalTime?: string;
    recipeYield?: string | number;
    recipeIngredients?: string[];
    recipeInstructions?: string[] | Array<{ text?: string }>;
    recipeCategories?: string[];
    recipeCuisines?: string[];
    keywords?: string[];
  }

  function getRecipeData(
    input: string | { url?: string; html?: string },
    inputOptions?: { maxRedirects?: number; lang?: string; timeout?: number }
  ): Promise<ScrapedRecipe | undefined>;

  export default getRecipeData;
}

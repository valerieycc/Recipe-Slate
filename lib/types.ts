export interface Recipe {
  name: string;
  source?: string;
  image?: string | null;
  ingredients: string[];
  /** When set, display ingredients grouped by section (e.g. "For the dumplings", "For the ragout"). */
  ingredientSections?: { title: string; items: string[] }[];
  instructions: string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string;
  notes?: string;
}

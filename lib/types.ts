export interface Recipe {
  name: string;
  source?: string;
  image?: string | null;
  ingredients: string[];
  instructions: string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string;
  notes?: string;
}

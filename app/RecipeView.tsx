"use client";

import type { Recipe } from "@/lib/types";
import { useLocale } from "./LocaleProvider";
import { RecipeShell } from "@/components/RecipeShell";

export function RecipeView({ recipe }: { recipe: Recipe }) {
  const { t } = useLocale();
  return <RecipeShell recipe={recipe} t={t} />;
}

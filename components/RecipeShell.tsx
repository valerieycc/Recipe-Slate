"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { Recipe } from "@/lib/types";

type Tab = "ingredients" | "steps";

type RecipeShellProps = {
  recipe: Recipe;
  t: (key: string, params?: Record<string, string | number>) => string;
  onRecipeChange?: (recipe: Recipe) => void;
};

export function RecipeShell({ recipe, t, onRecipeChange }: RecipeShellProps) {
  const [tab, setTab] = useState<Tab>("ingredients");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(recipe.name);
  const [editIngredients, setEditIngredients] = useState(recipe.ingredients.join("\n"));
  const [editInstructions, setEditInstructions] = useState(recipe.instructions.join("\n"));

  const canEdit = typeof onRecipeChange === "function";

  useEffect(() => {
    if (!editing) {
      setEditName(recipe.name);
      setEditIngredients(recipe.ingredients.join("\n"));
      setEditInstructions(recipe.instructions.join("\n"));
    }
  }, [recipe.name, recipe.ingredients, recipe.instructions, editing]);

  function startEditing() {
    setEditName(recipe.name);
    setEditIngredients(recipe.ingredients.join("\n"));
    setEditInstructions(recipe.instructions.join("\n"));
    setEditing(true);
  }

  function saveEditing() {
    onRecipeChange?.({
      ...recipe,
      name: editName.trim() || recipe.name,
      ingredients: editIngredients
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean),
      instructions: editInstructions
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    });
    setEditing(false);
  }

  function cancelEditing() {
    setEditName(recipe.name);
    setEditIngredients(recipe.ingredients.join("\n"));
    setEditInstructions(recipe.instructions.join("\n"));
    setEditing(false);
  }

  return (
    <article className="overflow-hidden rounded-[0.5rem] border border-stone-200/80 bg-white">
      {/* Hero image: full-width, gallery-print treatment */}
      {recipe.image && (
        <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
          <div className="absolute inset-[1px] overflow-hidden rounded-t-[calc(0.5rem-1px)] sm:inset-[2px] sm:rounded-t-[calc(0.5rem-2px)]">
            <Image
              src={recipe.image}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 1024px"
              unoptimized
              priority
            />
          </div>
        </div>
      )}

      {/* Editorial block: title, source, meta — generous spacing */}
      <div className="border-b border-stone-200/60 px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-medium tracking-tight text-stone-900 sm:text-[1.75rem] sm:tracking-tight">
            {editing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-stone-200 bg-stone-50 px-2 py-1 text-inherit focus:border-stone-400 focus:outline-none"
              />
            ) : (
              recipe.name
            )}
          </h1>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={startEditing}
              className="shrink-0 text-sm font-medium text-stone-500 hover:text-stone-700"
            >
              {t("editRecipe")}
            </button>
          )}
          {editing && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={saveEditing}
                className="text-sm font-medium text-stone-700 hover:text-stone-900"
              >
                {t("saveEdits")}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="text-sm text-stone-500 hover:text-stone-700"
              >
                {t("cancel")}
              </button>
            </div>
          )}
        </div>
        {recipe.source && (
          <p className="mt-3 text-sm text-stone-500">
            {t("from")}{" "}
            <a
              href={recipe.source}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-stone-400/60 text-stone-600 hover:border-stone-600 hover:text-stone-800"
            >
              {new URL(recipe.source).hostname}
            </a>
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
          {recipe.prepTime && (
            <span>{t("prep")}: {recipe.prepTime}</span>
          )}
          {recipe.cookTime && (
            <span>{t("cook")}: {recipe.cookTime}</span>
          )}
          {recipe.totalTime && (
            <span>{t("total")}: {recipe.totalTime}</span>
          )}
          {recipe.servings && (
            <span>{t("serves")} {recipe.servings}</span>
          )}
        </div>
      </div>

      {/* Tabs: minimal, refined active state */}
      <nav className="flex border-b border-stone-200/60" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ingredients"}
          onClick={() => setTab("ingredients")}
          className={`flex-1 px-6 py-4 text-left text-sm font-medium transition-colors sm:px-10 ${
            tab === "ingredients"
              ? "border-b border-stone-800 text-stone-900"
              : "text-stone-500 hover:text-stone-700"
          }`}
        >
          {t("ingredients")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "steps"}
          onClick={() => setTab("steps")}
          className={`flex-1 px-6 py-4 text-left text-sm font-medium transition-colors sm:px-10 ${
            tab === "steps"
              ? "border-b border-stone-800 text-stone-900"
              : "text-stone-500 hover:text-stone-700"
          }`}
        >
          {t("steps")}
        </button>
      </nav>

      {/* Panel: calm body text, generous line-height */}
      <div className="min-h-[280px] px-6 py-8 sm:px-10 sm:py-10">
        {tab === "ingredients" && (
          <>
            {editing ? (
              <textarea
                value={editIngredients}
                onChange={(e) => setEditIngredients(e.target.value)}
                rows={12}
                className="w-full rounded border border-stone-200 bg-stone-50 px-3 py-2 text-stone-700 focus:border-stone-400 focus:outline-none"
                placeholder="One ingredient per line"
              />
            ) : recipe.ingredientSections && recipe.ingredientSections.length > 0 ? (
              <div className="space-y-6 text-stone-700 [line-height:1.75]">
                {recipe.ingredientSections.map((section, si) => (
                  <div key={si}>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-600">
                      {section.title}
                    </h3>
                    <ul className="space-y-2">
                      {section.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-stone-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-3 text-stone-700 [line-height:1.75]">
                {recipe.ingredients.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-stone-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === "steps" && (
          <>
            {editing ? (
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={14}
                className="w-full rounded border border-stone-200 bg-stone-50 px-3 py-2 text-stone-700 focus:border-stone-400 focus:outline-none"
                placeholder="One step per line"
              />
            ) : (
              <ol className="space-y-6 text-stone-700 [line-height:1.75]">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-sm font-medium text-stone-500">
                      {i + 1}
                    </span>
                    <span className="pt-px">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      {recipe.notes && (
        <div className="border-t border-stone-200/60 bg-stone-50/50 px-6 py-4 text-sm text-stone-600 sm:px-10 sm:py-5 [line-height:1.65]">
          <span className="font-medium text-stone-700">{t("note")}:</span> {recipe.notes}
        </div>
      )}
    </article>
  );
}

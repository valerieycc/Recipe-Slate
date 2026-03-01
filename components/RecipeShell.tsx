"use client";

import { useState } from "react";
import Image from "next/image";
import type { Recipe } from "@/lib/types";

type Tab = "ingredients" | "steps";

type RecipeShellProps = {
  recipe: Recipe;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function RecipeShell({ recipe, t }: RecipeShellProps) {
  const [tab, setTab] = useState<Tab>("ingredients");

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
        <h1 className="text-3xl font-light tracking-tight text-stone-900 sm:text-4xl sm:tracking-tight">
          {recipe.name}
        </h1>
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
          <ul className="space-y-3 text-stone-700 [line-height:1.75]">
            {recipe.ingredients.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-stone-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === "steps" && (
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
      </div>

      {recipe.notes && (
        <div className="border-t border-stone-200/60 bg-stone-50/50 px-6 py-4 text-sm text-stone-600 sm:px-10 sm:py-5 [line-height:1.65]">
          <span className="font-medium text-stone-700">{t("note")}:</span> {recipe.notes}
        </div>
      )}
    </article>
  );
}

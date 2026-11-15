import type { Category } from "@/lib/api-types";
export interface SpendingCategory {
  id: string;
  label: string;
  parent: Category;
  monthlyBudget: number | null;
  version: string;
}
export interface SaveCategory {
  id?: string;
  label: string;
  parent: Category;
  monthlyBudget: number | null;
  version?: string;
}
export interface SpendingInsights {
  from: string;
  until: string;
  monthFrom: string;
  total: number;
  count: number;
  activeDays: number;
  averagePerEntry: number;
  recentWeek: number;
  previousWeek: number;
  categories: (SpendingCategory & {
    spent: number;
    count: number;
    remaining: number | null;
  })[];
  weekdays: {
    day: number;
    amount: number;
    count: number;
    activeDays: number;
  }[];
  recurring: { label: string; amount: number; count: number; days: number }[];
  suggestions: {
    categoryId: string;
    label: string;
    amount: number;
    reason: string;
  }[];
  observations: string[];
  aiText?: string;
}

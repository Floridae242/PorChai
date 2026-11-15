import type { Category } from "@/lib/api-types";

export interface FinanceReport {
  period: "day" | "month";
  from: string;
  until: string; // exclusive calendar boundary
  asOf: string; // Thai date; future days have null amounts
  spending: number;
  income: number;
  net: number; // recorded income minus spending, not available balance or savings
  entriesCount: number;
  categories: { category: Category; amount: number; count: number }[];
  days: { date: string; spent: number | null; income: number | null }[];
}
export interface NotificationPreferences {
  daily: boolean;
  monthly: boolean;
  budget: boolean;
  time: string;
}
export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  daily: false,
  monthly: false,
  budget: false,
  time: "20:00",
};
export interface SearchSource {
  title: string;
  url: string;
}
export interface SearchResult {
  mode: "web" | "entries";
  answer: string;
  sources: SearchSource[];
  entries?: {
    id: string;
    note: string | null;
    amount: number;
    category: Category;
    spentOn: string;
  }[];
  count?: number;
  total?: number;
  suggestions?: string[]; // provider-supplied widgets isolated in sandboxed iframes
  citations?: { end: number; source: number }[];
}

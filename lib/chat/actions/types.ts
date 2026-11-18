import type {
  Entry,
  NewCycleRequest,
  Plan,
  UserCategory,
} from "@/lib/api-types";
import type {
  NotificationPreferences,
  FinanceReport,
} from "@/lib/reports/types";
import type { InstallmentInput } from "./installments";
import type { SaveCategory } from "@/lib/insights/types";
import type { NewEntryRequest } from "@/lib/api-types";
import type { NewBillSchedule } from "@/lib/bills/types";

export type Tool =
  | "help"
  | "insights"
  | "categories"
  | "category_save"
  | "category_entry"
  | "setup"
  | "income"
  | "entry"
  | "report"
  | "search"
  | "entries"
  | "plans"
  | "add_bill"
  | "add_plan"
  | "installments"
  | "points"
  | "claim_points"
  | "rewards"
  | "promos"
  | "notifications"
  | "bill_reminder_help"
  | "reminders"
  | "balance"
  | "buffer"
  | "payday"
  | "essentials"
  | "entry_edit"
  | "entry_delete"
  | "plan_action"
  | "web";
export interface Intent {
  tool: Tool;
  repeat?: "monthly";
  amount?: number;
  title?: string;
  date?: string;
  query?: string;
  period?: "day" | "week" | "month" | "year";
  enabled?: boolean;
  notification?: "daily" | "monthly" | "budget" | "all";
  time?: string;
  food?: number;
  transport?: number;
  target?: "latest" | number;
  page?: number;
  action?: "pay" | "unpay" | "cancel" | "postpone" | "keep";
  selected?: { id: string; title: string; amount: number; status?: string }; // populated only from server-owned lists
}
export type Mutation =
  | { op: "bill_schedule_add"; input: NewBillSchedule }
  | {op:"category_save";input:SaveCategory}
  | {op:"category_entry";input:NewEntryRequest}
  | { op: "installments"; input: InstallmentInput }
  | {
      op: "plan_add";
      input: {
        kind: "bill" | "purchase";
        title: string;
        amount: number;
        dueOn: string | null;
        category: UserCategory;
      };
    }
  | {
      op: "plan_action";
      id: string;
      action: NonNullable<Intent["action"]>;
      expected: Pick<Plan, "amount" | "status" | "title">;
    }
  | { op: "entry_edit"; id: string; amount: number; expected: Entry }
  | { op: "entry_delete"; id: string; expected: Entry }
  | {
      op: "notifications";
      value: NotificationPreferences;
      previous: NotificationPreferences;
    }
  | {
      op: "reminders";
      enabled: boolean;
      time: string;
      previous: { enabled: boolean; time: string; pausedUntil: string | null };
    }
  | { op: "balance"; amount: number }
  | { op: "buffer"; amount: number; previous: number }
  | { op: "payday"; date: string }
  | { op: "essentials"; food: number; transport: number }
  | { op: "redeem"; id: string; cost: number; title: string }
  | { op: "cycle"; input: NewCycleRequest };
export interface CommandPending {
  kind: "chat_command";
  key: string;
  action: Mutation;
  basis?: string;
  closed?: true;
}
export interface FormPending {
  kind: "chat_form";
  intent: Intent;
  field: "amount" | "date" | "title" | "food" | "transport" | "time";
}
export interface ListPending {
  kind: "chat_list";
  key: string;
  type: "entry" | "plan" | "reward";
  items: NonNullable<Intent["selected"]>[];
  purpose?: Intent;
  page?: number;
}
export interface SetupPending {
  kind: "chat_setup";
  key: string;
  field:
    | "source"
    | "frequency"
    | "balance"
    | "payday"
    | "savings"
    | "buffer"
    | "food"
    | "transport";
  input: Partial<NewCycleRequest>;
}
export type ActionPending =
  CommandPending | FormPending | ListPending | SetupPending;
export type ReportPeriod = FinanceReport["period"];

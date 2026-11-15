export interface BillSchedule {
  id: string;
  title: string;
  amount: number; // integer satang
  startsOn: string;
  repeat: "once" | "monthly";
  notify: boolean;
  enabled: boolean;
}
export type NewBillSchedule = Pick<
  BillSchedule,
  "title" | "amount" | "startsOn" | "repeat" | "notify"
>;

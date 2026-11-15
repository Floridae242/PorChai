import { WorkPool } from "@/lib/runtime/work-pool";

// Analytics reads have bounded concurrency/queue independently of financial writes.
export const reportReads = new WorkPool(16, 512, 5000);

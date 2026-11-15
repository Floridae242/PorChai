import { expect, it } from "vitest";
import { createMockApi } from "./mock";

it("mock report preserves the food category of a purchase paid from a plan", async () => {
  const api=createMockApi({consented:true,scenario:"midCycle",today:"2026-11-15"});
  const before=await api.report("month");
  const plan=await api.addPlan({kind:"purchase",status:"reserved",title:"อาหารในแผน",amount:500,category:"food"},"food-plan");
  await api.planAction(plan.plan.id,"pay",{category:"food"});
  const after=await api.report("month");
  expect(after.categories.find(c=>c.category==="food")!.amount).toBe((before.categories.find(c=>c.category==="food")?.amount??0)+500);
  expect(after.categories.find(c=>c.category==="bills")?.amount??0).toBe(before.categories.find(c=>c.category==="bills")?.amount??0);
});
it("mock report counts recorded income and clears added notification/income state on deletion",async()=>{
  const api=createMockApi({consented:true,scenario:"midCycle",today:"2026-11-15"});
  await api.addIncome({amount:10000,note:"รายรับทดสอบ",receivedOn:"2026-11-15"},"income-report");
  expect((await api.report("month")).income).toBe(10000);
  await api.saveNotificationPreferences({daily:true,monthly:false,budget:false,time:"20:00"});await api.deleteMyData();
  expect((await api.report("month")).income).toBe(0);expect((await api.notificationPreferences()).daily).toBe(false);
});

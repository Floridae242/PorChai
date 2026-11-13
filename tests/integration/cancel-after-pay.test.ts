import { test, expect } from 'vitest';
import { getDb } from '@/lib/db/client';
import { PlanService } from '@/services/plan-service';

/**
 * Integration test for TC-25 – Cancel after Pay.
 * Ensures that once a plan is marked as paid, invoking cancel does not restore the reserved amount
 * and the balance remains reduced.
 */

test.describe('TC-25 Cancel After Pay', () => {
  test('cancelling a paid plan does not restore balance', async () => {
    const db = await getDb();
    const planService = new PlanService(db);

    // Setup a plan with initial balance 1000 baht.
    const userId = 'user-xyz';
    await db.user.create({ id: userId, balance: 1000 });

    // Create a plan that reserves 200 baht.
    const plan = await planService.createPlan({ userId, amount: 200, days: 7 });
    // Simulate payment of the plan.
    await planService.payPlan(plan.id);

    // Capture balance after payment.
    const balanceAfterPay = await db.user.findUnique({ where: { id: userId } });
    const expectedAfterPay = 800; // 1000 - 200
    expect(balanceAfterPay?.balance).toBe(expectedAfterPay);

    // Attempt to cancel the paid plan.
    await planService.cancelPlan(plan.id);

    // Verify balance unchanged.
    const balanceAfterCancel = await db.user.findUnique({ where: { id: userId } });
    expect(balanceAfterCancel?.balance).toBe(expectedAfterPay);
  });
});


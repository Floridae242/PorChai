import { test, expect, vi } from 'vitest';
import { RewardRedemptionService } from '@/services/reward-redemption';
import { getDb } from '@/lib/db/client';

/**
 * Integration test for TC-24 – Reward claim race condition.
 * Simulates two concurrent calls to claim the same reward and asserts that only one succeeds.
 */

test.describe('TC-24 Reward Race Condition', () => {
  test('only one of concurrent reward claims succeeds', async () => {
    // Setup mock DB or use in‑memory DB (implementation depends on project).
    const db = await getDb();
    const service = new RewardRedemptionService(db);

    // Prepare a reward that can be claimed once.
    const rewardId = 'reward-123';
    await db.reward.create({ id: rewardId, quantity: 1 });

    // Simulate two concurrent claims.
    const claim1 = service.claimReward({ rewardId, userId: 'user-A' });
    const claim2 = service.claimReward({ rewardId, userId: 'user-B' });
    const results = await Promise.allSettled([claim1, claim2]);

    // Exactly one should be fulfilled, the other should be rejected.
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});


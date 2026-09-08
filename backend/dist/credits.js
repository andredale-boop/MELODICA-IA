import { randomUUID } from 'node:crypto';
export const CREDIT_COSTS = Object.freeze({
    MUSIC_DNA: 10, AUDIO_ANALYSIS: 15, AI_MIX: 30, AI_MASTER: 50,
    VOICE_GENERATION: 75, SONG_GENERATION: 150,
    VIDEO_5_STANDARD: 150, VIDEO_5_HD: 250, VIDEO_10_STANDARD: 300,
    VIDEO_10_HD: 500, VIDEO_30_STANDARD: 900, VIDEO_30_HD: 1500,
    VIDEO_60_STANDARD: 1800, VIDEO_60_HD: 3000
});
export const PLAY_PRODUCTS = Object.freeze({ credits_500: 500, credits_1500: 1500, credits_5000: 5000 });
async function ledger(client, userId, amount, kind, referenceId, metadata = {}) {
    const id = randomUUID();
    await client.query(`INSERT INTO credit_ledger(id,user_id,amount,kind,reference_id,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [id, userId, amount, kind, referenceId, metadata]);
}
export async function reserveCreditsTx(c, userId, amount, referenceId) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error('INVALID_CREDIT_AMOUNT');
    // Insert the idempotency ledger row BEFORE changing the balance. The unique
    // constraint serializes concurrent requests using the same reference and
    // prevents a double reservation. The surrounding transaction guarantees
    // that a later job INSERT failure rolls the reservation back as well.
    const inserted = await c.query(`INSERT INTO credit_ledger(user_id,amount,kind,reference_id,metadata) VALUES($1,$2,'RESERVE',$3,$4) ON CONFLICT(user_id,kind,reference_id) DO NOTHING RETURNING id`, [userId, -amount, referenceId, { amount }]);
    if (!inserted.rowCount) {
        const existing = await c.query(`SELECT balance,reserved FROM credit_accounts WHERE user_id=$1`, [userId]);
        return existing.rows[0] ?? { balance: 0, reserved: 0 };
    }
    await c.query(`INSERT INTO credit_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [userId]);
    const r = await c.query(`UPDATE credit_accounts SET balance=balance-$2,reserved=reserved+$2,updated_at=now() WHERE user_id=$1 AND balance >= $2 RETURNING balance,reserved`, [userId, amount]);
    if (!r.rowCount)
        throw new Error('INSUFFICIENT_CREDITS');
    return r.rows[0];
}
export async function reserveCredits(pool, userId, amount, referenceId) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const result = await reserveCreditsTx(c, userId, amount, referenceId);
        await c.query('COMMIT');
        return result;
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}
export async function settleCreditsTx(c, userId, reservedAmount, actualAmount, referenceId) {
    if (reservedAmount < 0 || actualAmount < 0 || actualAmount > reservedAmount)
        throw new Error('INVALID_SETTLEMENT');
    const refund = reservedAmount - actualAmount;
    const r = await c.query(`UPDATE credit_accounts SET reserved=reserved-$2,balance=balance+$3,updated_at=now() WHERE user_id=$1 AND reserved >= $2 RETURNING balance,reserved`, [userId, reservedAmount, refund]);
    if (!r.rowCount)
        throw new Error('RESERVATION_NOT_FOUND');
    await ledger(c, userId, -actualAmount, 'SETTLE', referenceId, { reservedAmount, actualAmount });
    if (refund)
        await ledger(c, userId, refund, 'REFUND', referenceId, { reservedAmount, actualAmount });
    return r.rows[0];
}
export async function settleCredits(pool, userId, reservedAmount, actualAmount, referenceId) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const result = await settleCreditsTx(c, userId, reservedAmount, actualAmount, referenceId);
        await c.query('COMMIT');
        return result;
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}
export async function grantVerifiedPurchase(pool, userId, productId, purchaseToken) {
    const amount = PLAY_PRODUCTS[productId];
    if (!amount || purchaseToken.length < 16)
        throw new Error('INVALID_PURCHASE');
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('INSERT INTO credit_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING', [userId]);
        const inserted = await c.query(`INSERT INTO credit_ledger(user_id,amount,kind,reference_id,metadata) VALUES($1,$2,'PURCHASE',$3,$4) ON CONFLICT(user_id,kind,reference_id) DO NOTHING RETURNING id`, [userId, amount, purchaseToken, { productId }]);
        if (inserted.rowCount)
            await c.query('UPDATE credit_accounts SET balance=balance+$2,updated_at=now() WHERE user_id=$1', [userId, amount]);
        const result = await c.query('SELECT balance,reserved FROM credit_accounts WHERE user_id=$1', [userId]);
        await c.query('COMMIT');
        return { granted: Boolean(inserted.rowCount), balance: result.rows[0].balance, reserved: result.rows[0].reserved };
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}

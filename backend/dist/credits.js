import { randomUUID } from 'node:crypto';
export const CREDIT_COSTS = Object.freeze({
    MUSIC_DNA: 10, AUDIO_ANALYSIS: 15, AI_MIX: 30, AI_MASTER: 50,
    VOICE_GENERATION: 75, SONG_GENERATION: 150,
    VIDEO_5_STANDARD: 150, VIDEO_5_HD: 250, VIDEO_10_STANDARD: 300,
    VIDEO_10_HD: 500, VIDEO_30_STANDARD: 900, VIDEO_30_HD: 1500,
    VIDEO_60_STANDARD: 1800, VIDEO_60_HD: 3000
});
async function ledger(client, userId, amount, kind, referenceId, metadata = {}) {
    const id = randomUUID();
    await client.query(`INSERT INTO credit_ledger(id,user_id,amount,kind,reference_id,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [id, userId, amount, kind, referenceId, metadata]);
}
export async function reserveCredits(pool, userId, amount, referenceId) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error('INVALID_CREDIT_AMOUNT');
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const prior = await c.query(`SELECT amount FROM credit_ledger WHERE user_id=$1 AND kind='RESERVE' AND reference_id=$2 LIMIT 1`, [userId, referenceId]);
        if (prior.rowCount) {
            const existing = await c.query(`SELECT balance,reserved FROM credit_accounts WHERE user_id=$1`, [userId]);
            await c.query('COMMIT');
            return existing.rows[0] ?? { balance: 0, reserved: 0 };
        }
        await c.query(`INSERT INTO credit_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [userId]);
        const r = await c.query(`UPDATE credit_accounts SET balance=balance-$2,reserved=reserved+$2,updated_at=now() WHERE user_id=$1 AND balance >= $2 RETURNING balance,reserved`, [userId, amount]);
        if (!r.rowCount)
            throw new Error('INSUFFICIENT_CREDITS');
        await ledger(c, userId, -amount, 'RESERVE', referenceId, { amount });
        await c.query('COMMIT');
        return r.rows[0];
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}
export async function settleCredits(pool, userId, reservedAmount, actualAmount, referenceId) {
    if (reservedAmount < 0 || actualAmount < 0 || actualAmount > reservedAmount)
        throw new Error('INVALID_SETTLEMENT');
    const refund = reservedAmount - actualAmount;
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const r = await c.query(`UPDATE credit_accounts SET reserved=reserved-$2,balance=balance+$3,updated_at=now() WHERE user_id=$1 AND reserved >= $2 RETURNING balance,reserved`, [userId, reservedAmount, refund]);
        if (!r.rowCount)
            throw new Error('RESERVATION_NOT_FOUND');
        await ledger(c, userId, -actualAmount, 'SETTLE', referenceId, { reservedAmount, actualAmount });
        if (refund)
            await ledger(c, userId, refund, 'REFUND', referenceId, { reservedAmount, actualAmount });
        await c.query('COMMIT');
        return r.rows[0];
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}

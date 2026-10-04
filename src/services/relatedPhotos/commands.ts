import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandHandlerMap, CommandContext } from '../handlers/types';
import { queuePhotoEvidenceChange } from '../../data/relatedPhotoQueue';
import { recordEventMembershipDecision, loadEventMembers } from './events';

const assetInput = z.object({ assetId: z.string().min(1) });
function command(ctx: CommandContext, action: () => unknown): void {
    try { ctx.respond(ctx.id, 'ok', action(), null, ctx.originWs); }
    catch (error) { ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs); }
}

export const relatedPhotoCommandHandlers: CommandHandlerMap = {
    get_photo_evidence_network: ctx => command(ctx, () => {
        const { assetId } = assetInput.parse(ctx.payload);
        const events = ctx.dbManager.getDb().prepare(`SELECT event.* FROM photo_event_members member
            JOIN photo_events event ON event.id = member.event_id WHERE member.asset_id = ? ORDER BY event.created_at LIMIT 20`)
            .all(assetId) as { id: string }[];
        return { events: events.map(event => ({ ...event, members: loadEventMembers(ctx.dbManager, event.id) })) };
    }),
    record_photo_event_membership: ctx => command(ctx, () => {
        const input = assetInput.extend({ eventId: z.string().min(1), userId: z.string().trim().min(1),
            disposition: z.enum(['confirmed','rejected','undecided']), note: z.string().max(500).optional() }).parse(ctx.payload);
        recordEventMembershipDecision(ctx.dbManager, input);
        return { queued: true };
    }),
    reconsider_photo_evidence: ctx => command(ctx, () => {
        const { assetId } = assetInput.parse(ctx.payload);
        queuePhotoEvidenceChange(ctx.dbManager.getDb(), assetId, 'manual-reconsideration');
        return { queued: true };
    }),
    get_archive_impacts: ctx => command(ctx, () => {
        const input = z.object({ assetId: z.string().optional(), limit: z.number().int().min(1).max(100).default(50),
            after: z.number().int().nonnegative().default(0) }).parse(ctx.payload ?? {});
        const rows = ctx.dbManager.getDb().prepare(`SELECT rowid AS cursor, * FROM archive_impacts
            WHERE rowid > ? AND (? IS NULL OR asset_id = ?) ORDER BY rowid LIMIT ?`)
            .all(input.after, input.assetId ?? null, input.assetId ?? null, input.limit);
        return { impacts: rows };
    }),
    reject_photo_analysis_claim: ctx => command(ctx, () => {
        const input = z.object({ claimId: z.string().min(1), userId: z.string().trim().min(1), note: z.string().max(500).optional() }).parse(ctx.payload);
        return ctx.dbManager.getDb().transaction(() => {
            const db = ctx.dbManager.getDb();
            const claim = db.prepare("SELECT asset_id FROM analysis_claims WHERE id = ? AND state = 'active'").get(input.claimId) as { asset_id: string } | undefined;
            if (!claim) { throw new Error('Claim is not current'); }
            db.prepare('INSERT INTO analysis_claim_decisions(id, claim_id, disposition, user_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(randomUUID(), input.claimId, 'rejected', input.userId, input.note ?? null, new Date().toISOString());
            db.prepare("UPDATE analysis_claims SET state = 'rejected' WHERE id = ?").run(input.claimId);
            queuePhotoEvidenceChange(db, claim.asset_id, 'evidence-rejected');
            ctx.eventBus?.emit({ type: 'AssetUpdated', assetId: claim.asset_id });
            return { queued: true };
        })();
    }),
};

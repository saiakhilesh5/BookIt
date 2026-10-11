import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

export async function audit({ actor = null, action, entityType, entityId = null, meta = {}, ip }) {
  try {
    await AuditLog.create({
      actor: actor?._id ?? null,
      actorLabel: actor ? `${actor.name} (${actor.role})` : 'system',
      action,
      entityType,
      entityId,
      meta,
      ip,
    });
  } catch (err) {
    // Auditing must never break the main flow
    logger.error({ err }, 'Failed to write audit log');
  }
}

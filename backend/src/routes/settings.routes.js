// Settings, audit log and data export (admin).
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { idParam } from '../validators/common.js';
import { setting, auditLog, dataAdmin } from '../controllers/admin.controller.js';

const router = Router();
const byId = { params: idParam };

const admin = can(P.SETTINGS_MANAGE);
router.get('/settings', admin, setting.get);
router.put('/settings/general', admin, validate({ body: S.settings.general }), setting.general);
router.put('/settings/sla', admin, validate({ body: S.settings.sla }), setting.sla);
router.put('/settings/rules/:code', admin, validate({ body: S.settings.rule }), setting.rule);
router.put('/settings/auto-close', admin, validate({ body: S.settings.autoClose }), setting.autoClose);
router.put('/settings/routing', admin, validate({ body: S.settings.routing }), setting.routing);
router.put('/settings/notifications', admin, validate({ body: S.settings.notifications }), setting.notifications);
router.put('/settings/integrations/:key', admin, validate({ body: S.settings.integration }), setting.integration);
router.post('/settings/integrations/webhook/rotate-key', admin, setting.rotateKey);
router.post('/settings/integrations/email/simulate', admin, setting.simulateEmail);
router.post('/settings/integrations/siem/simulate', admin, setting.simulateSiem);
router.put('/settings/cab-approvers', admin, validate({ body: S.settings.cab }), setting.cab);
router.post('/settings/canned', admin, validate({ body: S.settings.canned }), setting.createCanned);
router.put('/settings/canned/:id', admin, validate({ ...byId, body: S.settings.canned }), setting.updateCanned);
router.delete('/settings/canned/:id', admin, validate(byId), setting.deleteCanned);

router.get('/audit-logs', can(P.AUDIT_VIEW), validate({ query: S.audit.query }), auditLog.list);
router.get('/audit-logs/export', can(P.AUDIT_VIEW), validate({ query: S.audit.query }), auditLog.export);
router.get('/data/summary', can(P.DATA_EXPORT), dataAdmin.summary);
router.get('/data/export', can(P.DATA_EXPORT), dataAdmin.export);

export default router;

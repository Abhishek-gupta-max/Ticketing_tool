// Change management and CAB decisions.
import { Router } from 'express';
import { requirePermission as can, requireAnyPermission as canAny } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadFiles } from '../middleware/upload.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { numberParam, id } from '../validators/common.js';
import { change } from '../controllers/work.controller.js';

const router = Router();
const num = { params: numberParam('number') };

router.get('/changes', can(P.CHANGE_VIEW), validate({ query: S.changes.query }), change.list);
router.post('/changes', can(P.CHANGE_CREATE), validate({ body: S.changes.create }), change.create);
router.get('/changes/:number', can(P.CHANGE_VIEW), validate(num), change.get);
router.put('/changes/:number', can(P.CHANGE_UPDATE), validate({ ...num, body: S.changes.update }), change.update);
router.patch('/changes/:number/plans', can(P.CHANGE_UPDATE), validate({ ...num, body: S.changes.fields }), change.fields);
router.patch('/changes/:number/schedule', can(P.CHANGE_UPDATE), validate({ ...num, body: S.changes.schedule }), change.schedule);
router.patch('/changes/:number/owner', can(P.CHANGE_UPDATE), validate({ ...num, body: S.changes.owner }), change.owner);
router.post('/changes/:number/transition', can(P.CHANGE_UPDATE), validate({ ...num, body: S.changes.transition }), change.transition);
router.post('/changes/:number/approvals/:approvalId/decision', canAny(P.CHANGE_APPROVE, P.APPROVAL_OVERRIDE),
  validate({ params: numberParam('number').extend({ approvalId: id }), body: S.changes.decision }), change.decide);
router.post('/changes/:number/attachments', can(P.ATTACHMENT_UPLOAD), can(P.CHANGE_UPDATE), uploadFiles, validate(num), change.attach);

export default router;

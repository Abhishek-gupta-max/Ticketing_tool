// Tasks.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadFiles } from '../middleware/upload.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { numberParam } from '../validators/common.js';
import { task } from '../controllers/work.controller.js';

const router = Router();
const num = { params: numberParam('number') };

router.get('/tasks', can(P.TASK_VIEW), validate({ query: S.tasks.query }), task.list);
router.post('/tasks', can(P.TASK_CREATE), validate({ body: S.tasks.create }), task.create);
router.get('/tasks/:number', can(P.TASK_VIEW), validate(num), task.get);
router.patch('/tasks/:number', can(P.TASK_UPDATE), validate({ ...num, body: S.tasks.update }), task.update);
router.patch('/tasks/:number/state', can(P.TASK_UPDATE), validate({ ...num, body: S.tasks.state }), task.state);
router.post('/tasks/:number/comments', can(P.TASK_UPDATE), validate({ ...num, body: S.tasks.note }), task.note);
router.post('/tasks/:number/attachments', can(P.ATTACHMENT_UPLOAD), can(P.TASK_UPDATE), uploadFiles, validate(num), task.attach);

export default router;

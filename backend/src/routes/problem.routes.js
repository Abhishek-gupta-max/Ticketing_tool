// Problem management.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadFiles } from '../middleware/upload.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { numberParam } from '../validators/common.js';
import { problem } from '../controllers/work.controller.js';

const router = Router();
const num = { params: numberParam('number') };

router.get('/problems', can(P.PROBLEM_VIEW), validate({ query: S.problems.query }), problem.list);
router.get('/problems/options', can(P.PROBLEM_VIEW), problem.options);
router.post('/problems', can(P.PROBLEM_CREATE), validate({ body: S.problems.create }), problem.create);
router.post('/problems/from-suggestion', can(P.PROBLEM_CREATE), validate({ body: S.problems.suggestion }), problem.fromSuggestion);
router.get('/problems/:number', can(P.PROBLEM_VIEW), validate(num), problem.get);
router.patch('/problems/:number', can(P.PROBLEM_UPDATE), validate({ ...num, body: S.problems.update }), problem.update);
router.patch('/problems/:number/status', can(P.PROBLEM_UPDATE), validate({ ...num, body: S.problems.status }), problem.status);
router.post('/problems/:number/known-error', can(P.PROBLEM_UPDATE), validate(num), problem.knownError);
router.post('/problems/:number/notes', can(P.PROBLEM_UPDATE), validate({ ...num, body: S.problems.note }), problem.note);
router.post('/problems/:number/incidents', can(P.PROBLEM_UPDATE), validate({ ...num, body: S.problems.link }), problem.link);
router.post('/problems/:number/attachments', can(P.ATTACHMENT_UPLOAD), can(P.PROBLEM_UPDATE), uploadFiles, validate(num), problem.attach);

export default router;

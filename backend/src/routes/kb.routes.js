// Knowledge base.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { numberParam } from '../validators/common.js';
import { article } from '../controllers/insight.controller.js';

const router = Router();
const num = { params: numberParam('number') };

router.get('/kb', can(P.KB_VIEW), validate({ query: S.kb.query }), article.list);
router.post('/kb', can(P.KB_CREATE), validate({ body: S.kb.body }), article.create);
router.get('/kb/:number', can(P.KB_VIEW), validate(num), article.get);
router.put('/kb/:number', can(P.KB_UPDATE), validate({ ...num, body: S.kb.body }), article.update);
router.patch('/kb/:number/status', can(P.KB_PUBLISH), validate({ ...num, body: S.kb.status }), article.status);
router.delete('/kb/:number', can(P.KB_DELETE), validate(num), article.remove);
router.post('/kb/:number/vote', can(P.KB_VIEW), validate({ ...num, body: S.kb.vote }), article.vote);

export default router;

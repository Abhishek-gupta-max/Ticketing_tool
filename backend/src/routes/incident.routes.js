// Incidents overview and major incidents.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { idParam } from '../validators/common.js';
import { major } from '../controllers/work.controller.js';

const router = Router();
const byId = { params: idParam };

router.get('/incidents/overview', can(P.TICKET_VIEW_ALL), major.overview);
router.post('/major-incidents', can(P.MAJOR_DECLARE), validate({ body: S.majors.declare }), major.declare);
router.post('/major-incidents/:id/updates', can(P.MAJOR_DECLARE), validate({ ...byId, body: S.majors.update }), major.update);
router.post('/major-incidents/:id/resolve', can(P.MAJOR_DECLARE), validate({ ...byId, body: S.majors.resolve }), major.resolve);

export default router;

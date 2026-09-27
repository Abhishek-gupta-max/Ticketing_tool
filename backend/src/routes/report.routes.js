// Reports and scheduled reports.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { idParam } from '../validators/common.js';
import { report } from '../controllers/insight.controller.js';

const router = Router();
const byId = { params: idParam };

router.get('/reports/summary', can(P.REPORT_VIEW), validate({ query: S.reports.query }), report.summary);
router.get('/reports/process', can(P.REPORT_VIEW), validate({ query: S.reports.query }), report.process);
router.get('/reports/export.csv', can(P.REPORT_VIEW), validate({ query: S.reports.query }), report.csv);
router.get('/reports/summary.json', can(P.REPORT_VIEW), validate({ query: S.reports.query }), report.json);
router.get('/reports/schedules', can(P.REPORT_VIEW), report.schedules);
router.post('/reports/schedules', can(P.REPORT_SCHEDULE), validate({ body: S.reports.schedule }), report.addSchedule);
router.delete('/reports/schedules/:id', can(P.REPORT_SCHEDULE), validate(byId), report.removeSchedule);

export default router;

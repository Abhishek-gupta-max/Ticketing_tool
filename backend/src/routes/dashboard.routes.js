// Dashboard, navigation counts, search, notifications, meta and attachment downloads.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { P } from '../constants/permissions.js';
import { idParam } from '../validators/common.js';
import { dash, misc, attachment } from '../controllers/insight.controller.js';

const router = Router();
const byId = { params: idParam };

router.get('/meta', misc.meta);
router.get('/search', misc.search);
router.get('/notifications', misc.notifications);
router.post('/notifications/read-all', misc.readAll);
router.patch('/notifications/:id/read', validate(byId), misc.readNotification);
router.get('/attachments/:id/download', validate(byId), attachment.download);
router.delete('/attachments/:id', can(P.ATTACHMENT_DELETE), validate(byId), attachment.remove);
router.get('/dashboard', can(P.DASHBOARD_VIEW), dash.overview);
router.get('/nav-counts', dash.nav);

export default router;

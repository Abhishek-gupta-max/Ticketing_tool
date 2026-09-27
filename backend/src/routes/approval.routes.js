// Approvals queue.
import { Router } from 'express';
import { requirePermission as can } from '../middleware/auth.js';
import { P } from '../constants/permissions.js';
import { approval } from '../controllers/work.controller.js';

const router = Router();

router.get('/approvals', can(P.APPROVAL_VIEW), approval.overview);

export default router;

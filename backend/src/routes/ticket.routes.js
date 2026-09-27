// Tickets: CRUD, workflow, comments, attachments, approvals.
import { Router } from 'express';
import { requirePermission as can, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadFiles, jsonPayload } from '../middleware/upload.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { numberParam } from '../validators/common.js';
import * as ticketC from '../controllers/ticket.controller.js';

const router = Router();
const num = { params: numberParam('number') };

router.get('/tickets', can(P.TICKET_VIEW), validate({ query: S.tickets.query }), ticketC.list);
router.get('/tickets/board', can(P.TICKET_VIEW), validate({ query: S.tickets.query }), ticketC.board);
router.get('/tickets/export', can(P.TICKET_EXPORT), validate({ query: S.tickets.query }), ticketC.exportCsv);
router.post('/tickets', can(P.TICKET_CREATE), uploadFiles, jsonPayload, validate({ body: S.tickets.create }), ticketC.create);
router.post('/tickets/bulk', can(P.TICKET_UPDATE), validate({ body: S.tickets.bulk }), ticketC.bulk);
router.get('/tickets/:number', can(P.TICKET_VIEW), validate(num), ticketC.get);
router.put('/tickets/:number', can(P.TICKET_UPDATE), validate({ ...num, body: S.tickets.update }), ticketC.update);
router.patch('/tickets/:number', can(P.TICKET_UPDATE), validate({ ...num, body: S.tickets.update }), ticketC.update);
router.delete('/tickets/:number', can(P.TICKET_DELETE), validate(num), ticketC.remove);
router.patch('/tickets/:number/status', can(P.TICKET_UPDATE), validate({ ...num, body: S.tickets.status }), ticketC.status);
router.patch('/tickets/:number/assign', can(P.TICKET_ASSIGN), validate({ ...num, body: S.tickets.assign }), ticketC.assign);
router.patch('/tickets/:number/priority', can(P.TICKET_UPDATE), validate({ ...num, body: S.tickets.priority }), ticketC.priority);
router.get('/tickets/:number/comments', can(P.TICKET_VIEW), validate(num), ticketC.comments);
router.post('/tickets/:number/comments', can(P.TICKET_COMMENT), uploadFiles, jsonPayload, validate({ ...num, body: S.tickets.comment }), ticketC.addComment);
router.get('/tickets/:number/activity', can(P.TICKET_VIEW), validate({ ...num, query: S.tickets.activityQuery }), ticketC.timeline);
router.get('/tickets/:number/history', can(P.TICKET_VIEW), requireStaff, validate(num), ticketC.history);
router.post('/tickets/:number/attachments', can(P.ATTACHMENT_UPLOAD), uploadFiles, validate(num), ticketC.addAttachments);
router.post('/tickets/:number/approval', can(P.REQUEST_APPROVE), validate({ ...num, body: S.tickets.approval }), ticketC.approval);
router.post('/tickets/:number/csat', can(P.TICKET_VIEW), validate({ ...num, body: S.tickets.csat }), ticketC.csat);
router.put('/tickets/:number/problem', can(P.PROBLEM_UPDATE), validate({ ...num, body: S.tickets.problemLink }), ticketC.linkProblem);
router.post('/tickets/:number/problem', can(P.PROBLEM_CREATE), validate({ ...num, body: S.tickets.problemCreate }), ticketC.createProblem);
router.get('/tickets/:number/similar', can(P.PROBLEM_CREATE), validate(num), ticketC.similar);
router.post('/tickets/:number/major', can(P.MAJOR_DECLARE), validate({ ...num, body: S.majors.declare.omit({ ticketNumber: true }) }), ticketC.declareMajor);

export default router;

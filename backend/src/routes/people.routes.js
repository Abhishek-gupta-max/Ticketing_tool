// Agents, roles, teams, customers and requesters.
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission as can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { idParam, id } from '../validators/common.js';
import { user, team, customer } from '../controllers/admin.controller.js';

const router = Router();
const byId = { params: idParam };

router.get('/users', can(P.USER_VIEW), user.list);
router.get('/roles', can(P.USER_VIEW), user.roles);
router.post('/users', can(P.USER_CREATE), validate({ body: S.users.create }), user.create);
router.put('/users/:id', can(P.USER_UPDATE), validate({ ...byId, body: S.users.update }), user.update);
router.patch('/users/:id/status', can(P.USER_UPDATE), validate({ ...byId, body: S.users.status }), user.status);

router.get('/teams', can(P.USER_VIEW), team.list);
router.get('/teams/:id', can(P.USER_VIEW), validate(byId), team.get);
router.post('/teams', can(P.TEAM_MANAGE), validate({ body: S.teams.body }), team.create);
router.put('/teams/:id', can(P.TEAM_MANAGE), validate({ ...byId, body: S.teams.body }), team.update);
router.patch('/teams/:id/active', can(P.TEAM_MANAGE), validate(byId), team.toggle);
router.delete('/teams/:id', can(P.TEAM_MANAGE), validate(byId), team.remove);
router.post('/teams/:id/members', can(P.TEAM_MANAGE), validate({ ...byId, body: S.teams.member }), team.addMember);
const member = { params: z.object({ id, userId: id }) };
router.delete('/teams/:id/members/:userId', can(P.TEAM_MANAGE), validate(member), team.removeMember);
router.patch('/teams/:id/members/:userId/on-call', can(P.TEAM_MANAGE), validate({ ...member, body: S.teams.onCall }), team.onCall);

router.get('/customers', can(P.CUSTOMER_VIEW), customer.list);
router.post('/customers', can(P.CUSTOMER_MANAGE), validate({ body: S.customers.create }), customer.create);
router.get('/people', can(P.CUSTOMER_VIEW), validate({ query: S.customers.peopleQuery }), customer.people);
router.post('/people', can(P.CUSTOMER_MANAGE), validate({ body: S.customers.person }), customer.createPerson);
router.patch('/people/:id/vip', can(P.CUSTOMER_MANAGE), validate({ ...byId, body: S.customers.vip }), customer.vip);

export default router;

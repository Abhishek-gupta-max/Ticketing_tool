// Service catalog and service requests.
import { Router } from 'express';
import { requirePermission as can, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadFiles, jsonPayload } from '../middleware/upload.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { numberParam, idParam } from '../validators/common.js';
import { request } from '../controllers/work.controller.js';

const router = Router();
const num = { params: numberParam('number') };
const byId = { params: idParam };

router.get('/catalog', can(P.CATALOG_VIEW), request.catalog);
router.post('/catalog', can(P.CATALOG_MANAGE), validate({ body: S.catalog.item }), request.createItem);
router.put('/catalog/:id', can(P.CATALOG_MANAGE), validate({ ...byId, body: S.catalog.item }), request.updateItem);
router.get('/requests', can(P.REQUEST_VIEW), validate({ query: S.requests.query }), request.list);
router.get('/requests/kpis', can(P.REQUEST_VIEW), requireStaff, request.kpis);
router.post('/requests', can(P.REQUEST_CREATE), uploadFiles, jsonPayload, validate({ body: S.requests.submit }), request.submit);
router.get('/requests/:number', can(P.REQUEST_VIEW), validate(num), request.get);

export default router;

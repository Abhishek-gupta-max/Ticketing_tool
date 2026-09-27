// Assets (configuration items).
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission as can, requireAnyPermission as canAny, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadSingle } from '../middleware/upload.js';
import { P } from '../constants/permissions.js';
import * as S from '../validators/schemas.js';
import { asset } from '../controllers/insight.controller.js';

const router = Router();

const tag = { params: z.object({ tag: z.string().regex(/^AST-\d{3,}$/, 'Invalid asset tag') }) };
router.get('/assets', can(P.ASSET_VIEW), validate({ query: S.assets.query }), asset.list);
router.get('/assets/options', canAny(P.ASSET_VIEW, P.TICKET_CREATE), requireStaff, asset.options);
router.get('/assets/owners', can(P.ASSET_VIEW), asset.owners);
router.get('/assets/export', can(P.ASSET_VIEW), validate({ query: S.assets.query }), asset.export);
router.get('/assets/import-template', can(P.ASSET_IMPORT), asset.template);
router.post('/assets/import', can(P.ASSET_IMPORT), uploadSingle, asset.import);
router.post('/assets', can(P.ASSET_CREATE), validate({ body: S.assets.body }), asset.create);
router.get('/assets/:tag', can(P.ASSET_VIEW), validate(tag), asset.get);
router.put('/assets/:tag', can(P.ASSET_UPDATE), validate({ ...tag, body: S.assets.body }), asset.update);
router.delete('/assets/:tag', can(P.ASSET_DELETE), validate(tag), asset.remove);

export default router;

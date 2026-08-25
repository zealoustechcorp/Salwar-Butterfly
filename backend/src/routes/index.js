import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/health', healthRoutes);
// Feature routers get mounted here, e.g.:
// router.use('/categories', categoryRoutes);
// router.use('/products', productRoutes);

export default router;

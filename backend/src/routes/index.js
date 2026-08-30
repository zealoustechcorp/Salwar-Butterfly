import { Router } from 'express';
import healthRoutes from './health.routes.js';
import customerRoutes from './customer.routes.js'
import categoryRoutes from './category.routes.js'
import productRoutes from './product.routes.js';
import subCategories from './sub_categories.router.js';
import adminAuthRoutes from './admin.auth.routes.js';
const router = Router();

router.use('/health', healthRoutes);
router.use('/admin/auth', adminAuthRoutes);
router.use('/customers',customerRoutes);
router.use('/categories',categoryRoutes);
router.use('/products',productRoutes);
router.use('/subCategories',subCategories);

export default router;

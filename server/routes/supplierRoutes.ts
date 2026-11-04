import { Router } from 'express';
import {
  getSuppliers,
  getSupplierById,
  getSupplierStats,
} from '../controllers/supplierController';

export const supplierRouter = Router();

supplierRouter.get('/', getSuppliers);
supplierRouter.get('/:id', getSupplierById);
supplierRouter.get('/:id/stats', getSupplierStats);

export default supplierRouter;

import { Router } from 'express';
import {
  getDebts,
  createDebt,
  recordDebtPayment,
} from '../controllers/crmController';

export const crmRouter = Router();

crmRouter.get('/debts', getDebts);
crmRouter.post('/debts', createDebt);
crmRouter.patch('/debts/:id/pay', recordDebtPayment);

export default crmRouter;

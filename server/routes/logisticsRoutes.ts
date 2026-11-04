import { Router } from 'express';
import {
  getVehicles,
  calculateFreightCost,
} from '../controllers/logisticsController';

export const logisticsRouter = Router();

logisticsRouter.get('/vehicles', getVehicles);
logisticsRouter.post('/calculate', calculateFreightCost);

export default logisticsRouter;

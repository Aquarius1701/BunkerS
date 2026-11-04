import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
} from '../controllers/orderController';

export const orderRouter = Router();

orderRouter.post('/', createOrder);
orderRouter.get('/', getOrders);
orderRouter.get('/:id', getOrderById);
orderRouter.patch('/:id/status', updateOrderStatus);

export default orderRouter;

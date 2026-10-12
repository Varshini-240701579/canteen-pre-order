const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const {
  getSlots, placeOrder, getMyOrders, getAllOrders, updateStatus, markPaid, cancelOrder,
} = require('../controllers/orderController');

router.get('/slots', auth, getSlots);
router.post('/', auth, placeOrder);
router.get('/my', auth, getMyOrders);
router.get('/', auth, role('staff'), getAllOrders);
router.patch('/:id/status', auth, role('staff'), updateStatus);
router.patch('/:id/payment', auth, role('staff'), markPaid);
router.patch('/:id/cancel', auth, cancelOrder);

module.exports = router;
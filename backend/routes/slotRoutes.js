const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { getSlots, createSlots, deleteSlot } = require('../controllers/slotController');

router.get('/', auth, getSlots);
router.post('/', auth, role('staff'), createSlots);
router.delete('/:id', auth, role('staff'), deleteSlot);

module.exports = router;
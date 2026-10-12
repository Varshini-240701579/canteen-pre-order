const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const {
  getMenu, addItem, updateItem, toggleAvailability, deleteItem,
} = require('../controllers/menuController');

router.get('/', auth, getMenu);
router.post('/', auth, role('staff'), addItem);
router.put('/:id', auth, role('staff'), updateItem);
router.patch('/:id/availability', auth, role('staff'), toggleAvailability);
router.delete('/:id', auth, role('staff'), deleteItem);

module.exports = router;
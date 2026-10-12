const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { register, login, me } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);

// Temporary route just to test role protection (we'll delete it later)
router.get('/staff-check', auth, role('staff'), (req, res) => {
  res.json({ message: 'Welcome, staff member' });
});

module.exports = router;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Public registration always creates a student
exports.register = async (req, res) => {
  try {
    const { name, student_id, email, password } = req.body;

    if (!name || !student_id || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR student_id = ?',
      [email, student_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email or student ID already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, student_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, student_id, email, password_hash, 'student']
    );

    res.status(201).json({ message: 'Registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Returns the logged-in user (used to keep login after page refresh)
exports.me = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, student_id FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
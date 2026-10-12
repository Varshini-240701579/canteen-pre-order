require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const menuRoutes = require('./routes/menuRoutes');
const slotRoutes = require('./routes/slotRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/slots', slotRoutes);

app.get('/api/health', async (req, res) => {
  const [rows] = await db.query('SELECT COUNT(*) AS items FROM menu_items');
  res.json({ status: 'ok', menuItems: rows[0].items });
});

app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
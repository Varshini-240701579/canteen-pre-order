const db = require('../config/db');

// GET /api/menu  (any logged-in user)
exports.getMenu = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM menu_items ORDER BY category, name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/menu  (staff only)
exports.addItem = async (req, res) => {
  try {
    const { name, category, price, stock_qty, image_url } = req.body;

    if (!name || !category || price === undefined || price === '') {
      return res.status(400).json({ message: 'Name, category and price are required' });
    }
    if (Number(price) < 0 || Number(stock_qty || 0) < 0) {
      return res.status(400).json({ message: 'Price and stock cannot be negative' });
    }

    const [result] = await db.query(
      'INSERT INTO menu_items (name, category, price, stock_qty, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, category, price, stock_qty || 0, image_url || null]
    );
    res.status(201).json({ message: 'Item added', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/menu/:id  (staff only)
exports.updateItem = async (req, res) => {
  try {
    const { name, category, price, stock_qty, image_url } = req.body;

    if (!name || !category || price === undefined || price === '') {
      return res.status(400).json({ message: 'Name, category and price are required' });
    }
    if (Number(price) < 0 || Number(stock_qty || 0) < 0) {
      return res.status(400).json({ message: 'Price and stock cannot be negative' });
    }

    const [result] = await db.query(
      'UPDATE menu_items SET name = ?, category = ?, price = ?, stock_qty = ?, image_url = ? WHERE id = ?',
      [name, category, price, stock_qty || 0, image_url || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Item updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/menu/:id/availability  (staff only)
exports.toggleAvailability = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE menu_items SET is_available = NOT is_available WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Availability updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/menu/:id  (staff only)
exports.deleteItem = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM menu_items WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Item deleted' });
  } catch (err) {
    // An item that was already ordered can't be deleted (old bills need it)
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'This item is in past orders. Mark it unavailable instead of deleting.',
      });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
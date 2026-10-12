const crypto = require('crypto');
const db = require('../config/db');

const STATUSES = ['placed', 'preparing', 'ready', 'collected', 'cancelled'];
const fail = (status, message) => Object.assign(new Error(message), { status });

// Pickup code like "K7M2QX" (no confusing characters such as 0/O or 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeToken(len = 6) {
  return Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('');
}
async function uniqueToken(conn) {
  for (let i = 0; i < 5; i++) {
    const t = makeToken();
    const [rows] = await conn.query('SELECT id FROM orders WHERE token = ?', [t]);
    if (rows.length === 0) return t;
  }
  throw fail(500, 'Could not generate pickup code, please try again');
}

// GET /api/orders/slots  -> upcoming slots with spots left
exports.getSlots = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id, DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date,
              s.start_time, s.end_time, s.max_orders,
              s.max_orders - COUNT(o.id) AS spots_left
       FROM time_slots s
       LEFT JOIN orders o ON o.slot_id = s.id AND o.status <> 'cancelled'
       WHERE TIMESTAMP(s.slot_date, s.start_time) > NOW()
       GROUP BY s.id
       ORDER BY s.slot_date, s.start_time`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders  (body: { slot_id: 5, items: [{ menu_item_id, quantity }] })
exports.placeOrder = async (req, res) => {
  const { slot_id, items } = req.body;
  const conn = await db.getConnection();
  try {
    if (!slot_id) throw fail(400, 'Please choose a pickup slot');
    if (!Array.isArray(items) || items.length === 0) throw fail(400, 'Cart is empty');

    await conn.beginTransaction();

    // Lock the slot row so two students can't both take the last place
    const [slots] = await conn.query(
      `SELECT id, max_orders, TIMESTAMP(slot_date, start_time) > NOW() AS is_future
       FROM time_slots WHERE id = ? FOR UPDATE`,
      [slot_id]
    );
    const slot = slots[0];
    if (!slot) throw fail(404, 'Slot not found');
    if (!slot.is_future) throw fail(409, 'That slot has already started. Please choose a later one.');

    const [[booked]] = await conn.query(
      "SELECT COUNT(*) AS n FROM orders WHERE slot_id = ? AND status <> 'cancelled'",
      [slot_id]
    );
    if (booked.n >= slot.max_orders)
      throw fail(409, 'That pickup slot is full. Please choose another time.');

    // Check stock, lock rows, calculate the total on the server
    let total = 0;
    const lines = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw fail(400, 'Invalid quantity');
      const [rows] = await conn.query(
        'SELECT id, name, price, stock_qty, is_available FROM menu_items WHERE id = ? FOR UPDATE',
        [it.menu_item_id]
      );
      const m = rows[0];
      if (!m) throw fail(404, `Item ${it.menu_item_id} not found`);
      if (!m.is_available) throw fail(409, `${m.name} is not available`);
      if (m.stock_qty < qty) throw fail(409, `Only ${m.stock_qty} left of ${m.name}`);
      total += Number(m.price) * qty;
      lines.push({ id: m.id, qty, price: Number(m.price) });
    }

    const token = await uniqueToken(conn);
    const [result] = await conn.query(
      'INSERT INTO orders (token, user_id, slot_id, total_amount) VALUES (?, ?, ?, ?)',
      [token, req.user.id, slot_id, total]
    );
    for (const l of lines) {
      await conn.query(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [result.insertId, l.id, l.qty, l.price]
      );
      await conn.query('UPDATE menu_items SET stock_qty = stock_qty - ? WHERE id = ?', [l.qty, l.id]);
    }

    await conn.commit();
    res.status(201).json({ message: 'Order placed', orderId: result.insertId, token, total });
  } catch (err) {
    await conn.rollback();
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Server error' });
    if (!err.status) console.error(err);
  } finally {
    conn.release();
  }
};

// Helper: attach items to a list of orders
async function withItems(orders) {
  if (orders.length === 0) return orders;
  const [items] = await db.query(
    `SELECT oi.order_id, oi.menu_item_id, m.name, oi.quantity, oi.unit_price
     FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id IN (?)`,
    [orders.map((o) => o.id)]
  );
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

const ORDER_SELECT = `SELECT o.*, DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date, s.start_time, s.end_time
                      FROM orders o JOIN time_slots s ON s.id = o.slot_id`;

// GET /api/orders/my  (student's own orders)
exports.getMyOrders = async (req, res) => {
  try {
    const [orders] = await db.query(
      `${ORDER_SELECT} WHERE o.user_id = ? ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(await withItems(orders));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders  (staff: all orders, optional ?status=placed)
exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const [orders] = status
      ? await db.query(`${ORDER_SELECT} WHERE o.status = ? ORDER BY s.slot_date, s.start_time`, [status])
      : await db.query(`${ORDER_SELECT} ORDER BY s.slot_date, s.start_time`);
    res.json(await withItems(orders));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/orders/:id/status  (staff, body: { status: "preparing" })
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: `Status must be one of: ${STATUSES.join(', ')}` });
    const [r] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Status updated', status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/orders/:id/payment  (staff marks an order as paid at the counter)
exports.markPaid = async (req, res) => {
  try {
    const [r] = await db.query("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Marked as paid' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/orders/:id/cancel  (student, own order, only while "placed")
exports.cancelOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
      [req.params.id, req.user.id]
    );
    const order = rows[0];
    if (!order) throw fail(404, 'Order not found');
    if (order.status !== 'placed')
      throw fail(409, 'Only orders that are still "placed" can be cancelled');

    const [items] = await conn.query(
      'SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?',
      [order.id]
    );
    for (const i of items)
      await conn.query('UPDATE menu_items SET stock_qty = stock_qty + ? WHERE id = ?', [i.quantity, i.menu_item_id]);
    await conn.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);

    await conn.commit();
    res.json({ message: 'Order cancelled' });
  } catch (err) {
    await conn.rollback();
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Server error' });
    if (!err.status) console.error(err);
  } finally {
    conn.release();
  }
};
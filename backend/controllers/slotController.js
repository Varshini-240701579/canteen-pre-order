const db = require('../config/db');

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

// GET /api/slots?date=YYYY-MM-DD  (any logged-in user; defaults to today)
exports.getSlots = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id,
              DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date,
              TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
              TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
              s.max_orders,
              COUNT(o.id) AS booked,
              (s.slot_date < CURDATE()
                OR (s.slot_date = CURDATE() AND s.start_time <= CURTIME())) AS is_past
       FROM time_slots s
       LEFT JOIN orders o ON o.slot_id = s.id AND o.status <> 'cancelled'
       WHERE s.slot_date = COALESCE(?, CURDATE())
       GROUP BY s.id
       ORDER BY s.start_time`,
      [req.query.date || null]
    );

    res.json(
      rows.map((r) => ({
        ...r,
        is_past: !!r.is_past,
        remaining: Math.max(r.max_orders - r.booked, 0),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/slots  (staff only) - creates many slots between two times
exports.createSlots = async (req, res) => {
  try {
    const { slot_date, start_time, end_time, interval_minutes, max_orders } = req.body;

    if (!slot_date || !start_time || !end_time || !interval_minutes || !max_orders) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const start = toMin(start_time);
    const end = toMin(end_time);
    const step = Number(interval_minutes);

    if (end <= start) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }
    if (step < 5 || step > 120) {
      return res.status(400).json({ message: 'Interval must be between 5 and 120 minutes' });
    }
    if (Number(max_orders) < 1) {
      return res.status(400).json({ message: 'Max orders must be at least 1' });
    }

    let created = 0;
    for (let t = start; t + step <= end; t += step) {
      const [result] = await db.query(
        'INSERT IGNORE INTO time_slots (slot_date, start_time, end_time, max_orders) VALUES (?, ?, ?, ?)',
        [slot_date, toTime(t), toTime(t + step), max_orders]
      );
      created += result.affectedRows;
    }

    res.status(201).json({ message: `${created} slot(s) created`, created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/slots/:id  (staff only)
exports.deleteSlot = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM time_slots WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Slot not found' });
    }
    res.json({ message: 'Slot deleted' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'This slot already has orders and cannot be deleted' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
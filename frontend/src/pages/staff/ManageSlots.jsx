import { useEffect, useState } from 'react';
import api from '../../api/axios';

const today = () => new Date().toLocaleDateString('en-CA');

export default function ManageSlots() {
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({
    start_time: '12:00', end_time: '14:00', interval_minutes: 10, max_orders: 20,
  });
  const [message, setMessage] = useState('');

  const load = () =>
    api.get('/slots', { params: { date } }).then((res) => setSlots(res.data));

  useEffect(() => {
    load();
  }, [date]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await api.post('/slots', { slot_date: date, ...form });
      setMessage(res.data.message);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not create slots');
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/slots/${id}`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not delete');
    }
  };

  return (
    <div className="page">
      <h2>Manage Pickup Slots</h2>

      <div className="card">
        <label>Date: </label>
        <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} style={{ padding: 8 }} />
      </div>

      <form className="card form-row" onSubmit={create} style={{ marginTop: 16 }}>
        <label>From <input name="start_time" type="time" value={form.start_time} onChange={handleChange} required /></label>
        <label>To <input name="end_time" type="time" value={form.end_time} onChange={handleChange} required /></label>
        <label>Every (min) <input name="interval_minutes" type="number" min="5" max="120" value={form.interval_minutes} onChange={handleChange} required /></label>
        <label>Max orders <input name="max_orders" type="number" min="1" value={form.max_orders} onChange={handleChange} required /></label>
        <button type="submit">Create slots</button>
      </form>

      {message && <p>{message}</p>}

      <table>
        <thead>
          <tr><th>Time</th><th>Booked</th><th>Capacity</th><th></th></tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id}>
              <td>{s.start_time} – {s.end_time}</td>
              <td>{s.booked}</td>
              <td>{s.max_orders}</td>
              <td><button className="danger" onClick={() => remove(s.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
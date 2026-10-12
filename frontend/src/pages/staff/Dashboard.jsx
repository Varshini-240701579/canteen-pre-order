import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';

const today = () => new Date().toLocaleDateString('en-CA');

const NEXT = {
  placed: ['preparing', 'Start preparing'],
  preparing: ['ready', 'Mark ready'],
  ready: ['collected', 'Mark collected'],
};

export default function Dashboard() {
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    api.get('/orders', { params: { date, status } })
      .then((res) => setOrders(res.data))
      .catch(() => setMessage('Could not load orders'));
  }, [date, status]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000); // pick up new orders automatically
    return () => clearInterval(timer);
  }, [load]);

  const update = async (id, newStatus) => {
    setMessage('');
    try {
      await api.patch(`/orders/${id}/status`, { status: newStatus });
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not update the order');
    }
  };

  const cancel = (id) => {
    if (window.confirm('Cancel this order? Stock will be returned.')) update(id, 'cancelled');
  };

  const shown = orders.filter((o) =>
    !search || o.token.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="page">
      <h2>Incoming Orders</h2>

      <div className="card form-row">
        <label>Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 9 }}>
            <option value="all">All</option>
            <option value="placed">Placed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="collected">Collected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>Find by token
          <input placeholder="e.g. K482" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {message && <p style={{ color: 'red' }}>{message}</p>}
      {shown.length === 0 && <div className="card"><p>No orders found.</p></div>}

      <div className="grid">
        {shown.map((o) => {
          const unpaid = o.payment_status !== 'paid';
          return (
            <div className="card" key={o.id}>
              <div className="order-head">
                <h3>{o.token}</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className={`badge ${o.status}`}>{o.status}</span>
                  {o.status !== 'cancelled' && (
                    <span className={`badge ${o.payment_status}`}>{o.payment_status}</span>
                  )}
                </div>
              </div>
              <p className="muted">{o.student_name} ({o.student_id})</p>
              <p className="muted">Pickup {o.start_time} – {o.end_time}</p>
              <ul className="order-items">
                {o.items.map((i, idx) => (
                  <li key={idx}>{i.name}<span>× {i.quantity}</span></li>
                ))}
              </ul>
              <strong>₹{o.total_amount.toFixed(2)}</strong>
              <div className="actions" style={{ marginTop: 12 }}>
                {NEXT[o.status] && (
                  <button
                    disabled={unpaid}
                    title={unpaid ? 'Waiting for payment' : ''}
                    onClick={() => update(o.id, NEXT[o.status][0])}
                  >
                    {unpaid ? 'Awaiting payment' : NEXT[o.status][1]}
                  </button>
                )}
                {NEXT[o.status] && (
                  <button className="danger" onClick={() => cancel(o.id)}>Cancel</button>
                )}
                {o.status !== 'cancelled' && (
                  <Link to={`/bill/${o.id}`}><button className="outline">View bill</button></Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
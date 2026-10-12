import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = () =>
    api.get('/orders/my')
      .then((res) => setOrders(res.data))
      .catch(() => setMessage('Could not load your orders'))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000); // refresh so status changes show up
    return () => clearInterval(timer);
  }, []);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this order?')) return;
    setMessage('');
    try {
      await api.patch(`/orders/${id}/cancel`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not cancel the order');
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <h2>My Orders</h2>
      {message && <p style={{ color: 'red' }}>{message}</p>}
      {orders.length === 0 && <div className="card"><p>You haven't placed any orders yet.</p></div>}

      {orders.map((o) => (
        <div className="card order-card" key={o.id}>
          <div className="order-head">
            <div>
              <h3>Token {o.token}</h3>
              <p className="muted">Pickup: {o.slot_date} at {o.start_time} – {o.end_time}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className={`badge ${o.status}`}>{o.status}</span>
              {o.status !== 'cancelled' && (
                <span className={`badge ${o.payment_status}`}>{o.payment_status}</span>
              )}
            </div>
          </div>

          <ul className="order-items">
            {o.items.map((i, idx) => (
              <li key={idx}>
                {i.name} × {i.quantity}
                <span>₹{(i.unit_price * i.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>

          <div className="order-foot">
            <strong>Total: ₹{o.total_amount.toFixed(2)}</strong>
            <div className="actions">
              {o.status !== 'cancelled' && o.payment_status === 'unpaid' && (
                <Link to={`/pay/${o.id}`}><button>Pay now</button></Link>
              )}
              {o.status !== 'cancelled' && (
                <Link to={`/bill/${o.id}`}><button className="outline">View bill</button></Link>
              )}
              {o.status === 'placed' && (
                <button className="danger" onClick={() => cancel(o.id)}>Cancel order</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
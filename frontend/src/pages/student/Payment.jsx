import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';

const METHODS = [
  ['upi', 'UPI'],
  ['card', 'Debit / Credit card'],
  ['netbanking', 'Net banking'],
];

export default function Payment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [method, setMethod] = useState('upi');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/orders/${id}`)
      .then((res) => {
        if (res.data.payment_status === 'paid') navigate(`/bill/${id}`, { replace: true });
        else setOrder(res.data);
      })
      .catch(() => setError('Order not found'));
  }, [id, navigate]);

  const pay = async () => {
    setError('');
    setPaying(true);
    try {
      await new Promise((r) => setTimeout(r, 1500)); // fake "processing" delay
      await api.patch(`/orders/${id}/pay`, { method });
      navigate(`/bill/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed');
      setPaying(false);
    }
  };

  if (error && !order) {
    return <div className="page"><div className="card"><p style={{ color: 'red' }}>{error}</p><Link to="/orders">Back to My Orders</Link></div></div>;
  }
  if (!order) return <div className="page"><p>Loading...</p></div>;

  if (order.status === 'cancelled') {
    return <div className="page"><div className="card"><p>This order was cancelled.</p><Link to="/orders">Back to My Orders</Link></div></div>;
  }

  return (
    <div className="page bill-wrap">
      <h2>Payment</h2>

      <div className="card">
        <p className="muted">Order token</p>
        <h3>{order.token}</h3>
        <ul className="order-items">
          {order.items.map((i, idx) => (
            <li key={idx}>{i.name} × {i.quantity}<span>₹{(i.unit_price * i.quantity).toFixed(2)}</span></li>
          ))}
        </ul>
        <h3>Amount to pay: ₹{order.total_amount.toFixed(2)}</h3>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Choose a payment method</h3>
        {METHODS.map(([value, label]) => (
          <label key={value} className="pay-method">
            <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} />
            {label}
          </label>
        ))}
        <p className="muted">Demo payment: no real money is charged.</p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div className="actions">
          <button disabled={paying} onClick={pay}>
            {paying ? 'Processing payment...' : `Pay ₹${order.total_amount.toFixed(2)}`}
          </button>
          <Link to="/orders"><button className="outline" disabled={paying}>Pay later</button></Link>
        </div>
      </div>
    </div>
  );
}
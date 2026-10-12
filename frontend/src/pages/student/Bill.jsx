import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function Bill() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/orders/${id}`)
      .then((res) => setOrder(res.data))
      .catch(() => setError('Bill not found'));
  }, [id]);

  const back = user?.role === 'staff' ? '/staff' : '/orders';

  if (error) {
    return <div className="page"><div className="card"><p style={{ color: 'red' }}>{error}</p><Link to={back}>Go back</Link></div></div>;
  }
  if (!order) return <div className="page"><p>Loading...</p></div>;

  const paid = order.payment_status === 'paid';

  return (
    <div className="page bill-wrap">
      <div className="card bill">
        <div className="bill-head">
          <h2>🍽️ College Canteen</h2>
          <p className="muted">Order receipt</p>
        </div>

        <div className="token-box">
          <span className="muted">Pickup token</span>
          <strong>{order.token}</strong>
        </div>

        <div className="bill-qr">
          <QRCodeSVG value={`CANTEEN|${order.token}|${order.id}`} size={140} />
        </div>

        <table className="bill-meta">
          <tbody>
            <tr><td>Order no.</td><td>#{order.id}</td></tr>
            <tr><td>Student</td><td>{order.student_name} ({order.student_id})</td></tr>
            <tr><td>Pickup</td><td>{order.slot_date}, {order.start_time} – {order.end_time}</td></tr>
            <tr><td>Ordered at</td><td>{order.created_at}</td></tr>
            <tr><td>Order status</td><td><span className={`badge ${order.status}`}>{order.status}</span></td></tr>
            <tr>
              <td>Payment</td>
              <td>
                <span className={`badge ${paid ? 'paid' : 'unpaid'}`}>{paid ? 'Paid' : 'Unpaid'}</span>
                {paid && order.payment_method && <span className="muted"> via {order.payment_method.toUpperCase()}</span>}
              </td>
            </tr>
            {paid && order.paid_at && <tr><td>Paid at</td><td>{order.paid_at}</td></tr>}
          </tbody>
        </table>

        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {order.items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.name}</td>
                <td>{i.quantity}</td>
                <td>₹{i.unit_price.toFixed(2)}</td>
                <td>₹{(i.unit_price * i.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="bill-total">Total: ₹{order.total_amount.toFixed(2)}</h3>
        <p className="muted">Show this bill at the counter. Staff will verify your token before handing over the food.</p>
      </div>

      <div className="actions no-print" style={{ marginTop: 16 }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        {!paid && order.status !== 'cancelled' && user?.role === 'student' && (
          <Link to={`/pay/${order.id}`}><button>Pay now</button></Link>
        )}
        <Link to={back}><button className="outline">Back</button></Link>
      </div>
    </div>
  );
}
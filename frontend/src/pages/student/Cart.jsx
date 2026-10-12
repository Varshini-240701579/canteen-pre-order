import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useCart } from '../../context/CartContext';
import SlotPicker from '../../components/SlotPicker';

export default function Cart() {
  const { items, updateQty, removeItem, clearCart, total, slot, setSlot } = useCart();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const placeOrder = async () => {
    setError('');
    setPlacing(true);
    try {
      const res = await api.post('/orders', {
        slot_id: slot.id,
        items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
      });
      const orderId = res.data.order.id;
      clearCart();
      navigate(`/pay/${orderId}`); // go straight to payment
    } catch (err) {
      setError(err.response?.data?.message || 'Could not place the order');
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="page">
        <h2>Your Cart</h2>
        <div className="card">
          <p>Your cart is empty.</p>
          <Link to="/menu">Browse the menu</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Your Cart</h2>

      <table>
        <thead>
          <tr>
            <th>Item</th><th>Price</th><th>Quantity</th><th>Subtotal</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>₹{item.price.toFixed(2)}</td>
              <td>
                <div className="qty">
                  <button className="outline" onClick={() => updateQty(item.id, item.quantity - 1)}>−</button>
                  <span>{item.quantity}</span>
                  <button className="outline" onClick={() => updateQty(item.id, item.quantity + 1)}>+</button>
                </div>
              </td>
              <td>₹{(item.price * item.quantity).toFixed(2)}</td>
              <td>
                <button className="danger" onClick={() => removeItem(item.id)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16 }}>
        <SlotPicker selected={slot} onSelect={setSlot} />
      </div>

      <div className="card cart-summary">
        <h3>Total: ₹{total.toFixed(2)}</h3>
        <p className="muted">
          {slot ? `Pickup: ${slot.slot_date} at ${slot.start_time}` : 'Select a pickup slot above.'}
        </p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div className="actions">
          <button className="outline" onClick={clearCart}>Clear cart</button>
          <Link to="/menu"><button className="outline">Add more items</button></Link>
          <button disabled={!slot || placing} onClick={placeOrder}>
            {placing ? 'Placing...' : 'Place order & pay'}
          </button>
        </div>
      </div>
    </div>
  );
}
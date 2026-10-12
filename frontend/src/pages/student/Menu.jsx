import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useCart } from '../../context/CartContext';
import MenuCard from '../../components/MenuCard';

export default function Menu() {
  const { addItem, count } = useCart();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('All');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/menu')
      .then((res) => setItems(res.data))
      .catch(() => setError('Could not load the menu'));
  }, []);

  const categories = ['All', ...new Set(items.map((i) => i.category))];
  const shown = category === 'All' ? items : items.filter((i) => i.category === category);

  return (
    <div className="page">
      <h2>Today's Menu</h2>
      <p className="muted">Items in cart: {count}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div className="filters">
        {categories.map((c) => (
          <button
            key={c}
            className={c === category ? '' : 'outline'}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid">
        {shown.map((item) => (
          <MenuCard key={item.id} item={item} onAdd={addItem} />
        ))}
      </div>
    </div>
  );
}
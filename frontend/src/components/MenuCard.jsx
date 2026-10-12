import { useState } from 'react';

// Picks an icon for items that have no photo yet
function iconFor(item) {
  const t = `${item.name} ${item.category}`.toLowerCase();
  if (/tea|chai|coffee/.test(t)) return '☕';
  if (/juice|shake|soda|drink|lassi|water/.test(t)) return '🥤';
  if (/sandwich|burger/.test(t)) return '🥪';
  if (/samosa|snack|puff|roll/.test(t)) return '🥟';
  if (/dosa|idli|meal|rice|thali|biryani/.test(t)) return '🍛';
  if (/noodle|pasta/.test(t)) return '🍜';
  if (/cake|sweet|dessert|ice/.test(t)) return '🍰';
  return '🍽️';
}

export default function MenuCard({ item, onAdd }) {
  const [imgFailed, setImgFailed] = useState(false);
  const soldOut = !item.is_available || item.stock_qty <= 0;

  return (
    <div className="card menu-card" style={{ opacity: soldOut ? 0.55 : 1 }}>
      {item.image_url && !imgFailed ? (
        <img
          className="food-img"
          src={item.image_url}
          alt={item.name}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="food-img placeholder">{iconFor(item)}</div>
      )}
      <h3>{item.name}</h3>
      <p className="muted">{item.category}</p>
      <p className="price">₹{Number(item.price).toFixed(2)}</p>
      <button disabled={soldOut} onClick={() => onAdd(item)}>
        {soldOut ? 'Unavailable' : 'Add to cart'}
      </button>
    </div>
  );
}
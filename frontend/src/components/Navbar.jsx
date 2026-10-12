import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <span className="brand">🍽️ College Canteen</span>
      <div className="nav-links">
        {user.role === 'student' && (
          <>
            <Link to="/menu">Menu</Link>
            <Link to="/cart">Cart ({count})</Link>
            <Link to="/orders">My Orders</Link>
          </>
        )}
        {user.role === 'staff' && (
          <>
            <Link to="/staff">Dashboard</Link>
            <Link to="/staff/menu">Manage Menu</Link>
            <Link to="/staff/slots">Slots</Link>
          </>
        )}
      </div>
      <div className="nav-right">
        <span>{user.name}</span>
        <button onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}
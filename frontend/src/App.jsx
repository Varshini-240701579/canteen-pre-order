import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Menu from './pages/student/Menu';
import Cart from './pages/student/Cart';
import MyOrders from './pages/student/MyOrders';
import Payment from './pages/student/Payment';
import Bill from './pages/student/Bill';
import Dashboard from './pages/staff/Dashboard';
import ManageMenu from './pages/staff/ManageMenu';
import ManageSlots from './pages/staff/ManageSlots';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'staff' ? '/staff' : '/menu'} replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/menu" element={
          <ProtectedRoute roles={['student']}><Menu /></ProtectedRoute>
        } />
        <Route path="/cart" element={
          <ProtectedRoute roles={['student']}><Cart /></ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute roles={['student']}><MyOrders /></ProtectedRoute>
        } />
        <Route path="/pay/:id" element={
          <ProtectedRoute roles={['student']}><Payment /></ProtectedRoute>
        } />
        <Route path="/bill/:id" element={
          <ProtectedRoute roles={['student', 'staff']}><Bill /></ProtectedRoute>
        } />

        <Route path="/staff" element={
          <ProtectedRoute roles={['staff']}><Dashboard /></ProtectedRoute>
        } />
        <Route path="/staff/menu" element={
          <ProtectedRoute roles={['staff']}><ManageMenu /></ProtectedRoute>
        } />
        <Route path="/staff/slots" element={
          <ProtectedRoute roles={['staff']}><ManageSlots /></ProtectedRoute>
        } />
      </Routes>
    </>
  );
}
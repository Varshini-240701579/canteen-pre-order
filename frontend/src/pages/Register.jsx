import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', student_id: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/register', form);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  const field = { display: 'block', width: '100%', marginBottom: 10, padding: 8 };

  return (
    <div style={{ maxWidth: 360, margin: '60px auto', padding: 16 }}>
      <h2>Student Registration</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input name="name" placeholder="Full name" value={form.name} onChange={handleChange} required style={field} />
        <input name="student_id" placeholder="Student ID / Roll no." value={form.student_id} onChange={handleChange} required style={field} />
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required style={field} />
        <input name="password" type="password" placeholder="Password (min 6 characters)" value={form.password} onChange={handleChange} required style={field} />
        <button type="submit" style={{ padding: '8px 16px' }}>Register</button>
      </form>
      <p>Already registered? <Link to="/login">Login</Link></p>
    </div>
  );
}
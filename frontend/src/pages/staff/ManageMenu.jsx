import { useEffect, useState } from 'react';
import api from '../../api/axios';

const empty = { name: '', category: '', price: '', stock_qty: '', image_url: '' };

export default function ManageMenu() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => api.get('/menu').then((res) => setItems(res.data));

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Pick a photo from the computer: it is uploaded and its path is filled in
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMessage('');
    setUploading(true);
    const data = new FormData();
    data.append('image', file);
    try {
      const res = await api.post('/upload', data);
      setForm((f) => ({ ...f, image_url: res.data.url }));
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not upload the photo');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (editingId) {
        await api.put(`/menu/${editingId}`, form);
      } else {
        await api.post('/menu', form);
      }
      setForm(empty);
      setEditingId(null);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Something went wrong');
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      price: item.price,
      stock_qty: item.stock_qty,
      image_url: item.image_url || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggle = async (id) => {
    await api.patch(`/menu/${id}/availability`);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      await api.delete(`/menu/${id}`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not delete');
    }
  };

  return (
    <div className="page">
      <h2>Manage Menu</h2>

      <form className="card form-row" onSubmit={handleSubmit}>
        <input name="name" placeholder="Item name" value={form.name} onChange={handleChange} required />
        <input name="category" placeholder="Category" value={form.category} onChange={handleChange} required />
        <input name="price" type="number" step="0.01" min="0" placeholder="Price" value={form.price} onChange={handleChange} required />
        <input name="stock_qty" type="number" min="0" placeholder="Stock" value={form.stock_qty} onChange={handleChange} required />

        <label>
          Photo
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} disabled={uploading} />
        </label>
        {uploading && <span className="muted">Uploading...</span>}
        {form.image_url && !uploading && (
          <img className="thumb" src={form.image_url} alt="preview" />
        )}

        <button type="submit" disabled={uploading}>{editingId ? 'Update' : 'Add item'}</button>
        {editingId && (
          <button type="button" className="outline" onClick={() => { setEditingId(null); setForm(empty); }}>
            Cancel
          </button>
        )}
      </form>

      {message && <p style={{ color: 'red' }}>{message}</p>}

      <table>
        <thead>
          <tr>
            <th>Photo</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Available</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.image_url
                  ? <img className="thumb" src={item.image_url} alt={item.name} />
                  : '—'}
              </td>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>₹{Number(item.price).toFixed(2)}</td>
              <td>{item.stock_qty}</td>
              <td>{item.is_available ? 'Yes' : 'No'}</td>
              <td className="actions">
                <button className="outline" onClick={() => startEdit(item)}>Edit</button>
                <button className="outline" onClick={() => toggle(item.id)}>
                  {item.is_available ? 'Turn off' : 'Turn on'}
                </button>
                <button className="danger" onClick={() => remove(item.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
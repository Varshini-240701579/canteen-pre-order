import { useEffect, useState } from 'react';
import api from '../api/axios';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

export default function SlotPicker({ selected, onSelect }) {
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get('/slots', { params: { date } })
      .then((res) => setSlots(res.data))
      .catch(() => setError('Could not load pickup slots'));
  }, [date]);

  return (
    <div className="card">
      <h3>Choose pickup time</h3>
      <input
        type="date"
        value={date}
        min={today()}
        onChange={(e) => { setDate(e.target.value); onSelect(null); }}
        style={{ padding: 8, marginBottom: 12 }}
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {slots.length === 0 && !error && <p className="muted">No slots available for this date.</p>}

      <div className="slot-grid">
        {slots.map((s) => {
          const disabled = s.is_past || s.remaining === 0;
          const active = selected?.id === s.id;
          return (
            <button
              key={s.id}
              disabled={disabled}
              className={active ? 'slot' : 'slot outline'}
              onClick={() => onSelect(s)}
            >
              {s.start_time} – {s.end_time}
              <small>{s.is_past ? 'Passed' : s.remaining === 0 ? 'Full' : `${s.remaining} left`}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
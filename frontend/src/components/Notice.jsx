import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Shows a one-time success message passed through navigation state, e.g.
 * navigate('/experiments/3', { state: { notice: 'Experiment created.' } }).
 */
export default function Notice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (location.state?.notice) {
      setMessage(location.state.notice);
      // Clear it so a page refresh does not show it again.
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location, navigate]);

  if (!message) return null;
  return (
    <div className="alert alert-success row" role="status">
      <span>{message}</span>
      <span className="spacer" />
      <button type="button" className="btn-link" onClick={() => setMessage(null)}>
        Dismiss
      </button>
    </div>
  );
}

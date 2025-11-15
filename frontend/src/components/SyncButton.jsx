import React, { useState } from 'react';

function SyncButton({ label, onClick, loading: externalLoading }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    try {
      await onClick();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Sync failed');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || externalLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        className="btn"
        onClick={handleClick}
        disabled={isLoading}
        style={{
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          background: success ? 'var(--success)' : error ? 'var(--danger)' : undefined,
          color: (success || error) ? 'white' : undefined,
        }}
      >
        {isLoading ? 'Syncing...' : success ? '✓ Synced' : error ? '✗ Error' : label}
      </button>
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</span>
      )}
    </div>
  );
}

export default SyncButton;


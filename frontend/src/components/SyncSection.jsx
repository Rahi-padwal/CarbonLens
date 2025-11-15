import React, { useState } from 'react';

function SyncSection({ title, endpoint, userEmail }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          days_back: 30,
          max_results: 100,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setResult({
          success: true,
          message: 'Synced',
          processed: data.processed,
          found: data.messages_found || data.events_found || data.files_found,
        });
        // Refresh activities after sync
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setResult({
          success: false,
          message: data.error || data.message || 'Sync failed',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err.message || 'Sync failed',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '12px', 
      background: 'rgba(255, 255, 255, 0.6)', 
      borderRadius: '10px',
      border: '1px solid var(--border-color)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>
        <button
          className="btn"
          onClick={handleSync}
          disabled={loading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Syncing...' : 'Sync'}
        </button>
      </div>
      {result && (
        <div
          style={{
            fontSize: '11px',
            color: result.success ? 'var(--success)' : 'var(--danger)',
            marginTop: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span>{result.message}</span>
          {result.success && result.processed !== undefined && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {result.processed} new items processed
            </span>
          )}
          {!result.success && result.found !== undefined && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Found {result.found} items
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncSection;


import React from 'react';

function ReportPage() {
  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>Reports</h2>
        <p style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
          Generate weekly and monthly reports. Automation and exports will be added in Phase 7.
        </p>
      </header>

      <section className="section-block" style={{ marginBottom: 18 }}>
        <h3 className="card-title">Available summaries</h3>
        <ul style={{ lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          <li>Weekly email & meeting footprint overview</li>
          <li>Monthly storage and browsing activity summary</li>
          <li>Team comparison snapshot</li>
        </ul>
        <button className="btn primary" type="button" disabled>
          Generate latest report (coming soon)
        </button>
      </section>

      <section className="section-block">
        <h3 className="card-title">Recent reports</h3>
        <div className="empty-state">
          Reports will appear here after export capabilities are enabled in Phase 7.
        </div>
      </section>
    </div>
  );
}

export default ReportPage;

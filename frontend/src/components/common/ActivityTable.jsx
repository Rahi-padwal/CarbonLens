import React from 'react';
import dayjs from 'dayjs';
import styles from './ActivityTable.module.css';

function ActivityTable({ activities = [] }) {
  if (!activities.length) {
    return <div className="empty-state">No activities in this range.</div>;
  }

  return (
    <div className="table-wrapper">
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Type</th>
            <th>Subject / Title</th>
            <th>Emission (kg)</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {activities.slice(0, 12).map((activity) => (
            <tr key={activity.id || activity.timestamp}>
              <td className={styles.type}>{formatType(activity)}</td>
              <td>{activity.payload?.subject || activity.payload?.title || '—'}</td>
              <td>{(activity.emission_kg || activity.emissionKg || 0).toFixed(3)}</td>
              <td>{dayjs(activity.timestamp).format('MMM D, YYYY h:mm A')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function capitalize(text = '') {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatType(activity) {
  const type = activity.activity_type || activity.activityType || 'unknown';
  const base = capitalize(type);
  const direction = activity.payload?.direction || activity.metadata?.direction;
  if (type === 'email' && direction) {
    return `${base} (${direction === 'inbound' ? 'In' : 'Out'})`;
  }
  return base;
}

export default ActivityTable;

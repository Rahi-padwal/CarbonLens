import React from 'react';
import dayjs from 'dayjs';
import styles from './ActivityTable.module.css';

function formatEmissionDisplay(emissionKg) {
  const kg = Number(emissionKg) || 0;
  if (kg <= 0) return '0';
  // If less than 1 gram (0.001 kg), show grams with 1 decimal
  if (kg < 0.001) return `${(kg * 1000).toFixed(1)} g`;
  // Otherwise show kg with 3 decimals
  return `${kg.toFixed(3)} kg`;
}

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
              <td>{formatEmissionDisplay(activity.emission_kg || activity.emissionKg || 0)}</td>
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

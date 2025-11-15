import React from 'react';
import styles from './InsightsPanel.module.css';

function InsightsPanel({ insights = [], emptyMessage = 'Insights will appear here as activity accumulates.' }) {
  if (!insights.length) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.panel}>
      {insights.slice(0, 4).map((insight) => (
        <div key={insight.id || insight.message} className={styles.insight}>
          <span className={styles.tag}>{insight.category || 'general'}</span>
          <p className={styles.message}>{insight.message}</p>
          <span className={styles.time}>{formatRelative(insight.created_at || insight.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function formatRelative(timestamp) {
  if (!timestamp) return '';
  const diffMinutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export default InsightsPanel;

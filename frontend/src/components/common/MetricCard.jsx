import React from 'react';
import clsx from 'clsx';
import styles from './MetricCard.module.css';

function MetricCard({ title, value, delta, footer, variant = 'default', icon }) {
  return (
    <div className={clsx(styles.card, variant !== 'default' && styles[variant])}>
      <div className={styles.header}>
        <div className={styles.icon}>{icon}</div>
        <div>
          <p className={styles.title}>{title}</p>
          <h3 className={styles.value}>{value}</h3>
        </div>
      </div>
      {(delta || footer) && (
        <div className={styles.footer}>
          {delta && <span className={styles.delta}>{delta}</span>}
          {footer && <span className={styles.footerText}>{footer}</span>}
        </div>
      )}
    </div>
  );
}

export default MetricCard;

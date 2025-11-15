import React from 'react';
import dayjs from 'dayjs';
import styles from './WeekSelector.module.css';

function WeekSelector({ currentStart, onChange }) {
  const start = dayjs(currentStart).startOf('week');
  const end = start.endOf('week');

  const goToPrevious = () => onChange(start.subtract(1, 'week').toISOString(), start.subtract(1, 'week').endOf('week').toISOString());
  const goToNext = () => onChange(start.add(1, 'week').toISOString(), start.add(1, 'week').endOf('week').toISOString());

  return (
    <div className={styles.wrapper}>
      <div>
        <button type="button" className="btn outline" onClick={goToPrevious}>
          ← Previous week
        </button>
        <button type="button" className="btn outline" onClick={goToNext}>
          Next week →
        </button>
      </div>
      <span className={styles.rangeLabel}>
        {start.format('MMM D')} – {end.format('MMM D, YYYY')}
      </span>
    </div>
  );
}

export default WeekSelector;

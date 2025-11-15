import React, { useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { DataContext } from '../context/DataContext';
import MetricCard from '../components/common/MetricCard';
import ActivityTable from '../components/common/ActivityTable';

function StorageDashboard() {
  const { activities, aggregations } = useContext(DataContext);
  const [viewMode, setViewMode] = useState('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));
  
  const storage = aggregations.storageInsights;

  const currentWeek = useMemo(() => {
    const start = dayjs().startOf('week').add(weekOffset, 'week');
    return {
      start,
      end: start.endOf('week'),
    };
  }, [weekOffset]);

  // Get all storage activities
  const allStorage = useMemo(() => {
    return activities.filter((item) => {
      const type = item.activity_type || item.activityType;
      return type === 'storage';
    });
  }, [activities]);

  const storageInWeek = useMemo(() => {
    return allStorage.filter((item) => {
      const ts = dayjs(item.timestamp);
      return ts.isAfter(currentWeek.start.subtract(1, 'day')) && ts.isBefore(currentWeek.end.add(1, 'day'));
    });
  }, [allStorage, currentWeek]);

  const storageInMonth = useMemo(() => {
    const month = dayjs(selectedMonth + '-01');
    return allStorage.filter((item) => {
      const ts = dayjs(item.timestamp);
      return ts.isSame(month, 'month');
    });
  }, [allStorage, selectedMonth]);

  const displayStorage = viewMode === 'week' ? storageInWeek : storageInMonth;

  const actions = useMemo(() => storage.actions || [], [storage.actions]);

  const goToSpecificWeek = () => {
    const weekInput = prompt('Enter week start date (YYYY-MM-DD):');
    if (weekInput) {
      const weekStart = dayjs(weekInput).startOf('week');
      const currentWeekStart = dayjs().startOf('week');
      const diffWeeks = weekStart.diff(currentWeekStart, 'week');
      setWeekOffset(diffWeeks);
      setViewMode('week');
    }
  };

  const weekTotal = useMemo(() => {
    return displayStorage.reduce((acc, item) => acc + (item.emission_kg || item.emissionKg || 0), 0);
  }, [displayStorage]);

  return (
    <div>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Storage Dashboard</h2>
          <p style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
            Track cloud storage uploads, downloads, and estimated footprint.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button 
              className={`btn ${viewMode === 'week' ? '' : 'outline'}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button 
              className={`btn ${viewMode === 'month' ? '' : 'outline'}`}
              onClick={() => setViewMode('month')}
            >
              Month
            </button>
          </div>
          {viewMode === 'week' ? (
            <>
              <button className="btn outline" onClick={() => setWeekOffset(weekOffset - 1)}>← Previous</button>
              <button className="btn outline" onClick={() => setWeekOffset(0)}>Current week</button>
              <button className="btn outline" onClick={() => setWeekOffset(weekOffset + 1)}>Next →</button>
              <button className="btn outline" onClick={goToSpecificWeek}>Select week</button>
            </>
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setViewMode('month');
              }}
              className="btn"
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
          )}
        </div>
      </header>

      <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
        {viewMode === 'week' 
          ? `Week: ${currentWeek.start.format('MMM D')} – ${currentWeek.end.format('MMM D, YYYY')}`
          : `Month: ${dayjs(selectedMonth + '-01').format('MMMM YYYY')}`
        }
      </p>

      <div className="grid-two" style={{ marginBottom: 24 }}>
        <MetricCard 
          title={viewMode === 'week' ? 'Storage actions this week' : 'Storage actions this month'} 
          value={displayStorage.length} 
          footer={`Total CO₂ ${weekTotal.toFixed(3)} kg`} 
          icon="🗂" 
        />
        <MetricCard title="All time storage" value={allStorage.length} footer={`Total CO₂ ${storage.emissionKg.toFixed(3)} kg`} icon="🌫" />
        <MetricCard title="Data moved" value={`${storage.uploadedMb} MB`} footer="Approximate transfer" icon="💾" />
      </div>

      <div className="section-block" style={{ marginBottom: 24 }}>
        <h3 className="card-title">Recent storage actions</h3>
        {displayStorage.length ? (
          <ActivityTable activities={displayStorage} />
        ) : (
          <div className="empty-state">No storage events recorded for this {viewMode}.</div>
        )}
      </div>

      <div className="section-block">
        <h3 className="card-title">Recommendations</h3>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <li>Delete or archive large files you no longer need.</li>
          <li>Compress media before uploading to reduce storage weight.</li>
          <li>Leverage shared drives to minimize duplicate copies.</li>
        </ul>
      </div>
    </div>
  );
}

export default StorageDashboard;

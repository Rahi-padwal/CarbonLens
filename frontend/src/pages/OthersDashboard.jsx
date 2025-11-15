import React, { useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { DataContext } from '../context/DataContext';
import MetricCard from '../components/common/MetricCard';
import ActivityTable from '../components/common/ActivityTable';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function OthersDashboard() {
  const { activities } = useContext(DataContext);
  const [viewMode, setViewMode] = useState('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));

  const currentWeek = useMemo(() => {
    const start = dayjs().startOf('week').add(weekOffset, 'week');
    return {
      start,
      end: start.endOf('week'),
    };
  }, [weekOffset]);

  // Get all browsing/other activities
  const allOthers = useMemo(() => {
    return activities.filter((item) => {
      const type = item.activity_type || item.activityType;
      return type === 'browsing' || (type !== 'email' && type !== 'meeting' && type !== 'storage');
    });
  }, [activities]);

  const othersInWeek = useMemo(() => {
    return allOthers.filter((item) => {
      const ts = dayjs(item.timestamp);
      return ts.isAfter(currentWeek.start.subtract(1, 'day')) && ts.isBefore(currentWeek.end.add(1, 'day'));
    });
  }, [allOthers, currentWeek]);

  const othersInMonth = useMemo(() => {
    const month = dayjs(selectedMonth + '-01');
    return allOthers.filter((item) => {
      const ts = dayjs(item.timestamp);
      return ts.isSame(month, 'month');
    });
  }, [allOthers, selectedMonth]);

  const displayOthers = viewMode === 'week' ? othersInWeek : othersInMonth;

  const totals = useMemo(() => {
    return {
      emissionKg: displayOthers.reduce((acc, item) => acc + (item.emission_kg || item.emissionKg || 0), 0),
      totalMinutes: displayOthers.reduce((acc, item) => {
        const mins = item.payload?.duration_minutes || item.payload?.durationMinutes || 0;
        return acc + mins;
      }, 0),
      count: displayOthers.length,
    };
  }, [displayOthers]);

  const series = useMemo(() => {
    const byDay = {};
    displayOthers.forEach((item) => {
      const dayKey = dayjs(item.timestamp).format('ddd');
      byDay[dayKey] = byDay[dayKey] || { day: dayKey, minutes: 0, emissionKg: 0 };
      const mins = item.payload?.duration_minutes || item.payload?.durationMinutes || 0;
      byDay[dayKey].minutes += mins;
      byDay[dayKey].emissionKg += item.emission_kg || item.emissionKg || 0;
    });
    return Object.values(byDay);
  }, [displayOthers]);

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

  return (
    <div>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Others Dashboard</h2>
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

      <div className="grid-two" style={{ marginBottom: 20 }}>
        <MetricCard 
          title={viewMode === 'week' ? 'Activities this week' : 'Activities this month'} 
          value={displayOthers.length} 
          footer={`Total CO₂ ${totals.emissionKg.toFixed(3)} kg`} 
          icon="🌐" 
        />
        <MetricCard 
          title="Total time" 
          value={`${(totals.totalMinutes / 60).toFixed(1)} hours`} 
          footer={`${totals.totalMinutes} minutes`} 
          icon="⏱" 
        />
        <MetricCard 
          title="All time activities" 
          value={allOthers.length} 
          footer={`Total CO₂ ${allOthers.reduce((acc, item) => acc + (item.emission_kg || item.emissionKg || 0), 0).toFixed(3)} kg`} 
          icon="📊" 
        />
        <MetricCard 
          title="Average per activity" 
          value={`${(totals.emissionKg / (displayOthers.length || 1)).toFixed(3)} kg`} 
          footer="CO₂ per activity" 
          icon="📈" 
        />
      </div>

      <div className="section-block" style={{ marginBottom: 18 }}>
        <h3 className="card-title">{viewMode === 'week' ? 'Weekly' : 'Monthly'} activity breakdown</h3>
        {viewMode === 'week' && series.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip formatter={(value, name) => (name === 'minutes' ? [`${value} min`, 'Minutes'] : [`${value.toFixed(3)} kg`, 'CO₂'])} />
              <Bar dataKey="minutes" fill="#9b59b6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : viewMode === 'month' ? (
          <div className="empty-state">Monthly chart view coming soon. Showing {othersInMonth.length} activities for {dayjs(selectedMonth + '-01').format('MMMM YYYY')}.</div>
        ) : (
          <div className="empty-state">No activities recorded for this {viewMode}.</div>
        )}
      </div>

      <div className="section-block">
        <h3 className="card-title">Recent activities</h3>
        <ActivityTable activities={displayOthers} />
      </div>
    </div>
  );
}

export default OthersDashboard;


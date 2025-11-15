import React, { useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
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
import { DataContext } from '../context/DataContext';
import MetricCard from '../components/common/MetricCard';

function MeetingDashboard() {
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

  // Get all meetings
  const allMeetings = useMemo(() => {
    return activities.filter((item) => {
      const type = item.activity_type || item.activityType;
      return type === 'meeting';
    });
  }, [activities]);

  const meetingsInWeek = useMemo(() => {
    return allMeetings.filter((item) => {
      const ts = dayjs(item.timestamp);
      return ts.isAfter(currentWeek.start.subtract(1, 'day')) && ts.isBefore(currentWeek.end.add(1, 'day'));
    });
  }, [allMeetings, currentWeek]);

  const meetingsInMonth = useMemo(() => {
    const month = dayjs(selectedMonth + '-01');
    return allMeetings.filter((item) => {
      const ts = dayjs(item.timestamp);
      return ts.isSame(month, 'month');
    });
  }, [allMeetings, selectedMonth]);

  const displayMeetings = viewMode === 'week' ? meetingsInWeek : meetingsInMonth;

  const totals = useMemo(() => {
    if (!displayMeetings.length) {
      return {
        emissionKg: 0,
        totalMinutes: 0,
        avgParticipants: 0,
        withVideo: 0,
      };
    }

    let minutes = 0;
    let participants = 0;
    let videoSessions = 0;

    displayMeetings.forEach((meeting) => {
      minutes += meeting.payload?.duration_minutes || meeting.payload?.durationMinutes || 0;
      participants += meeting.payload?.participants_count || meeting.payload?.participantsCount || 1;
      if (meeting.payload?.has_video ?? true) {
        videoSessions += 1;
      }
    });

    return {
      emissionKg: displayMeetings.reduce((acc, meeting) => acc + (meeting.emission_kg || meeting.emissionKg || 0), 0),
      totalMinutes: minutes,
      avgParticipants: participants / displayMeetings.length,
      withVideo: videoSessions,
    };
  }, [displayMeetings]);

  const series = useMemo(() => {
    const byDay = {};
    displayMeetings.forEach((meeting) => {
      const dayKey = dayjs(meeting.timestamp).format('ddd');
      byDay[dayKey] = byDay[dayKey] || { day: dayKey, minutes: 0, emissionKg: 0 };
      byDay[dayKey].minutes += meeting.payload?.duration_minutes || meeting.payload?.durationMinutes || 0;
      byDay[dayKey].emissionKg += meeting.emission_kg || meeting.emissionKg || 0;
    });
    return Object.values(byDay);
  }, [displayMeetings]);

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
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Meetings Dashboard</h2>
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
          title="Meetings" 
          value={displayMeetings.length} 
          footer={viewMode === 'week' ? 'Sessions this week' : 'Sessions this month'} 
          icon="📅" 
        />
        <MetricCard title="Total minutes" value={totals.totalMinutes} footer={`~ ${(totals.totalMinutes / 60).toFixed(1)} hours`} icon="⏱" />
        <MetricCard title="Average participants" value={displayMeetings.length ? totals.avgParticipants.toFixed(1) : '0'} footer="people per meeting" icon="🧑‍🤝‍🧑" />
        <MetricCard
          title="CO₂ impact"
          value={`${totals.emissionKg.toFixed(3)} kg`}
          footer={`${totals.withVideo} video sessions`}
          icon="🎥"
        />
      </div>

      <div className="section-block" style={{ marginBottom: 24 }}>
        <h3 className="card-title">{viewMode === 'week' ? 'Weekly' : 'Monthly'} meeting minutes</h3>
        {viewMode === 'week' && series.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip formatter={(value, name) => (name === 'minutes' ? [`${value} min`, 'Minutes'] : [`${value.toFixed(3)} kg`, 'CO₂'])} />
              <Bar dataKey="minutes" fill="#4fc3f7" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : viewMode === 'month' ? (
          <div className="empty-state">Monthly chart view coming soon. Showing {meetingsInMonth.length} meetings for {dayjs(selectedMonth + '-01').format('MMMM YYYY')}.</div>
        ) : (
          <div className="empty-state">No meetings recorded for this {viewMode}.</div>
        )}
      </div>

      <div className="grid-two" style={{ marginBottom: 24 }}>
        <div className="section-block">
          <h3 className="card-title">Recent meetings</h3>
          <ActivityTable activities={displayMeetings} />
        </div>
        <div className="section-block">
          <h3 className="card-title">Insights</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Meeting-specific insights will be added in Phase 6.
          </p>
        </div>
      </div>
    </div>
  );
}

export default MeetingDashboard;

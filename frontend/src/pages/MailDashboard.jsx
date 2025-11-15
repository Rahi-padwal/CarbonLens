import React, { useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
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
import ActivityTable from '../components/common/ActivityTable';

function formatEmissionDisplay(emissionKg) {
  const kg = Number(emissionKg) || 0;
  if (kg <= 0) return '0';
  if (kg < 0.001) return `${(kg * 1000).toFixed(1)} g`;
  return `${kg.toFixed(3)} kg`;
}

function MailDashboard() {
  const { activities, aggregations } = useContext(DataContext);
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'month'
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));

  const currentWeekRange = useMemo(() => {
    const start = dayjs().startOf('week').add(weekOffset, 'week');
    const end = start.endOf('week');
    return { start, end };
  }, [weekOffset]);

  // Get all email activities
  const allEmails = useMemo(() => {
    return activities.filter((activity) => {
      const type = activity.activity_type || activity.activityType;
      return type === 'email';
    });
  }, [activities]);

  const weeklyEmails = useMemo(() => {
    return allEmails.filter((activity) => {
      const ts = dayjs(activity.timestamp);
      return ts.isAfter(currentWeekRange.start.subtract(1, 'day')) && ts.isBefore(currentWeekRange.end.add(1, 'day'));
    });
  }, [allEmails, currentWeekRange]);

  const monthlyEmails = useMemo(() => {
    const month = dayjs(selectedMonth + '-01');
    return allEmails.filter((activity) => {
      const ts = dayjs(activity.timestamp);
      return ts.isSame(month, 'month');
    });
  }, [allEmails, selectedMonth]);

  // Get emails based on current view mode
  const displayEmails = viewMode === 'week' ? weeklyEmails : monthlyEmails;

  const weeklySeries = useMemo(() => {
    const byDay = {};
    weeklyEmails.forEach((email) => {
      const dayKey = dayjs(email.timestamp).format('ddd');
      byDay[dayKey] = byDay[dayKey] || { day: dayKey, emails: 0, emissionKg: 0 };
      byDay[dayKey].emails += 1;
      byDay[dayKey].emissionKg += email.emission_kg || email.emissionKg || 0;
    });
    return Object.values(byDay);
  }, [weeklyEmails]);

  const topAttachments = useMemo(() => {
    return displayEmails
      .filter((email) => (email.payload?.attachment_count || email.payload?.attachmentCount || 0) > 0)
      .map((email) => ({
        subject: email.payload?.subject || '(no subject)',
        attachments: email.payload?.attachment_count || email.payload?.attachmentCount || 0,
        sizeMb: ((email.payload?.attachment_bytes || email.payload?.attachmentBytes || 0) / 1_000_000).toFixed(2),
        date: dayjs(email.timestamp).format('MMM D, YYYY'),
      }))
      .slice(0, 8);
  }, [displayEmails]);

  const insights = aggregations.emailInsights;

  const handleWeekChange = (newOffset) => {
    setWeekOffset(newOffset);
    setViewMode('week');
  };

  const handleMonthChange = (event) => {
    setSelectedMonth(event.target.value);
    setViewMode('month');
  };

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
        <h2 style={{ margin: 0 }}>Mail Dashboard</h2>
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
              <button className="btn outline" onClick={() => handleWeekChange(weekOffset - 1)}>← Previous</button>
              <button className="btn outline" onClick={() => handleWeekChange(0)}>Current week</button>
              <button className="btn outline" onClick={() => handleWeekChange(weekOffset + 1)}>Next →</button>
              <button className="btn outline" onClick={goToSpecificWeek}>Select week</button>
            </>
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={handleMonthChange}
              className="btn"
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
          )}
        </div>
      </header>

      <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
        {viewMode === 'week' 
          ? `Week: ${currentWeekRange.start.format('MMM D')} – ${currentWeekRange.end.format('MMM D, YYYY')}`
          : `Month: ${dayjs(selectedMonth + '-01').format('MMMM YYYY')}`
        }
      </p>

      <div className="grid-two" style={{ marginBottom: 20 }}>
        <MetricCard
          title={viewMode === 'week' ? 'Emails this week' : 'Emails this month'}
          value={displayEmails.length}
          footer={`Total CO₂ ${formatEmissionDisplay(displayEmails.reduce((acc, email) => acc + (email.emission_kg || email.emissionKg || 0), 0))}`}
          icon="✉️"
        />
        <MetricCard
          title="All time emails"
          value={allEmails.length}
          footer={`Total CO₂ ${formatEmissionDisplay(allEmails.reduce((acc, email) => acc + (email.emission_kg || email.emissionKg || 0), 0))}`}
          icon="📧"
        />
      </div>

      <div className="section-block" style={{ marginBottom: 18 }}>
        <h3 className="card-title">{viewMode === 'week' ? 'Weekly' : 'Monthly'} email cadence</h3>
        {viewMode === 'week' && weeklySeries.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklySeries}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip formatter={(value, name) => (name === 'emails' ? [`${value}`, 'Emails'] : [`${value.toFixed(3)} kg`, 'CO₂'])} />
              <Bar dataKey="emails" fill="#1abc9c" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : viewMode === 'month' ? (
          <div className="empty-state">Monthly chart view coming soon. Showing {monthlyEmails.length} emails for {dayjs(selectedMonth + '-01').format('MMMM YYYY')}.</div>
        ) : (
          <div className="empty-state">No email activity recorded for this {viewMode}.</div>
        )}
      </div>

      <div className="grid-two" style={{ marginBottom: 24 }}>
        <div className="section-block">
          <h3 className="card-title">Attachments (top)</h3>
          {topAttachments.length ? (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Count</th>
                    <th>Size (MB)</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {topAttachments.map((item) => (
                    <tr key={`${item.subject}-${item.date}`}>
                      <td>{item.subject}</td>
                      <td>{item.attachments}</td>
                      <td>{item.sizeMb}</td>
                      <td>{item.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No attachments found.</div>
          )}
        </div>
        <div className="section-block">
          <h3 className="card-title">Recent emails</h3>
          <ActivityTable activities={displayEmails} />
        </div>
      </div>

      <div className="section-block">
        <h3 className="card-title">Insights for this period</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Automated tips will appear here after Phase 6 (AI insights).
        </p>
      </div>
    </div>
  );
}

export default MailDashboard;

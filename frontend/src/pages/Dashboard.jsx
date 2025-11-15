import React, { useContext, useEffect, useMemo, useState } from 'react';
import { DataContext, TIME_PRESETS } from '../context/DataContext';
import MetricCard from '../components/common/MetricCard';
import TrendAreaChart from '../components/common/TrendAreaChart';
import PieBreakdownChart from '../components/common/PieBreakdownChart';
import ActivityTable from '../components/common/ActivityTable';
import InsightsPanel from '../components/common/InsightsPanel';
import SyncSection from '../components/SyncSection';
import { buildAggregations } from '../utils/aggregations';
import { fetchInsights } from '../services/api';
import dayjs from 'dayjs';

function Dashboard() {
  const { aggregations, activities, setPresetRange, setCustomRange, range, loading, error, userEmail, authenticatedUser } = useContext(DataContext);
  const { summary, charts } = aggregations;
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const syncIdentifier = authenticatedUser?.id || authenticatedUser?.email || '';
  const encodedSyncIdentifier = encodeURIComponent(syncIdentifier);

  // Ensure default is "All time" on mount
  useEffect(() => {
    if (range.preset !== TIME_PRESETS.ALL_TIME && !range.start && !range.end) {
      setPresetRange(TIME_PRESETS.ALL_TIME);
    }
  }, []);

  // Load insights
  useEffect(() => {
    if (userEmail) {
      setInsightsLoading(true);
      fetchInsights({ userEmail, period: 'weekly' })
        .then((data) => {
          if (data.success) {
            setInsights(data.insights || []);
          }
        })
        .catch((err) => {
          console.error('[Dashboard] Failed to load insights:', err);
          setInsights([]);
        })
        .finally(() => {
          setInsightsLoading(false);
        });
    }
  }, [userEmail, activities.length]);

  // Filter activities by date range if specified
  const filteredActivities = React.useMemo(() => {
    if (!range.start && !range.end) {
      return activities; // All time - return all
    }
    return activities.filter((activity) => {
      const ts = dayjs(activity.timestamp);
      if (range.start && ts.isBefore(dayjs(range.start))) return false;
      if (range.end && ts.isAfter(dayjs(range.end))) return false;
      return true;
    });
  }, [activities, range]);

  // Recalculate aggregations for filtered activities
  const filteredAggregations = React.useMemo(() => {
    return buildAggregations({ activities: filteredActivities, range });
  }, [filteredActivities, range]);

  const { summary: filteredSummary, charts: filteredCharts } = filteredAggregations;

  return (
    <div>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>All Activities Overview</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className={`btn ${range.preset === TIME_PRESETS.ALL_TIME ? '' : 'outline'}`}
            onClick={() => setPresetRange(TIME_PRESETS.ALL_TIME)}
          >
            All time
          </button>
          <button 
            type="button" 
            className={`btn ${range.preset === TIME_PRESETS.LAST_7_DAYS ? '' : 'outline'}`}
            onClick={() => setPresetRange(TIME_PRESETS.LAST_7_DAYS)}
          >
            Last 7 days
          </button>
          <button 
            type="button" 
            className={`btn ${range.preset === TIME_PRESETS.LAST_30_DAYS ? '' : 'outline'}`}
            onClick={() => setPresetRange(TIME_PRESETS.LAST_30_DAYS)}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className="btn outline"
            onClick={() => {
              const start = prompt('Custom range start (YYYY-MM-DD)');
              const end = prompt('Custom range end (YYYY-MM-DD)');
              if (start && end) {
                setCustomRange(dayjs(start).toISOString(), dayjs(end).toISOString());
              }
            }}
          >
            Custom range
          </button>
        </div>
      </header>

      {/* Sync Section */}
      {authenticatedUser && (
        <div className="section-block" style={{ marginBottom: 20, background: 'rgba(15, 157, 88, 0.08)' }}>
          <h3 className="card-title" style={{ marginBottom: 12 }}>Sync Historical Data</h3>
          <p style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: '13px' }}>
            Sync your past emails, meetings, and storage data from your connected accounts.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {authenticatedUser.provider === 'google' && (
              <>
                <SyncSection 
                  title="Gmail"
                  endpoint={`/auth/google/gmail/sync/${encodedSyncIdentifier}`}
                  userEmail={authenticatedUser.email}
                />
                <SyncSection 
                  title="Google Meet"
                  endpoint={`/api/meetings/google-meet/sync/${encodedSyncIdentifier}`}
                  userEmail={authenticatedUser.email}
                />
                <SyncSection 
                  title="Google Drive"
                  endpoint={`/api/storage/google-drive/sync/${encodedSyncIdentifier}`}
                  userEmail={authenticatedUser.email}
                />
              </>
            )}
            {authenticatedUser.provider === 'microsoft' && (
              <>
                <SyncSection 
                  title="Outlook"
                  endpoint={`/auth/outlook/outlook/sync/${encodedSyncIdentifier}`}
                  userEmail={authenticatedUser.email}
                />
                <SyncSection 
                  title="Teams"
                  endpoint={`/api/meetings/teams/sync/${encodedSyncIdentifier}`}
                  userEmail={authenticatedUser.email}
                />
                <SyncSection 
                  title="OneDrive"
                  endpoint={`/api/storage/onedrive/sync/${encodedSyncIdentifier}`}
                  userEmail={authenticatedUser.email}
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid-two" style={{ marginBottom: 20 }}>
        <MetricCard
          title="Total Emissions"
          value={`${filteredSummary.totalEmissionKg.toFixed(3)} kg`}
          footer={`Across ${filteredSummary.totalActivities} activities`}
          icon="🌍"
        />
        <MetricCard
          title="Last activity"
          value={filteredSummary.lastActivityAt ? filteredSummary.lastActivityAt.format('MMM D, YYYY h:mm A') : '—'}
          footer={range.label || 'All time'}
          icon="⏱"
        />
        <MetricCard
          title="Email average"
          value={`${filteredSummary.averageEmailEmissionKg.toFixed(3)} kg`}
          footer="Average CO₂ per email"
          icon="✉️"
        />
        <MetricCard
          title="Active categories"
          value={Object.keys(filteredSummary.byType).length}
          footer="Unique activity types"
          icon="📊"
        />
      </div>

      <section style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 24 }}>
        <div className="section-block">
          <h3 className="card-title">Emission trend</h3>
          <TrendAreaChart data={filteredCharts.dailySeries} />
        </div>
        <div className="section-block">
          <h3 className="card-title">Breakdown by type</h3>
          <PieBreakdownChart data={filteredCharts.typeSeries} />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 18, gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="section-block">
          <h3 className="card-title">Recent activity</h3>
          <ActivityTable activities={filteredActivities} />
        </div>
        <div className="section-block">
          <h3 className="card-title">Insights</h3>
          {insightsLoading ? (
            <div className="empty-state">Loading insights...</div>
          ) : (
            <InsightsPanel insights={insights} />
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;

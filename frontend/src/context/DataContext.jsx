import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { fetchActivities } from '../services/api';
import { buildAggregations } from '../utils/aggregations';
import { getStoredProfile, setStoredProfile } from '../utils/storage';

export const DataContext = createContext({});

export const TIME_PRESETS = {
  ALL_TIME: 'all-time',
  LAST_7_DAYS: 'last-7-days',
  LAST_30_DAYS: 'last-30-days',
};

const DEFAULT_RANGE = {
  label: 'All time',
  preset: TIME_PRESETS.ALL_TIME,
  start: null,
  end: null,
};

const AUTH_STORAGE_KEY = 'carbonlens:auth';

function getStoredAuth() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredAuth(user) {
  if (typeof window === 'undefined') return;
  if (user) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function DataProvider({ children }) {
  const storedProfile = getStoredProfile();
  const [authenticatedUser, setAuthenticatedUserState] = useState(getStoredAuth());
  const [gmailEmail, setGmailEmail] = useState(storedProfile.gmailEmail);
  const [outlookEmail, setOutlookEmail] = useState(storedProfile.outlookEmail);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [range, setRange] = useState(DEFAULT_RANGE);

  const setAuthenticatedUser = useCallback((user) => {
    setAuthenticatedUserState(user);
    setStoredAuth(user);
    if (user) {
      if (user.provider === 'google') {
        setGmailEmail(user.email);
      } else if (user.provider === 'microsoft') {
        setOutlookEmail(user.email);
      }
    }
  }, []);

  const loadActivities = useCallback(
    async ({ email, start, end, allTime = false } = {}) => {
      setLoading(true);
      setError(null);
      try {
        // If allTime is true, don't pass date filters - get ALL historical data
        const fetchParams = {
          userEmail: email || undefined,
          limit: allTime ? 2000 : 500,  // Higher limit for all time
        };
        
        // Only add date filters if NOT all time
        if (!allTime && start) {
          fetchParams.start = start;
        }
        if (!allTime && end) {
          fetchParams.end = end;
        }
        
        console.log('[DataContext] Loading activities for email:', email, 'allTime:', allTime, 'range:', { start, end });
        const response = await fetchActivities(fetchParams);
        console.log('[DataContext] Received response:', {
          success: response.success,
          count: response.count,
          activitiesCount: response.activities?.length || 0,
        });
        const activitiesList = response.activities || [];
        console.log('[DataContext] Setting activities:', activitiesList.length, 'items');
        setActivities(activitiesList);
      } catch (err) {
        console.error('[DataContext] Failed to fetch activities', err);
        setError(err.message || 'Failed to load activities');
        setActivities([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setStoredProfile({ gmailEmail, outlookEmail });
    const { start, end, preset } = range;
    const emailToUse = authenticatedUser?.email || gmailEmail || outlookEmail;
    if (emailToUse) {
      // If preset is ALL_TIME or no start/end, load ALL historical data
      const isAllTime = preset === TIME_PRESETS.ALL_TIME || (!start && !end);
      loadActivities({ 
        email: emailToUse, 
        start: isAllTime ? undefined : start, 
        end: isAllTime ? undefined : end,
        allTime: isAllTime
      });
    }
  }, [authenticatedUser, gmailEmail, outlookEmail, range, loadActivities]);

  const setPresetRange = useCallback((preset) => {
    if (preset === TIME_PRESETS.ALL_TIME) {
      setRange(DEFAULT_RANGE);
      return;
    }
    if (preset === TIME_PRESETS.LAST_7_DAYS) {
      setRange({
        label: 'Last 7 days',
        preset,
        start: dayjs().subtract(6, 'day').startOf('day').toISOString(),
        end: dayjs().endOf('day').toISOString(),
      });
      return;
    }
    if (preset === TIME_PRESETS.LAST_30_DAYS) {
      setRange({
        label: 'Last 30 days',
        preset,
        start: dayjs().subtract(29, 'day').startOf('day').toISOString(),
        end: dayjs().endOf('day').toISOString(),
      });
    }
  }, []);

  const setCustomRange = useCallback((start, end) => {
    setRange({
      label: `${dayjs(start).format('MMM D, YYYY')} → ${dayjs(end).format('MMM D, YYYY')}`,
      preset: 'custom',
      start: dayjs(start).startOf('day').toISOString(),
      end: dayjs(end).endOf('day').toISOString(),
    });
  }, []);

  const aggregations = useMemo(() => {
    return buildAggregations({ activities, range });
  }, [activities, range]);

  return (
    <DataContext.Provider
      value={{
        authenticatedUser,
        setAuthenticatedUser,
        userEmail: authenticatedUser?.email || gmailEmail,
        setUserEmail: setGmailEmail,
        loading,
        error,
        activities,
        range,
        setPresetRange,
        setCustomRange,
        refresh: () => {
          const emailToUse = authenticatedUser?.email || gmailEmail || outlookEmail;
          loadActivities({ email: emailToUse, start: range.start, end: range.end });
        },
        aggregations,
        gmailEmail,
        outlookEmail,
        setGmailEmail,
        setOutlookEmail,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

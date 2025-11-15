# Debug Guide - Data Not Showing Issue

## Steps to Debug

### 1. Check Backend Logs
After restarting backend, you should see logs like:
```
[Activities API] Request params: userEmail=your@email.com, ...
[Activities API] Results: total_docs=X, filtered_by_email=Y, returned=Z
```

### 2. Check Browser Console (F12)
Open browser console and look for:
- `[API] Fetching activities from: ...`
- `[DataContext] Loading activities for email: ...`
- `[Dashboard] Current state: ...`

### 3. Test Debug Endpoint
Open in browser: `http://localhost:5000/api/debug/activities-count`

This will show:
- Total activities in database
- Activities grouped by email
- Sample emails found

### 4. Check Extension
1. Open Gmail or Outlook in browser
2. Send a test email
3. Check backend terminal - should see: `[Activities API] Received activity log request: email`
4. Check if extension detected the email correctly

### 5. Common Issues

#### Issue: No activities in database
**Solution**: 
- Make sure extension is installed and enabled
- Send a test email from Gmail/Outlook
- Check backend logs for `[Activities API] Received activity log request`

#### Issue: Email mismatch
**Solution**:
- Check what email is stored in activities: Visit `/api/debug/activities-count`
- Check what email you're logged in with in frontend
- Emails must match exactly (case-insensitive now)

#### Issue: Extension not detecting emails
**Solution**:
- Check extension popup - should show "Backend: Online"
- Check extension has permissions for Gmail/Outlook
- Try reloading Gmail/Outlook page
- Check browser console for extension errors

### 6. Manual Test

1. **Test if backend is receiving data:**
   - Send an email from Gmail
   - Check backend terminal for logs
   - Should see: `[Activities API] Activity logged successfully`

2. **Test if data is in Firebase:**
   - Visit: `http://localhost:5000/api/debug/activities-count`
   - Check if your email appears in the list
   - Check total_activities count

3. **Test if frontend is fetching correctly:**
   - Open browser console (F12)
   - Look for `[API] Response:` logs
   - Check `activitiesLength` value

### 7. Quick Fixes

If data exists but not showing:
1. **Clear browser cache and reload**
2. **Check email in URL params matches Firebase email**
3. **Try logging out and logging in again**
4. **Check if activities have `user_email` field set correctly**

If no data at all:
1. **Make sure extension is working** - send test email
2. **Check backend is running** - visit `/api/health`
3. **Check Firebase connection** - backend should show `[OK] Firebase initialized successfully`
4. **Send test email and watch backend logs**


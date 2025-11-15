# 🧪 CarbonLens Testing Guide

## Step 1: Backend Start Karein

### Terminal 1 - Backend
```bash
cd backend
python -m venv venv  # Agar venv nahi hai toh
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux

pip install -r requirements.txt
python app.py
```

**Expected Output:**
```
[OK] Flask app initialized
[OK] Firebase initialized successfully
 * Running on http://127.0.0.1:5000
```

✅ **Check:** Browser mein `http://localhost:5000/api/health` open karein - `{"status":"ok"}` dikhna chahiye

---

## Step 2: Frontend Start Karein

### Terminal 2 - Frontend
```bash
cd frontend
npm install  # Agar pehli baar run kar rahe ho
npm run dev
```

**Expected Output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

✅ **Check:** Browser mein `http://localhost:5173` open karein - Login page dikhna chahiye

---

## Step 3: OAuth Login Test

### Google Login
1. Frontend pe "Login with Google" button click karein
2. Google account se login karein
3. Permissions allow karein (Gmail, Calendar, Drive)
4. Redirect hoke Dashboard pe aana chahiye
5. ✅ **Check:** Top right mein email aur name dikhna chahiye

### Microsoft Login
1. "Login with Microsoft" button click karein
2. Microsoft account se login karein
3. Permissions allow karein (Mail, Calendar, Files)
4. Redirect hoke Dashboard pe aana chahiye
5. ✅ **Check:** Top right mein email aur name dikhna chahiye

---

## Step 4: Dashboard Features Test

### Main Dashboard (Overview)
1. ✅ **All Activities** - Sab activities dikhni chahiye
2. ✅ **Date Range Filters:**
   - "All time" - Sab data
   - "Last 7 days" - Sirf last week
   - "Last 30 days" - Last month
   - "Custom range" - Koi bhi date range
3. ✅ **Metrics Cards:**
   - Total Emissions
   - Last activity
   - Email average
   - Active categories
4. ✅ **Charts:**
   - Emission trend (line chart)
   - Breakdown by type (pie chart)
5. ✅ **Activity Table** - Recent activities list
6. ✅ **Insights Panel** - Rule-based insights (agar data hai)

---

## Step 5: Historical Data Sync Test

### Dashboard pe "Sync Historical Data" section dikhna chahiye

### Gmail Sync (Google Login ke baad)
1. "Gmail" sync button click karein
2. Backend terminal mein logs dikhne chahiye:
   ```
   [Gmail Sync] Processing message...
   [Gmail Sync] Error processing message...
   ```
3. ✅ **Check:** Button pe "X new items processed" dikhna chahiye
4. ✅ **Check:** Dashboard refresh karein - emails add hone chahiye

### Outlook Sync (Microsoft Login ke baad)
1. "Outlook" sync button click karein
2. ✅ **Check:** Similar to Gmail sync

### Google Meet Sync
1. "Google Meet" sync button click karein
2. ✅ **Check:** Calendar events with Meet links sync hone chahiye
3. ✅ **Check:** Meetings dashboard pe meetings dikhni chahiye

### Teams Sync
1. "Teams" sync button click karein
2. ✅ **Check:** Teams meetings sync hone chahiye

### Google Drive Sync
1. "Google Drive" sync button click karein
2. ✅ **Check:** File uploads track hone chahiye
3. ✅ **Check:** Storage dashboard pe data dikhna chahiye

### OneDrive Sync
1. "OneDrive" sync button click karein
2. ✅ **Check:** Similar to Google Drive

---

## Step 6: Individual Dashboards Test

### Mail Dashboard (`/mail`)
1. ✅ **Default:** Current week ka data
2. ✅ **Week/Month Toggle** - Switch karein
3. ✅ **Week Navigation:**
   - Previous week
   - Current week
   - Next week
   - Select week (kisi bhi week ko)
4. ✅ **Monthly View** - Month picker se koi bhi month select karein
5. ✅ **Metrics:**
   - Emails count
   - Total emissions
   - Average recipients
   - Attachments count
6. ✅ **Charts:**
   - Weekly email cadence
   - Top attachments table

### Meetings Dashboard (`/meetings`)
1. ✅ **Default:** Current week
2. ✅ **Week/Month Toggle**
3. ✅ **Week Navigation** - Similar to Mail
4. ✅ **Metrics:**
   - Meetings count
   - Total minutes
   - Average participants
   - Video vs Audio
5. ✅ **Charts:**
   - Meeting minutes per day
   - Activity table

### Storage Dashboard (`/storage`)
1. ✅ **Default:** Current week
2. ✅ **Week/Month Toggle**
3. ✅ **Week Navigation**
4. ✅ **Metrics:**
   - Storage actions
   - Total storage
   - CO₂ impact
5. ✅ **Activity Table** - File uploads list

### Others Dashboard (`/others`) - NEW!
1. ✅ **Default:** Current week
2. ✅ **Week/Month Toggle**
3. ✅ **Week Navigation**
4. ✅ **Metrics:**
   - Activities count
   - Total time
   - All time activities
   - Average per activity
5. ✅ **Charts:**
   - Weekly activity breakdown
   - Activity table

---

## Step 7: Insights Test

### Rule-Based Insights
1. ✅ **Dashboard pe Insights panel** - Dikhna chahiye
2. ✅ **Agar data hai:**
   - Email insights (high volume, large attachments)
   - Meeting insights (long meetings, video usage)
   - Storage insights (unused storage, high usage)
3. ✅ **Color Fix:** Text visible hona chahiye (white text issue fixed)

### Test Insights Manually:
- **Email:** 100+ emails send karein → "High email volume" insight
- **Meetings:** 20+ hours meetings → "High meeting hours" insight
- **Storage:** 50+ GB storage → "High storage usage" insight

---

## Step 8: Extension Test (Optional)

### Chrome Extension Load Karein
1. Chrome mein `chrome://extensions/` open karein
2. "Developer mode" ON karein
3. "Load unpacked" click karein
4. `extension` folder select karein
5. ✅ **Check:** Extension icon dikhna chahiye

### Gmail/Outlook Tracking
1. Gmail ya Outlook open karein
2. Email send karein
3. ✅ **Check:** Extension se activity log hona chahiye
4. ✅ **Check:** Dashboard pe activity dikhni chahiye

---

## Step 9: API Endpoints Test (Manual)

### Browser/Postman se test karein:

#### Health Check
```
GET http://localhost:5000/api/health
Expected: {"status":"ok"}
```

#### Activities List
```
GET http://localhost:5000/api/activities?userEmail=your@email.com&limit=10
Expected: JSON with activities array
```

#### Insights
```
GET http://localhost:5000/api/insights?userEmail=your@email.com&period=weekly
Expected: JSON with insights array
```

#### Debug Activities Count
```
GET http://localhost:5000/api/debug/activities-count
Expected: Total activities count by email
```

---

## Step 10: Error Handling Test

### Test Cases:
1. ✅ **Invalid Email:** Sync button click karein without login → Error dikhna chahiye
2. ✅ **Expired Token:** Token expire hone pe refresh attempt
3. ✅ **No Data:** Empty dashboard pe proper message dikhna chahiye
4. ✅ **Network Error:** Backend off karke frontend test karein → Error message

---

## Common Issues & Solutions

### Issue 1: Backend not starting
```bash
# Check Python version
python --version  # Should be 3.8+

# Check dependencies
pip install -r requirements.txt

# Check Firebase credentials
# .env file mein FIREBASE_CREDENTIALS path check karein
```

### Issue 2: Frontend not starting
```bash
# Check Node version
node --version  # Should be 16+

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue 3: CORS Error
- Backend `app.py` mein CORS origins check karein
- Frontend port `5173` ho, backend `5000` ho

### Issue 4: No Data Showing
- Browser console check karein (F12)
- Backend terminal logs check karein
- Firebase mein data check karein
- Email matching check karein (case-sensitive nahi hona chahiye)

### Issue 5: Sync Not Working
- OAuth tokens check karein (Firebase `oauth_tokens` collection)
- API permissions check karein (Calendar, Drive, etc.)
- Backend logs check karein for errors

---

## Quick Test Checklist

- [ ] Backend running on port 5000
- [ ] Frontend running on port 5173
- [ ] Google login working
- [ ] Microsoft login working
- [ ] Dashboard showing data
- [ ] Date filters working
- [ ] Mail dashboard working
- [ ] Meetings dashboard working
- [ ] Storage dashboard working
- [ ] Others dashboard working
- [ ] Insights showing (with data)
- [ ] Sync buttons working
- [ ] Gmail sync working
- [ ] Outlook sync working
- [ ] Google Meet sync working
- [ ] Teams sync working
- [ ] Google Drive sync working
- [ ] OneDrive sync working
- [ ] Week/Month toggles working
- [ ] Week navigation working
- [ ] Charts rendering properly
- [ ] No console errors

---

## Performance Test

1. ✅ **Load Time:** Dashboard load hone mein < 2 seconds
2. ✅ **Sync Time:** 100 items sync hone mein < 30 seconds
3. ✅ **Chart Rendering:** Charts instantly render hone chahiye
4. ✅ **Filter Speed:** Date filters instantly apply hone chahiye

---

## Browser Console Check

### Frontend Console (F12)
```javascript
// Check activities loaded
console.log('[DataContext] Activities:', activities.length);

// Check API calls
// Network tab mein /api/activities calls check karein
```

### Backend Terminal
```
# Check for errors
[Activities API] Received activity log request
[Gmail Sync] Processing message...
[Insights API] Generating insights...
```

---

## Final Verification

1. ✅ **All Dashboards:** Sab dashboards properly load ho rahe hain
2. ✅ **All Syncs:** Sab sync buttons kaam kar rahe hain
3. ✅ **All Filters:** Date filters properly kaam kar rahe hain
4. ✅ **All Charts:** Charts properly render ho rahe hain
5. ✅ **Insights:** Insights properly generate ho rahe hain
6. ✅ **No Errors:** Console mein koi errors nahi hain

---

## Test Data Create Karne Ke Liye

Agar test data chahiye, toh:

1. **Manual Activity Log:**
```bash
POST http://localhost:5000/api/activities/log
Content-Type: application/json

{
  "activityType": "email",
  "provider": "gmail",
  "timestamp": "2024-01-15T10:00:00Z",
  "subject": "Test Email",
  "recipients": ["test@example.com"],
  "attachmentCount": 0,
  "user_email": "your@email.com"
}
```

2. **Sync se:** Sync buttons se real data fetch karein

---

## Support

Agar koi issue aaye:
1. Browser console check karein (F12)
2. Backend terminal logs check karein
3. Network tab mein API calls check karein
4. Firebase console mein data check karein

**Happy Testing! 🚀**


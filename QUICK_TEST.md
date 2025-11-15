# ⚡ Quick Testing Steps (Hindi)

## 🚀 Step-by-Step Testing

### 1️⃣ Backend Start Karein
```powershell
# Terminal 1 mein
cd backend
python app.py
```
✅ **Check:** `http://localhost:5000/api/health` pe `{"status":"ok"}` dikhna chahiye

---

### 2️⃣ Frontend Start Karein
```powershell
# Terminal 2 mein
cd frontend
npm run dev
```
✅ **Check:** `http://localhost:5173` pe Login page dikhna chahiye

---

### 3️⃣ Login Test
1. **Google Login** click karein → Login karein → Dashboard pe redirect
2. **Microsoft Login** click karein → Login karein → Dashboard pe redirect

✅ **Check:** Top right mein email dikhna chahiye

---

### 4️⃣ Dashboard Test
1. ✅ **All Activities** - Sab data dikhna chahiye
2. ✅ **Date Filters:**
   - "All time" button click → Sab data
   - "Last 7 days" → Sirf last week
   - "Last 30 days" → Last month
3. ✅ **Charts** - Line chart aur Pie chart dikhne chahiye
4. ✅ **Activity Table** - Recent activities list
5. ✅ **Insights Panel** - Insights dikhne chahiye (agar data hai)

---

### 5️⃣ Sync Test (IMPORTANT!)
Dashboard pe **"Sync Historical Data"** section dikhna chahiye

#### Google Login ke baad:
1. **"Gmail"** sync button click → Wait karein → "X new items processed" dikhna chahiye
2. **"Google Meet"** sync button click → Meetings sync hone chahiye
3. **"Google Drive"** sync button click → Files sync hone chahiye

#### Microsoft Login ke baad:
1. **"Outlook"** sync button click → Emails sync hone chahiye
2. **"Teams"** sync button click → Meetings sync hone chahiye
3. **"OneDrive"** sync button click → Files sync hone chahiye

✅ **Check:** Sync ke baad dashboard refresh karein → New data dikhna chahiye

---

### 6️⃣ Individual Dashboards Test

#### Mail Dashboard (`/mail`)
1. Navbar se "Mail" click karein
2. ✅ **Default:** Current week ka data
3. ✅ **Week/Month Toggle** - Switch karein
4. ✅ **Week Navigation:**
   - "← Previous" → Previous week
   - "Current week" → Current week
   - "Next →" → Next week
   - "Select week" → Koi bhi week select karein
5. ✅ **Monthly View** - Month picker se month select karein
6. ✅ **Charts** - Email cadence chart dikhna chahiye

#### Meetings Dashboard (`/meetings`)
1. Navbar se "Meetings" click karein
2. ✅ Same as Mail dashboard (Week/Month toggle, navigation)
3. ✅ **Charts** - Meeting minutes chart dikhna chahiye

#### Storage Dashboard (`/storage`)
1. Navbar se "Storage" click karein
2. ✅ Same features (Week/Month toggle, navigation)
3. ✅ **Activity Table** - File uploads list

#### Others Dashboard (`/others`) - NEW!
1. Navbar se "Others" click karein
2. ✅ Same features (Week/Month toggle, navigation)
3. ✅ **Charts** - Activity breakdown chart

---

### 7️⃣ Insights Test
1. Dashboard pe **"Insights"** panel check karein
2. ✅ **Color Fix:** Text visible hona chahiye (white text issue fixed)
3. ✅ **Agar data hai:**
   - Email insights (high volume, large attachments)
   - Meeting insights (long meetings)
   - Storage insights (unused storage)

---

## 🔍 Quick Checks

### Browser Console (F12)
```javascript
// Check karein koi errors nahi hain
// Network tab mein API calls check karein
```

### Backend Terminal
```
# Check karein logs properly aa rahe hain
[Activities API] Received activity log request
[Gmail Sync] Processing message...
```

---

## ❌ Common Issues

### Backend nahi start ho raha?
```powershell
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend nahi start ho raha?
```powershell
cd frontend
npm install
npm run dev
```

### Data nahi dikh raha?
1. Browser console check karein (F12)
2. Backend terminal logs check karein
3. Sync buttons click karein to fetch data

### Sync nahi ho raha?
1. OAuth login properly hua hai check karein
2. Permissions allow kiye hain check karein
3. Backend logs check karein for errors

---

## ✅ Final Checklist

- [ ] Backend running (port 5000)
- [ ] Frontend running (port 5173)
- [ ] Login working (Google/Microsoft)
- [ ] Dashboard showing data
- [ ] Date filters working
- [ ] All dashboards working (Mail, Meetings, Storage, Others)
- [ ] Week/Month toggles working
- [ ] Week navigation working
- [ ] Sync buttons working
- [ ] Insights showing
- [ ] No console errors

---

## 🎯 Test Priority

1. **High Priority:**
   - Login (Google/Microsoft)
   - Dashboard data display
   - Sync buttons (Gmail, Outlook, Meet, Teams, Drive, OneDrive)
   - Date filters

2. **Medium Priority:**
   - Individual dashboards
   - Week/Month toggles
   - Charts rendering

3. **Low Priority:**
   - Insights generation
   - Extension tracking

---

**Sab test karne ke baad batao kya kaam kar raha hai aur kya nahi! 🚀**


# 🔧 Backend Start Karne Ke Liye

## Error Fix: ECONNRESET

Yeh error tab aata hai jab:
- Backend running nahi hai
- Backend port 5000 pe nahi hai
- Connection reset ho raha hai

## Solution:

### Step 1: Backend Start Karein

```powershell
# Terminal 1 mein
cd backend
python app.py
```

**Expected Output:**
```
[OK] Flask app initialized
[OK] Firebase initialized successfully
 * Running on http://127.0.0.1:5000
```

### Step 2: Check Karein Backend Running Hai

Browser mein open karein:
```
http://localhost:5000/api/health
```

Agar `{"status":"ok"}` dikhe → Backend running hai ✅

### Step 3: Frontend Start Karein (NEW Terminal)

```powershell
# Terminal 2 mein
cd frontend
npm run dev
```

### Step 4: Test Karein

Frontend se API calls ab properly kaam karengi!

---

## Common Issues:

### Issue 1: Port Already in Use
```powershell
# Check karein koi process port 5000 use kar raha hai
netstat -ano | findstr :5000

# Agar hai, toh kill karein ya different port use karein
```

### Issue 2: Firebase Not Connected
- `.env` file check karein
- Firebase credentials path check karein

### Issue 3: Python Dependencies Missing
```powershell
cd backend
pip install -r requirements.txt
```

---

**Backend start karne ke baad error fix ho jayega! 🚀**


# CarbonLens - Digital Carbon Footprint Tracker

A comprehensive platform for tracking and visualizing digital carbon emissions from email, meetings, cloud storage, and web browsing activities.

## 🌟 Features

- **Real-time Activity Tracking**: Chrome extension monitors Gmail and Outlook email activities
- **OAuth Integration**: Secure authentication with Google and Microsoft accounts
- **Emission Calculations**: Accurate CO₂ emission calculations based on activity types
- **Dashboard & Analytics**: Beautiful React-based dashboard with charts and insights
- **AI-Powered Insights**: Rule-based recommendations to reduce digital carbon footprint
- **Multi-Provider Support**: Gmail, Outlook, Google Meet, Microsoft Teams, Google Drive, OneDrive

## 📁 Project Structure

```
CarbonLens/
├── backend/              # Flask API server
│   ├── app.py           # Main Flask application
│   ├── routes/          # API route handlers
│   │   ├── activities.py
│   │   ├── oauth_google.py
│   │   └── oauth_outlook.py
│   ├── utils/           # Utility modules
│   │   ├── emissions.py
│   │   ├── activity_validator.py
│   │   ├── firebase_config.py
│   │   └── insights.py
│   └── requirements.txt
├── frontend/            # React + Vite application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API service layer
│   │   └── context/     # React context providers
│   └── package.json
└── extension/           # Chrome extension
    ├── manifest.json
    ├── background.js
    ├── content.js
    └── popup.js
```

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- Node.js 16+
- Firebase project with Firestore enabled
- Google OAuth credentials
- Microsoft OAuth credentials (optional)

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Mac/Linux
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   - Copy `.env.example` to `.env` in the backend directory
   - Fill in your OAuth credentials and configuration

5. **Add Firebase service account key:**
   - Download your Firebase service account key JSON file
   - Place it as `serviceAccountKey.json` in the `backend/` directory

6. **Run the backend server:**
   ```bash
   python app.py
   ```
   The server will start on `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   The frontend will start on `http://localhost:5173`

### Chrome Extension Setup

1. **Open Chrome Extensions:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"

2. **Load the extension:**
   - Click "Load unpacked"
   - Select the `extension/` directory

3. **Configure backend URL:**
   - Click the extension icon
   - Enter your backend URL (default: `http://127.0.0.1:5000`)
   - Click "Save Backend URL"

## 🔧 Configuration

### OAuth Setup

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:5000/auth/google/callback`
6. Copy Client ID and Client Secret to `.env`

#### Microsoft OAuth
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add redirect URI: `http://localhost:5000/auth/outlook/callback`
4. Add API permissions: `User.Read`, `Mail.Read`, `Mail.Send`
5. Copy Application (client) ID and secret to `.env`

### Firebase Setup
1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Download service account key
4. Place it as `backend/serviceAccountKey.json`

## 📊 API Endpoints

### Health Check
- `GET /api/health` - Check server status

### Activities
- `POST /api/activities/log` - Log a new activity
- `GET /api/activities` - List activities (with filters)

### Authentication
- `GET /auth/google/login` - Initiate Google OAuth
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/outlook/login` - Initiate Microsoft OAuth
- `GET /auth/outlook/callback` - Microsoft OAuth callback

## 🧪 Testing

### Test Backend Health
```bash
curl http://localhost:5000/api/health
```

### Test Activity Logging
```bash
curl -X POST http://localhost:5000/api/activities/log \
  -H "Content-Type: application/json" \
  -d '{
    "activityType": "email",
    "provider": "gmail",
    "subject": "Test Email",
    "recipients": ["test@example.com"],
    "attachmentCount": 0
  }'
```

## 🐛 Troubleshooting

### Backend Issues
- **Firebase not initialized**: Check that `serviceAccountKey.json` exists and is valid
- **OAuth errors**: Verify credentials in `.env` file
- **CORS errors**: Check CORS origins in `app.py`

### Frontend Issues
- **API connection failed**: Ensure backend is running on port 5000
- **OAuth redirect fails**: Verify `FRONTEND_URL` in backend `.env` matches frontend URL

### Extension Issues
- **Activities not tracked**: Check that extension has permissions for Gmail/Outlook
- **Backend unreachable**: Verify backend URL in extension popup settings

## 📝 Development Roadmap

- [x] Phase 1: Basic activity tracking
- [x] Phase 2: OAuth integration
- [x] Phase 3: Emission calculations
- [ ] Phase 4: Email/Meeting sync via APIs
- [ ] Phase 5: Advanced analytics and insights
- [ ] Phase 6: Team/organization features

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

Built with Flask, React, Firebase, and Chrome Extension APIs.


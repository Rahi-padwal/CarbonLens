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


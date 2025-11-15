import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

import styles from './Navbar.module.css';

const links = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/mail', label: 'Mail' },
  { to: '/meetings', label: 'Meetings' },
  { to: '/storage', label: 'Storage' },
  { to: '/others', label: 'Others' },
  { to: '/reports', label: 'Reports' },
];

function Navbar({ authenticatedUser, gmailEmail, onChangeGmail, outlookEmail, onChangeOutlook, isAdmin, onToggleAdmin }) {
  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('carbonlens:auth');
      window.location.href = '/';
    }
  };

  return (
    <header className={styles.wrapper}>
      <div className={styles.topRow}>
        <div className={styles.brandBlock}>
          <span className={styles.badge}>CarbonLens</span>
          <h1 className={styles.heading}>Digital Carbon Intelligence</h1>
          <p className={styles.subtitle}>Monitor, compare, and reduce your invisible footprint.</p>
        </div>
        <div className={styles.profileCard}>
          {authenticatedUser && (
            <div className={styles.userInfo}>
              <div className={styles.userDetails}>
                <span className={styles.userName}>{authenticatedUser.name || authenticatedUser.email}</span>
                <span className={styles.userEmail}>{authenticatedUser.email}</span>
                <span className={styles.userProvider}>
                  {authenticatedUser.provider === 'google' ? 'Google' : 'Microsoft'}
                </span>
              </div>
              <button className={styles.logoutButton} onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
          {isAdmin && (
            <>
              <h2 className={styles.profileTitle}>Admin: Track other accounts</h2>
              <div className={styles.accountRow}>
                <span className={styles.accountLabel}>Gmail</span>
                <input
                  className={styles.accountInput}
                  type="email"
                  placeholder="name@gmail.com"
                  value={gmailEmail || ''}
                  onChange={(event) => onChangeGmail(event.target.value)}
                />
              </div>
              <div className={styles.accountRow}>
                <span className={styles.accountLabel}>Outlook</span>
                <input
                  className={styles.accountInput}
                  type="email"
                  placeholder="name@outlook.com"
                  value={outlookEmail || ''}
                  onChange={(event) => onChangeOutlook(event.target.value)}
                />
              </div>
              <p className={styles.profileHint}>Admin mode: Search by email address</p>
            </>
          )}
          {!isAdmin && authenticatedUser && (
            <button className={styles.adminToggle} onClick={onToggleAdmin}>
              Admin Mode
            </button>
          )}
        </div>
      </div>

      <nav className={styles.navStrip}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => clsx(styles.navItem, isActive && styles.active)}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

export default Navbar;

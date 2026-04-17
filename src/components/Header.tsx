import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { omClient } from '../lib/openmetadata-client';

export default function Header() {
  const isLive = omClient.isLive();

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to="/" className="header-logo">
          <span className="logo-icon"><Shield size={18} /></span>
          <span>Incident Commander</span>
        </Link>

        <nav className="header-nav">
          <span className={`header-badge ${isLive ? 'live' : 'mock'}`}>
            <span className="dot" />
            {isLive ? 'Live' : 'Mock Mode'}
          </span>
        </nav>
      </div>
    </header>
  );
}

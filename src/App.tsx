import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import IncidentListPage from './pages/IncidentListPage';
import WarRoomPage from './pages/WarRoomPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Header />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<IncidentListPage />} />
            <Route path="/incident/:id" element={<WarRoomPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

import { useState } from 'react';
import { logout } from './api/auth.js';
import LoginForm from './components/LoginForm.jsx';
import SessionView from './components/SessionView.jsx';

export default function App() {
  // Solo se guarda el email del usuario en memoria; nunca la contraseña.
  const [user, setUser] = useState(null);

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  return (
    <main className="layout">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Inicio de Tarjetas de empresa">
          <span className="wordmark-icon" aria-hidden="true">TE</span>
          <span>Tarjetas de empresa</span>
        </a>
        <span className="environment">
          <span className="environment-dot"></span>Desarrollo
        </span>
      </header>

      {user ? (
        <SessionView email={user.email} onLogout={handleLogout} />
      ) : (
        <LoginForm onSuccess={setUser} />
      )}

      <footer className="footer">
        <span>Acceso exclusivo para empleados</span>
      </footer>
    </main>
  );
}

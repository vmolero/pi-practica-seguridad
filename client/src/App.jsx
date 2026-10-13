import { useCallback, useState } from 'react';
import { logout } from './api/auth.js';
import LoginForm from './components/LoginForm.jsx';
import SessionView from './components/SessionView.jsx';

export default function App() {
  // El usuario solo se guarda en memoria, nunca la contraseña. El token de
  // sesión vive aparte, en api/session.js.
  const [user, setUser] = useState(null);
  // Aviso para la pantalla de login, p. ej. cuando la sesión ha caducado.
  const [notice, setNotice] = useState('');

  function handleLogin(loggedUser) {
    setNotice('');
    setUser(loggedUser);
  }

  async function handleLogout() {
    await logout();
    setNotice('');
    setUser(null);
  }

  // Estable entre renders: SessionView lo usa como dependencia de su efecto.
  const handleSessionExpired = useCallback((message) => {
    setNotice(message);
    setUser(null);
  }, []);

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
        <SessionView
          user={user}
          onLogout={handleLogout}
          onSessionExpired={handleSessionExpired}
        />
      ) : (
        <LoginForm onSuccess={handleLogin} notice={notice} />
      )}

      <footer className="footer">
        <span>Acceso exclusivo para empleados</span>
      </footer>
    </main>
  );
}

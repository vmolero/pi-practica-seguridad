import { useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../api/auth.js';
import { SessionExpiredError } from '../api/http.js';
import UserAdminPanel from './UserAdminPanel.jsx';

const LOAD_ERROR = 'No se han podido cargar tus datos. Inténtalo de nuevo más tarde.';

export default function SessionView({ user, onLogout, onSessionExpired }) {
  const headingRef = useRef(null);
  // Datos devueltos por GET /api/private/me; mientras tanto, los del login.
  const [currentUser, setCurrentUser] = useState(user);
  const [loadError, setLoadError] = useState('');

  // Mueve el foco al nuevo contenido para que los lectores de pantalla lo anuncien.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Consulta la sección privada al mostrarse y cada vez que la ventana
  // recupera el foco, para detectar un token caducado.
  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const me = await getCurrentUser();
        if (!active) return;
        setCurrentUser(me);
        setLoadError('');
      } catch (error) {
        if (!active) return;
        if (error instanceof SessionExpiredError) {
          onSessionExpired(error.message);
        } else {
          setLoadError(LOAD_ERROR);
        }
      }
    }

    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [onSessionExpired]);

  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Sesión iniciada</p>
        <h1 id="page-title" ref={headingRef} tabIndex={-1}>
          Hola de
          <br />
          <span>nuevo.</span>
        </h1>
        <p className="description">Has iniciado sesión correctamente.</p>
      </section>

      <section className="service-panel" aria-labelledby="session-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Tu cuenta</p>
            <h2 id="session-title">Sesión activa</h2>
          </div>
          <span className="status-indicator" data-state="online" aria-hidden="true"></span>
        </div>
        <div className="status-row">
          <span className="status-label">Nombre</span>
          <output>{currentUser.name}</output>
        </div>
        <div className="status-row">
          <span className="status-label">Usuario</span>
          <output>{currentUser.email}</output>
        </div>
        <div className="form-alert" role="alert" aria-live="assertive">
          {loadError}
        </div>
        <button type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </section>

      {currentUser.isAdmin && (
        <UserAdminPanel currentEmail={currentUser.email} onSessionExpired={onSessionExpired} />
      )}
    </>
  );
}

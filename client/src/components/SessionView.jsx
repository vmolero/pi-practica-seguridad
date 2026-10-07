import { useEffect, useRef } from 'react';

export default function SessionView({ email, onLogout }) {
  const headingRef = useRef(null);

  // Mueve el foco al nuevo contenido para que los lectores de pantalla lo anuncien.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
          <span className="status-label">Usuario</span>
          <output>{email}</output>
        </div>
        <button type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </section>
    </>
  );
}

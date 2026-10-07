import { useState } from 'react';
import { GENERIC_LOGIN_ERROR, login } from '../api/auth.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) {
    errors.email = 'Introduce tu email.';
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Introduce un email con un formato válido.';
  }
  if (!password) {
    errors.password = 'Introduce tu contraseña.';
  }
  return errors;
}

export default function LoginForm({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const errors = validate({ email, password });
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const user = await login({ email: email.trim(), password });
      setPassword('');
      onSuccess(user);
    } catch {
      // Se muestra siempre el mismo mensaje, sea cual sea el motivo del fallo.
      setFormError(GENERIC_LOGIN_ERROR);
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Acceso de empleados</p>
        <h1 id="page-title">
          Tus tarjetas,
          <br />
          <span>a salvo.</span>
        </h1>
        <p className="description">
          Inicia sesión con tu email de empresa para gestionar tus tarjetas.
        </p>
      </section>

      <section className="service-panel" aria-labelledby="login-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Identificación</p>
            <h2 id="login-title">Iniciar sesión</h2>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="field-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className="field-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="form-alert" role="alert" aria-live="assertive">
            {formError}
          </div>

          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
      </section>
    </>
  );
}

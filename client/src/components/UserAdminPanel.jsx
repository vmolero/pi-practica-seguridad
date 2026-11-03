import { useEffect, useState } from 'react';
import {
  ForbiddenError,
  createUser,
  deleteUser,
  listUsers,
  renameUser,
} from '../api/admin-users.js';
import { SessionExpiredError } from '../api/http.js';
import { derivarClaves, generarClavesUsuario, toBase64 } from '../security/claves-usuario.js';

const EMPTY_FORM = { name: '', email: '', password: '', passwordRepeat: '', isAdmin: false };
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_LENGTH_ERROR = `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres`;
export const PASSWORD_MISMATCH = 'Las contraseñas no coinciden';

/**
 * Panel de administración de usuarios. Solo se monta para administradores;
 * aun así, el servidor comprueba el rol en cada petición.
 * `currentEmail` identifica la fila propia, que no ofrece el botón de eliminar.
 */
export default function UserAdminPanel({ currentEmail, onSessionExpired }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  // Fila en edición del nombre y fila pendiente de confirmar el borrado.
  const [editing, setEditing] = useState(null); // { id, name }
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Trata el fallo de cualquier operación: sesión caducada → vuelta al login;
  // permiso perdido → se ocultan las acciones; resto → mensaje en la alerta.
  function handleError(error) {
    if (error instanceof SessionExpiredError) {
      onSessionExpired(error.message);
      return;
    }
    if (error instanceof ForbiddenError) {
      setForbidden(true);
      setEditing(null);
      setConfirmingId(null);
    }
    setAlert(error.message);
  }

  useEffect(() => {
    let active = true;
    listUsers()
      .then((loaded) => {
        if (active) setUsers(loaded);
      })
      .catch((error) => {
        if (active) handleError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // handleError solo usa setters y onSessionExpired, que es estable.
  }, [onSessionExpired]);

  function updateField(event) {
    const { name, type, value, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (creating) return;
    setAlert('');
    // La longitud y la repetición solo se comprueban aquí: la contraseña no
    // viaja al servidor, así que no se genera nada ni se envía si fallan.
    if (form.password.length < MIN_PASSWORD_LENGTH || form.password.length > MAX_PASSWORD_LENGTH) {
      setAlert(PASSWORD_LENGTH_ERROR);
      return;
    }
    if (form.password !== form.passwordRepeat) {
      setAlert(PASSWORD_MISMATCH);
      return;
    }
    setCreating(true);
    try {
      const { name, email, password, isAdmin } = form;
      // K_L viaja al servidor; K_D no sale del navegador. Par RSA del usuario
      // y clave privada cifrada con K_D.
      const { K_L, K_D } = await derivarClaves(password);
      K_D.fill(0);
      const loginKey = toBase64(K_L);
      K_L.fill(0);
      const claves = await generarClavesUsuario(password);
      const created = await createUser({ name, email, loginKey, isAdmin, ...claves });
      setUsers((current) => [...current, created]);
      setForm(EMPTY_FORM);
    } catch (error) {
      // Se conservan los datos salvo las contraseñas.
      handleError(error);
    } finally {
      // Las contraseñas se vacían siempre tras enviar.
      setForm((current) => ({ ...current, password: '', passwordRepeat: '' }));
      setCreating(false);
    }
  }

  async function handleRename(event) {
    event.preventDefault();
    if (!editing || busyId) return;
    setAlert('');
    setBusyId(editing.id);
    try {
      const updated = await renameUser(editing.id, editing.name);
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setEditing(null);
    } catch (error) {
      handleError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (busyId) return;
    setAlert('');
    setBusyId(id);
    try {
      await deleteUser(id);
      setUsers((current) => current.filter((user) => user.id !== id));
      setConfirmingId(null);
    } catch (error) {
      handleError(error);
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(user) {
    setAlert('');
    setConfirmingId(null);
    setEditing({ id: user.id, name: user.name });
  }

  function startConfirming(id) {
    setAlert('');
    setEditing(null);
    setConfirmingId(id);
  }

  return (
    <section className="service-panel admin-panel" aria-labelledby="admin-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Administración</p>
          <h2 id="admin-title">Usuarios</h2>
        </div>
      </div>

      <div className="form-alert" role="alert" aria-live="assertive">
        {alert}
      </div>

      {loading ? (
        <p className="admin-empty">Cargando usuarios…</p>
      ) : (
        <table className="user-table">
          <caption className="visually-hidden">Usuarios de la aplicación</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Email</th>
              <th scope="col">Rol</th>
              {!forbidden && <th scope="col"><span className="visually-hidden">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.email === currentEmail;
              const isEditing = editing?.id === user.id;
              const isConfirming = confirmingId === user.id;
              const busy = busyId === user.id;

              return (
                <tr key={user.id}>
                  <td data-label="Nombre">
                    {isEditing ? (
                      <form className="inline-form" id={`rename-${user.id}`} onSubmit={handleRename}>
                        <label className="visually-hidden" htmlFor={`rename-input-${user.id}`}>
                          Nuevo nombre de {user.email}
                        </label>
                        <input
                          id={`rename-input-${user.id}`}
                          value={editing.name}
                          maxLength={100}
                          required
                          autoFocus
                          disabled={busy}
                          onChange={(event) => setEditing({ id: user.id, name: event.target.value })}
                        />
                      </form>
                    ) : (
                      <span>
                        {user.name}
                        {isSelf && <span className="self-tag"> (tú)</span>}
                      </span>
                    )}
                  </td>
                  <td data-label="Email">{user.email}</td>
                  <td data-label="Rol">{user.isAdmin ? 'Administrador' : 'Empleado'}</td>
                  {!forbidden && (
                    <td className="row-actions">
                      {isEditing && (
                        <>
                          <button type="submit" form={`rename-${user.id}`} disabled={busy}>Guardar</button>
                          <button type="button" className="secondary" onClick={() => setEditing(null)} disabled={busy}>
                            Cancelar
                          </button>
                        </>
                      )}
                      {isConfirming && (
                        <>
                          <span className="confirm-text">¿Eliminar a {user.name}?</span>
                          <button type="button" className="danger" onClick={() => handleDelete(user.id)} disabled={busy}>
                            Confirmar
                          </button>
                          <button type="button" className="secondary" onClick={() => setConfirmingId(null)} disabled={busy}>
                            Cancelar
                          </button>
                        </>
                      )}
                      {!isEditing && !isConfirming && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => startEditing(user)}
                            aria-label={`Editar el nombre de ${user.name}`}
                          >
                            Editar
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => startConfirming(user.id)}
                              aria-label={`Eliminar a ${user.name}`}
                            >
                              Eliminar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!forbidden && !loading && (
        <form className="login-form admin-form" onSubmit={handleCreate}>
          <h3>Dar de alta un usuario</h3>
          <div className="field">
            <label htmlFor="new-user-name">Nombre</label>
            <input id="new-user-name" name="name" value={form.name} onChange={updateField}
              maxLength={100} required disabled={creating} />
          </div>
          <div className="field">
            <label htmlFor="new-user-email">Email</label>
            <input id="new-user-email" name="email" type="email" value={form.email} onChange={updateField}
              maxLength={254} autoComplete="off" required disabled={creating} />
          </div>
          <div className="field">
            <label htmlFor="new-user-password">Contraseña inicial</label>
            <input id="new-user-password" name="password" type="password" value={form.password}
              onChange={updateField} maxLength={128} autoComplete="new-password"
              required disabled={creating} />
          </div>
          <div className="field">
            <label htmlFor="new-user-password-repeat">Repite la contraseña</label>
            <input id="new-user-password-repeat" name="passwordRepeat" type="password" value={form.passwordRepeat}
              onChange={updateField} maxLength={128} autoComplete="new-password"
              required disabled={creating} />
          </div>
          <label className="checkbox-field">
            <input type="checkbox" name="isAdmin" checked={form.isAdmin} onChange={updateField} disabled={creating} />
            Administrador
          </label>
          <button type="submit" disabled={creating}>
            {creating ? 'Generando claves…' : 'Dar de alta'}
          </button>
        </form>
      )}
    </section>
  );
}

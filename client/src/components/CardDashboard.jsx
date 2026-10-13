import { useEffect, useState } from 'react';
import { CardNotFoundError, createCard, deleteCard, listCards, updateCard } from '../api/cards.js';
import { SessionExpiredError } from '../api/http.js';
import { formatExpiry, validateCardForm } from '../validation/card.js';

const EMPTY_FORM = { number: '', expiryMonth: '', expiryYear: '', cvv: '' };

// Los datos de las tarjetas solo viven en el estado de React: nunca se
// escriben en la consola ni en el almacenamiento del navegador.

/**
 * Campos de una tarjeta, compartidos por el formulario de alta y el de
 * edición. En la edición, un campo vacío significa "no cambiar".
 */
function CardFields({ idPrefix, values, errors, onChange, disabled, editing = false }) {
  const describedBy = (field) => (errors[field] ? `${idPrefix}-${field}-error` : undefined);
  const fieldError = (field) => errors[field] && (
    <p className="field-error" id={`${idPrefix}-${field}-error`}>{errors[field]}</p>
  );

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-number`}>
          Número de tarjeta{editing && <span className="field-hint"> (déjalo vacío para no cambiarlo)</span>}
        </label>
        <input
          id={`${idPrefix}-number`}
          name="number"
          value={values.number}
          onChange={onChange}
          inputMode="numeric"
          autoComplete="cc-number"
          maxLength={32}
          placeholder="1234 5678 9012 3456"
          aria-invalid={Boolean(errors.number)}
          aria-describedby={describedBy('number')}
          disabled={disabled}
        />
        {fieldError('number')}
      </div>

      <fieldset className="field expiry-field">
        <legend>Caducidad</legend>
        <div className="expiry-inputs">
          <label className="visually-hidden" htmlFor={`${idPrefix}-month`}>Mes de caducidad</label>
          <input
            id={`${idPrefix}-month`}
            name="expiryMonth"
            value={values.expiryMonth}
            onChange={onChange}
            inputMode="numeric"
            autoComplete="cc-exp-month"
            maxLength={2}
            placeholder="MM"
            aria-invalid={Boolean(errors.expiry)}
            aria-describedby={describedBy('expiry')}
            disabled={disabled}
          />
          <span aria-hidden="true">/</span>
          <label className="visually-hidden" htmlFor={`${idPrefix}-year`}>Año de caducidad</label>
          <input
            id={`${idPrefix}-year`}
            name="expiryYear"
            value={values.expiryYear}
            onChange={onChange}
            inputMode="numeric"
            autoComplete="cc-exp-year"
            maxLength={4}
            placeholder="AAAA"
            aria-invalid={Boolean(errors.expiry)}
            aria-describedby={describedBy('expiry')}
            disabled={disabled}
          />
        </div>
        {fieldError('expiry')}
      </fieldset>

      <div className="field cvv-field">
        <label htmlFor={`${idPrefix}-cvv`}>
          CVV{editing && <span className="field-hint"> (déjalo vacío para no cambiarlo)</span>}
        </label>
        <input
          id={`${idPrefix}-cvv`}
          name="cvv"
          type="password"
          value={values.cvv}
          onChange={onChange}
          inputMode="numeric"
          autoComplete="cc-csc"
          maxLength={4}
          aria-invalid={Boolean(errors.cvv)}
          aria-describedby={describedBy('cvv')}
          disabled={disabled}
        />
        {fieldError('cvv')}
      </div>

      {errors.form && <p className="field-error">{errors.form}</p>}
    </>
  );
}

/**
 * Dashboard de tarjetas del propio usuario: lista enmascarada, alta,
 * modificación y borrado. Lo ven todos los usuarios; el servidor solo
 * devuelve y deja cambiar las tarjetas propias.
 */
export default function CardDashboard({ onSessionExpired }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);
  // Tarjeta en edición (una a la vez) y tarjeta pendiente de confirmar el borrado.
  const [editing, setEditing] = useState(null); // { id, values, errors }
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Trata el fallo de cualquier operación: sesión caducada → vuelta al login;
  // tarjeta inexistente → se quita de la lista; resto → mensaje en la alerta.
  function handleError(error, cardId) {
    if (error instanceof SessionExpiredError) {
      onSessionExpired(error.message);
      return;
    }
    if (error instanceof CardNotFoundError && cardId) {
      setCards((current) => current.filter((card) => card.id !== cardId));
      setEditing(null);
      setConfirmingId(null);
    }
    setAlert(error.message);
  }

  useEffect(() => {
    let active = true;
    listCards()
      .then((loaded) => {
        if (active) setCards(loaded);
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
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (creating) return;
    setAlert('');
    const { errors, data } = validateCardForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreating(true);
    try {
      const created = await createCard(data);
      setCards((current) => [...current, created]);
      setForm(EMPTY_FORM);
    } catch (error) {
      // Se conservan el número y la caducidad; el CVV se borra siempre.
      setForm((current) => ({ ...current, cvv: '' }));
      handleError(error);
    } finally {
      setCreating(false);
    }
  }

  function startEditing(card) {
    setAlert('');
    setConfirmingId(null);
    setEditing({
      id: card.id,
      values: { number: '', expiryMonth: String(card.expiryMonth), expiryYear: String(card.expiryYear), cvv: '' },
      errors: {},
    });
  }

  function updateEditingField(event) {
    const { name, value } = event.target;
    setEditing((current) => ({ ...current, values: { ...current.values, [name]: value } }));
  }

  async function handleUpdate(event, card) {
    event.preventDefault();
    if (!editing || busyId) return;
    setAlert('');

    // La caducidad viene rellenada: si no ha cambiado, no se envía.
    const values = { ...editing.values };
    if (Number(values.expiryMonth) === card.expiryMonth && Number(values.expiryYear) === card.expiryYear) {
      values.expiryMonth = '';
      values.expiryYear = '';
    }
    const { errors, data } = validateCardForm(values, new Date(), { partial: true });
    if (Object.keys(errors).length > 0) {
      setEditing((current) => ({ ...current, errors }));
      return;
    }

    setBusyId(card.id);
    try {
      const updated = await updateCard(card.id, data);
      setCards((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      setEditing(null);
    } catch (error) {
      setEditing((current) => current && { ...current, values: { ...current.values, cvv: '' }, errors: {} });
      handleError(error, card.id);
    } finally {
      setBusyId(null);
    }
  }

  function startConfirming(id) {
    setAlert('');
    setEditing(null);
    setConfirmingId(id);
  }

  async function handleDelete(id) {
    if (busyId) return;
    setAlert('');
    setBusyId(id);
    try {
      await deleteCard(id);
      setCards((current) => current.filter((card) => card.id !== id));
      setConfirmingId(null);
    } catch (error) {
      handleError(error, id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="service-panel card-panel" aria-labelledby="cards-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tu cartera</p>
          <h2 id="cards-title">Mis tarjetas</h2>
        </div>
      </div>

      <div className="form-alert" role="alert" aria-live="assertive">
        {alert}
      </div>

      {loading && <p className="admin-empty">Cargando tarjetas…</p>}
      {!loading && cards.length === 0 && (
        <p className="admin-empty">Todavía no has guardado ninguna tarjeta.</p>
      )}
      {!loading && cards.length > 0 && (
        <ul className="card-list" aria-label="Tus tarjetas">
          {cards.map((card) => {
            const isEditing = editing?.id === card.id;
            const isConfirming = confirmingId === card.id;
            const busy = busyId === card.id;
            const expiry = formatExpiry(card.expiryMonth, card.expiryYear);

            return (
              <li key={card.id} className="card-row">
                <div className="card-summary">
                  <span className="card-number" aria-label={`Tarjeta terminada en ${card.last4}`}>
                    •••• {card.last4}
                  </span>
                  <span className="card-expiry">Caduca {expiry}</span>
                </div>

                {isEditing ? (
                  <form className="card-edit-form" onSubmit={(event) => handleUpdate(event, card)} noValidate>
                    <CardFields
                      idPrefix={`edit-${card.id}`}
                      values={editing.values}
                      errors={editing.errors}
                      onChange={updateEditingField}
                      disabled={busy}
                      editing
                    />
                    <div className="row-actions">
                      <button type="submit" disabled={busy}>Guardar</button>
                      <button type="button" className="secondary" onClick={() => setEditing(null)} disabled={busy}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="row-actions">
                    {isConfirming ? (
                      <>
                        <span className="confirm-text">¿Eliminar la tarjeta •••• {card.last4}?</span>
                        <button type="button" className="danger" onClick={() => handleDelete(card.id)} disabled={busy}>
                          Confirmar
                        </button>
                        <button type="button" className="secondary" onClick={() => setConfirmingId(null)} disabled={busy}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startEditing(card)}
                          aria-label={`Editar la tarjeta terminada en ${card.last4}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => startConfirming(card.id)}
                          aria-label={`Eliminar la tarjeta terminada en ${card.last4}`}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && (
        <form className="login-form admin-form" onSubmit={handleCreate} noValidate>
          <h3>Añadir una tarjeta</h3>
          <CardFields
            idPrefix="new-card"
            values={form}
            errors={formErrors}
            onChange={updateField}
            disabled={creating}
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Guardando…' : 'Guardar tarjeta'}
          </button>
        </form>
      )}
    </section>
  );
}

// Sesión del navegador, solo en memoria: nunca se guarda en localStorage,
// sessionStorage ni cookies. Al recargar la página se pierde.
//
//   token  JWT de sesión que emite el servidor.
//   K_D    Clave de datos (16 bytes) derivada de la contraseña en el login.
//          Nunca sale del navegador; servirá para abrir la clave privada.
let token = null;
let dataKey = null;

export function setToken(value) {
  token = value;
}

export function getToken() {
  return token;
}

export function clearToken() {
  token = null;
}

export function setDataKey(value) {
  dataKey = value;
}

export function getDataKey() {
  return dataKey;
}

/** Descarta el token y borra K_D de la memoria. */
export function clearSession() {
  token = null;
  if (dataKey) dataKey.fill(0);
  dataKey = null;
}

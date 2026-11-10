// Sesión del navegador, solo en memoria: nunca se guarda en localStorage,
// sessionStorage ni cookies. Al recargar la página se pierde.
//
//   token  JWT de sesión que emite el servidor.
//   K_D    Clave de datos (16 bytes) derivada de la contraseña en el login.
//          Nunca sale del navegador; solo vive hasta que se abre k_U.
//   claves { publicKey: K_U, privateKey: k_U } como CryptoKey no exportables,
//          abiertas en el login y usadas mientras dura la sesión.
let token = null;
let dataKey = null;
let userKeys = null;

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

export function setUserKeys(value) {
  userKeys = value;
}

export function getUserKeys() {
  return userKeys;
}

/** Descarta el token, borra K_D de la memoria y suelta las claves del usuario. */
export function clearSession() {
  token = null;
  if (dataKey) dataKey.fill(0);
  dataKey = null;
  userKeys = null;
}

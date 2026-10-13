// Token de sesión, solo en memoria: nunca se guarda en localStorage,
// sessionStorage ni cookies. Al recargar la página se pierde.
let token = null;

export function setToken(value) {
  token = value;
}

export function getToken() {
  return token;
}

export function clearToken() {
  token = null;
}

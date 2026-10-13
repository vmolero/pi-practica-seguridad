# Servicio de tokens de sesión

Este directorio es la **capa de seguridad** del token de sesión: la firma y la
verificación criptográfica del JWT. Según el reparto del proyecto, la
implementación definitiva es del **equipo**. Mientras tanto, `token-service.js`
contiene una implementación **provisional** de Claude (HMAC-SHA256 con un
secreto del entorno, mediante la librería `jose`).

## Contrato

```js
createTokenService({ secret, ttlSeconds, issuer, now }) → { sign, verify }
```

- `ttlSeconds`: tiempo de vida del token en segundos.
- `issuer`: valor del claim `iss` (`"tarjetas-de-empresa"`).
- `now`: función que devuelve el instante actual en milisegundos; por defecto
  `Date.now`. Solo los tests la cambian.
- `secret`: material de claves de la implementación provisional. La
  implementación del equipo puede sustituirlo por sus propias claves (por
  ejemplo, `privateKey` y `publicKey`).

`sign(claims) → Promise<string>`

- Recibe los claims propios de la sesión: `{ sub, email, name, isAdmin }`
  (ver `src/domain/session.js`).
- Añade `iss`, `iat` (segundos UNIX según `now`) y `exp = iat + ttlSeconds`.
- Devuelve un JWT compacto: `base64url(cabecera).base64url(claims).base64url(firma)`.

`verify(token) → Promise<claims>`

- Devuelve todos los claims si el token es válido.
- Lanza `InvalidTokenError` (de `src/application/errors.js`) ante cualquier
  fallo: formato ilegible, algoritmo no admitido (incluido `none`), firma
  incorrecta, `iss` distinto o token caducado (`exp <= now`, sin tolerancia).
- El algoritmo admitido es fijo en la implementación: nunca se usa el `alg`
  que declare el token.

## Tests de contrato

`test/token-service.contract.js` exporta `runTokenServiceContractTests`, que
toda implementación debe superar sin modificar el archivo.
`test/token-service.test.js` la ejecuta contra la implementación provisional.
Para la del equipo basta con añadir otro archivo de test que la invoque con sus
propias fábricas.

## Reparto

| Parte | Responsable |
| --- | --- |
| Algoritmo de firma, generación y custodia de claves, `sign` y `verify` | Equipo |
| Claims, caducidad, middleware, router privado, cliente y tests | Claude |

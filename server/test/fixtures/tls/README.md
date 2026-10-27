# Certificado de pruebas

**Solo para las pruebas automáticas** (`server/test/https-server.test.js`).
No lo uses para arrancar la aplicación: sus claves privadas están en el
repositorio y, por tanto, no son secretas.

- `cert.pem` y `key.pem`: certificado autofirmado (`OU=Pruebas`) para
  `localhost`, `127.0.0.1` y `::1`, con los mismos parámetros que genera
  `npm run cert`, salvo la validez: 10 años, para que las pruebas no fallen
  cuando caduque.
- `otra-key.pem`: clave RSA que **no** corresponde a `cert.pem`, para probar
  que el servidor se niega a arrancar.

Para regenerarlos:

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout key.pem -out cert.pem \
  -subj "/CN=localhost/O=Tarjetas de empresa/OU=Pruebas" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out otra-key.pem
```

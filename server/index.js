import express from 'express';

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', message: 'Connected to the server' });
});

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
import './style.css';

const statusOutput = document.querySelector('#server-status');
const statusIndicator = document.querySelector('#status-indicator');
const checkButton = document.querySelector('#check-button');

async function checkServer() {
  statusOutput.textContent = 'Checking connection...';
  statusIndicator.dataset.state = 'pending';
  checkButton.disabled = true;

  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Server returned an error');

    const data = await response.json();
    statusOutput.textContent = data.message;
    statusIndicator.dataset.state = 'online';
  } catch {
    statusOutput.textContent = 'Server unavailable';
    statusIndicator.dataset.state = 'offline';
  } finally {
    checkButton.disabled = false;
  }
}

checkButton.addEventListener('click', checkServer);
checkServer();
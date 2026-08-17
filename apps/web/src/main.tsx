import { armBootConnection } from './boot-connect';

const root = document.getElementById('root');
if (!root) throw new Error('Waggle root element is missing');

const startup = document.createElement('main');
startup.setAttribute('role', 'status');
startup.setAttribute('aria-live', 'polite');
startup.dataset.waggleStartup = 'loading';
Object.assign(startup.style, {
  alignItems: 'center',
  color: '#f6f1e4',
  display: 'flex',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '16px',
  justifyContent: 'center',
  minHeight: '100vh',
});

const startupMessage = document.createElement('p');
startupMessage.textContent = 'Starting Waggle…';
startup.append(startupMessage);
root.replaceChildren(startup);

const showStartupFailure = (error: unknown) => {
  console.error('[waggle] UI startup failed', error);
  startup.setAttribute('role', 'alert');
  startup.dataset.waggleStartup = 'failed';
  startupMessage.textContent = 'Waggle could not start. Close and reopen the app.';
};

try {
  armBootConnection();
  void import('./app-entry')
    .then(({ mountApp }) => mountApp())
    .catch((error) => showStartupFailure(error));
} catch (error) {
  showStartupFailure(error);
}

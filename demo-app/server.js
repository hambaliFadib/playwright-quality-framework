const http = require('http');

const port = Number(process.env.DEMO_PORT || 4173);
const customers = new Map();

function send(res, status, body, type = 'text/html') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

function page() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Demo AUT</title></head>
<body>
  <main>
    <h1>Demo Login</h1>
    <form id="login-form">
      <label>Username <input name="username" autocomplete="username"></label>
      <label>Password <input name="password" type="password" autocomplete="current-password"></label>
      <button type="submit">Sign in</button>
    </form>
    <section id="dashboard" hidden>
      <h2>Dashboard</h2>
      <p role="status">Signed in</p>
      <form id="customer-form">
        <label>Customer name <input name="customerName"></label>
        <label>Email <input name="email" type="email"></label>
        <button type="submit">Create customer</button>
      </form>
      <ul aria-label="Customers" id="customers"></ul>
    </section>
  </main>
  <script>
    const loginForm = document.querySelector('#login-form');
    const dashboard = document.querySelector('#dashboard');
    loginForm.addEventListener('submit', event => {
      event.preventDefault();
      loginForm.hidden = true;
      dashboard.hidden = false;
    });
    document.querySelector('#customer-form').addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      });
      const customer = await response.json();
      const item = document.createElement('li');
      item.textContent = customer.name + ' <' + customer.email + '>';
      document.querySelector('#customers').appendChild(item);
    });
  </script>
</body>
</html>`;
}

function createServer() {
  return http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') return send(res, 200, page());
  if (req.method === 'POST' && req.url === '/api/customers') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const input = JSON.parse(raw || '{}');
      const customer = {
        id: `${Date.now()}-${customers.size + 1}`,
        name: String(input.customerName || '').trim(),
        email: String(input.email || '').trim(),
      };
      customers.set(customer.email, customer);
      send(res, 201, JSON.stringify(customer), 'application/json');
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/customers/')) {
    const email = decodeURIComponent(req.url.split('/').pop());
    const customer = customers.get(email);
    return send(res, customer ? 200 : 404, JSON.stringify(customer || { error: 'not found' }), 'application/json');
  }
  return send(res, 404, 'not found', 'text/plain');
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Demo AUT listening on http://127.0.0.1:${port}`);
  });

  function shutdown() {
    server.close(() => process.exit(0));
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createServer };

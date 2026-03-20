#!/usr/bin/env node

const { execSync } = require('child_process');

const DEBUG_PORT = process.env.AUDIT_DEBUG_PORT || '9224';
const BASE_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3003';
const SUBJECT_ID = process.env.AUDIT_SUBJECT_ID || '4';
const WAIT_MS = Number.parseInt(process.env.AUDIT_WAIT_MS || '4500', 10);

function runSql(sql) {
  const normalizedSql = sql.replace(/\s+/g, ' ').trim();
  const cmd = `psql -d postgresql://edusimu:edusimu123@localhost:5432/edusimu -At -F $'\\t' -c ${JSON.stringify(normalizedSql)}`;
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function loadAnimations() {
  const sql = `
    select id, title, file_path
    from animations
    where subject_id = ${Number.parseInt(SUBJECT_ID, 10)}
    order by id
  `;
  const output = runSql(sql);
  if (!output) return [];
  return output.split('\n').map(line => {
    const parts = line.split('\t');
    const id = parts.shift();
    const filePath = parts.pop() || '';
    const title = parts.join('\t');
    let relative = filePath;
    if (filePath.startsWith('./uploads/')) {
      relative = filePath.slice('./uploads/'.length);
    }
    else {
      const marker = '/uploads/';
      const index = filePath.indexOf(marker);
      if (index >= 0) {
        relative = filePath.slice(index + marker.length);
      }
    }
    return {
      id: Number.parseInt(id, 10),
      title,
      url: `${BASE_URL}/uploads/${relative}`
    };
  });
}

async function fetchJson(url, opts = {}) {
  const response = await fetch(url, opts);
  return response.json();
}

async function openTarget(url) {
  return fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT'
  });
}

async function closeTarget(id) {
  await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/close/${id}`, {
    method: 'PUT'
  }).catch(() => null);
}

function inspectTarget(target) {
  return new Promise(resolve => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let seq = 0;
    let resolved = false;
    const exceptions = [];
    const logs = [];

    const finish = payload => {
      if (resolved) return;
      resolved = true;
      resolve({
        id: target.id,
        payload,
        exceptions,
        logs
      });
    };

    const send = (method, params = {}) => {
      ws.send(JSON.stringify({ id: ++seq, method, params }));
    };

    ws.onopen = () => {
      send('Runtime.enable');
      send('Log.enable');
      setTimeout(() => {
        send('Runtime.evaluate', {
          expression: `({
            ready: document.readyState,
            title: document.title,
            body: (document.body && document.body.innerText || '').slice(0, 220),
            hasPhet: !!window.phet,
            hasThree: !!window.THREE
          })`,
          returnByValue: true
        });
      }, WAIT_MS);
      setTimeout(() => {
        try {
          ws.close();
        }
        catch (error) {
          finish(null);
        }
      }, WAIT_MS + 2500);
    };

    ws.onmessage = event => {
      const msg = JSON.parse(event.data.toString());
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      }
      if (msg.method === 'Log.entryAdded') {
        logs.push(msg.params.entry.text);
      }
      if (msg.id && msg.result?.result?.value) {
        finish(msg.result.result.value);
        try {
          ws.close();
        }
        catch (error) {
          // ignore
        }
      }
    };

    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}

function classify(result) {
  if (!result.payload) return 'failed';
  const title = result.payload.title || '';
  const body = result.payload.body || '';
  if (title.includes('404') || body.includes('404 Not Found') || body.includes('This site can’t be reached')) {
    return 'failed';
  }
  if (result.exceptions.length) {
    return 'failed';
  }
  return 'passed';
}

async function main() {
  const animations = loadAnimations();
  const results = [];

  for (const animation of animations) {
    const target = await openTarget(animation.url);
    const inspected = await inspectTarget(target);
    await closeTarget(target.id);
    const status = classify(inspected);
    results.push({
      id: animation.id,
      title: animation.title,
      url: animation.url,
      status,
      payload: inspected.payload,
      exceptions: inspected.exceptions,
      logs: inspected.logs.slice(0, 5)
    });
    console.log(`${status.toUpperCase()}\t${animation.id}\t${animation.title}`);
  }

  const failed = results.filter(item => item.status === 'failed');
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const fs = await import('node:fs');
const { createRequire } = await import('node:module');
const sharp = createRequire('/workspace/package.json')('sharp');
const grab = async (n) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(s.data, 'base64');
  fs.writeFileSync('/tmp/' + n, buf);
  return buf;
};
const stats = async (buf, dark) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let sum = 0, n = 0, ink = 0;
  for (let y = 60; y < height; y += 2)
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * channels;
      const L = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      sum += L; n++;
      if (dark ? L > 0.22 : L < 0.62) ink++;
    }
  return { mean: +(sum / n).toFixed(3), ink: +(ink / n).toFixed(3) };
};
const setTheme = (t) =>
  send('Runtime.evaluate', {
    expression: `document.documentElement.dataset.theme=${JSON.stringify(t)};localStorage.setItem('theme',${JSON.stringify(t)});`,
  });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [] });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:4324/' });
await new Promise((r) => setTimeout(r, 2500));
await setTheme('light');
await new Promise((r) => setTimeout(r, 900));
console.log('desktop light', await stats(await grab('u-light.png'), false));
await setTheme('dark');
await new Promise((r) => setTimeout(r, 900));
console.log('desktop dark', await stats(await grab('u-dark.png'), true));
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await new Promise((r) => setTimeout(r, 900));
console.log('mobile dark', await stats(await grab('u-m-dark.png'), true));
await setTheme('light');
await new Promise((r) => setTimeout(r, 900));
console.log('mobile light', await stats(await grab('u-m-light.png'), false));
ws.close();

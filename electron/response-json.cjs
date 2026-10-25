// Bound untrusted provider responses before parsing them in the privileged process.
async function responseJson(response, limit = 8 * 1024 * 1024) {
  if (Number(response.headers?.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('The provider response is too large.');
  }
  let text;
  if (response.body) {
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('The provider response is too large.'); }
        chunks.push(Buffer.from(value));
      }
      text = Buffer.concat(chunks).toString('utf8');
    } finally { reader.releaseLock(); }
  } else {
    // Injected test clients can supply JSON directly; they get the same size check.
    text = JSON.stringify(await response.json());
    if (Buffer.byteLength(text) > limit) throw new Error('The provider response is too large.');
  }
  try { return JSON.parse(text); }
  catch { throw new Error('The provider returned invalid JSON.'); }
}
module.exports = { responseJson };

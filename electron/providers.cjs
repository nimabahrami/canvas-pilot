const { responseJson } = require('./response-json.cjs');
const PROVIDERS = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: '' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: '' },
  nvidia: { baseUrl: 'https://integrate.api.nvidia.com/v1', model: '' },
  compatible: { baseUrl: 'https://openrouter.ai/api/v1', model: '' },
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: '' },
};

function validateBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid provider URL.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('The provider URL cannot include credentials, a query, or a fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS, or HTTP for a local provider.');
  return url.toString().replace(/\/$/, '');
}

function providerBase(settings) {
  if (!PROVIDERS[settings.provider]) throw new Error('Choose an AI provider.');
  return validateBaseUrl(['compatible', 'ollama'].includes(settings.provider) ? settings.baseUrl : PROVIDERS[settings.provider].baseUrl);
}

async function listModels(settings, key, fetcher = fetch) {
  const provider = settings.provider, base = providerBase(settings);
  if (!key && provider !== 'ollama') throw new Error('Add your API key to load available models.');
  const headers = provider === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : provider === 'gemini' ? { 'x-goog-api-key': key } : provider === 'ollama' ? {} : { Authorization: `Bearer ${key}` };
  const result = new Map(), cursors = new Set();
  const signal = AbortSignal.timeout(15000);
  let cursor = '';
  do {
    const url = new URL(`${base}/${provider === 'ollama' ? 'api/tags' : 'models'}`);
    if (provider === 'anthropic') { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor); }
    if (provider === 'gemini') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); }
    let response;
    try { response = await fetcher(url.toString(), { method: 'GET', headers, redirect: 'error', signal }); }
    catch (error) { throw new Error(error.name === 'TimeoutError' ? 'Loading models timed out. Try again.' : 'Could not load models. Check your connection and provider URL.'); }
    if (!response.ok) throw new Error(({ 401: 'The API key was rejected.', 403: 'This key cannot list models.', 404: 'This endpoint does not provide a model list.', 429: 'The provider rate limit was reached. Try again shortly.' }[response.status] || 'Could not load available models.') + ` (HTTP ${response.status})`);
    const data = await responseJson(response);
    const rows = ['gemini', 'ollama'].includes(provider) ? data.models : data.data;
    if (!Array.isArray(rows)) throw new Error('The provider returned an invalid model list.');
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const id = provider === 'gemini' ? (typeof row.name === 'string' ? row.name.replace(/^models\//, '') : '') : provider === 'ollama' ? row.model || row.name : row.id;
      if (typeof id !== 'string' || !id || id.length > 200 || row.lifecycle === 'retired' || row.lifecycle === 'deprecated') continue;
      if (provider === 'gemini' && !row.supportedGenerationMethods?.includes('generateContent')) continue;
      if (row.architecture?.output_modalities && !row.architecture.output_modalities.includes('text')) continue;
      // Catalogs without capability metadata need a name filter for non-chat models.
      if (/embed|rerank|moderation|whisper|tts|transcrib|realtime|audio|dall-e|image|sora|guard|reward|safety|detector|deplot|nvclip|parse|ising|cosmos|riva|retriev/i.test(id)) continue;
      if (provider === 'openai' && (!/^(gpt-|o\d)/.test(id) || /^gpt-3\.5/.test(id))) continue;
      result.set(id, { id, name: String(row.display_name || row.displayName || row.name || id).replace(/^models\//, ''), created: Number(row.created) || Date.parse(row.created_at) || 0 });
    }
    cursor = provider === 'gemini' ? data.nextPageToken : provider === 'anthropic' && data.has_more ? data.last_id : '';
    if (cursor && (typeof cursor !== 'string' || cursors.has(cursor) || cursors.size >= 20)) throw new Error('The provider returned an invalid model-list cursor.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const preference = id => (/preview|experimental|exp-|pro|ultra|opus/i.test(id) ? 0 : 2) + (/mini|nano|flash|haiku|lightning|bolt|(?:\b|-)8b|(?:\b|-)20b/i.test(id) ? 2 : 0) + (/instruct|gpt-|claude|gemini/i.test(id) ? 1 : 0);
  return [...result.values()].sort((a, b) => preference(b.id) - preference(a.id) || b.created - a.created || b.id.localeCompare(a.id, undefined, { numeric: true })).map(({ id, name }) => ({ id, name }));
}

function providerRequest(settings, key, instructions, input, maxTokens = 4096) {
  const provider = settings.provider;
  if (!PROVIDERS[provider]) throw new Error('Unsupported AI provider.');
  const model = settings.model.trim();
  if (!model) throw new Error('No text model is available. Refresh models in Settings.');
  const base = validateBaseUrl(['compatible', 'ollama'].includes(provider) ? settings.baseUrl : PROVIDERS[provider].baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (!key && provider !== 'ollama') throw new Error('Add your API key in Settings first.');
  if (provider === 'openai') return { url: `${base}/responses`, headers: { ...headers, Authorization: `Bearer ${key}` }, body: { model, instructions, input, store: false, max_output_tokens: maxTokens } };
  if (provider === 'anthropic') return { url: `${base}/messages`, headers: { ...headers, 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: { model, system: instructions, messages: [{ role: 'user', content: input }], max_tokens: maxTokens } };
  if (provider === 'gemini') return { url: `${base}/models/${encodeURIComponent(model)}:generateContent`, headers: { ...headers, 'x-goog-api-key': key }, body: { systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { maxOutputTokens: maxTokens } } };
  if (provider === 'ollama') return { url: `${base}/api/chat`, headers, body: { model, stream: false, messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], options: { num_predict: maxTokens } } };
  return { url: `${base}/chat/completions`, headers: { ...headers, Authorization: `Bearer ${key}` }, body: { model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], max_tokens: maxTokens } };
}

function extractText(provider, data) {
  if (provider === 'openai') {
    if (data.status === 'incomplete') throw new Error('The provider reached its output limit. Try a shorter prompt.');
    return (data.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
  }
  if (provider === 'anthropic') {
    if (data.stop_reason === 'max_tokens') throw new Error('The provider reached its output limit. Try a shorter prompt.');
    return (data.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n');
  }
  if (provider === 'gemini') {
    if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('The provider reached its output limit. Your journal is unchanged.');
    return (data.candidates?.[0]?.content?.parts ?? []).filter(item => !item.thought).map(item => item.text ?? '').join('\n');
  }
  if (provider === 'ollama') {
    if (data.done_reason === 'length') throw new Error('The provider reached its output limit. Your journal is unchanged.');
    return data.message?.content ?? '';
  }
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('The provider reached its output limit. Try a shorter prompt.');
  return data.choices?.[0]?.message?.content ?? '';
}

async function enhance(settings, key, session, format, fetcher = fetch) {
  const { ENHANCEMENT_INSTRUCTIONS, buildEnhancementInput, applyEnhancedEntries } = await import('../shared/journal.mjs');
  const input = buildEnhancementInput(session, format);
  if (!settings.model?.trim()) {
    const models = await listModels(settings, key, fetcher);
    if (!models.length) throw new Error('No text models are available. Check your provider account or install an Ollama model.');
    settings = { ...settings, model: models[0].id };
  }
  const maxTokens = Math.min(32768, Math.max(4096, Math.ceil(session.entries.reduce((size, entry) => size + entry.prompt.length, 0) / 2) + session.entries.length * 384 + 1024));
  const request = providerRequest(settings, key, ENHANCEMENT_INSTRUCTIONS, input, maxTokens);
  let response;
  try { response = await fetcher(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), redirect: 'error', signal: AbortSignal.timeout(90000) }); }
  catch (error) { throw new Error(error.name === 'TimeoutError' ? 'The AI provider timed out. Your draft is still here.' : 'Could not reach the AI provider. Check your connection and provider URL.'); }
  if (!response.ok) {
    const explanation = { 401: 'The API key was rejected.', 403: 'Your account cannot access this model.', 404: 'The model or endpoint was not found.', 429: 'The provider rate limit or credit limit was reached.' }[response.status] ?? 'The AI provider could not complete this request. Check the model and account settings.';
    throw new Error(`${explanation} (HTTP ${response.status})`);
  }
  const text = extractText(settings.provider, await responseJson(response));
  if (typeof text !== 'string' || !text.trim()) throw new Error('The provider returned no journal. Your original text is unchanged.');
  let result;
  try { result = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')); }
  catch { throw new Error('The provider returned an unreadable journal. Your original text is unchanged. Try again.'); }
  return applyEnhancedEntries(session, result?.entries).entries.map(({ id, prompt }) => ({ id, prompt }));
}
module.exports = { PROVIDERS, validateBaseUrl, providerBase, listModels, providerRequest, extractText, enhance };

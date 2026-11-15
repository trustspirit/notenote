// Emulator integration test: security rules + mirror triggers, end to end over REST.
// Run with `npm run test:emulator` (wraps this in `firebase emulators:exec`).
// Uses unsigned ID tokens, which only the emulator accepts.
const P = "demo-smart-notes";
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8181";
const BASE = `http://${HOST}/v1/projects/${P}/databases/(default)/documents`;
const RUN = Date.now().toString(36); // fresh uids per run, so reruns don't see old data
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (uid, name) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: uid, user_id: uid, name, iat: 0, exp: 9e9, aud: P, iss: `https://securetoken.google.com/${P}`, firebase: { sign_in_provider: "google.com" } })}.`;
const v = (x) => typeof x === "boolean" ? { booleanValue: x } : typeof x === "string" ? { stringValue: x } : Number.isInteger(x) ? { integerValue: String(x) } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } } : { stringValue: String(x) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, v(x)]));
const note = (uid, name, extra = {}) => ({ id: "n", ownerUid: uid, authorName: name, title: "t", contentHtml: "<p>x</p>", tags: [], updatedAt: 1, kind: "text", ...extra });
async function req(method, path, uid, name, body) {
  const r = await fetch(path.startsWith(":") ? `${BASE}${path}` : `${BASE}/${path}`, { method, headers: { "Content-Type": "application/json", ...(uid && { Authorization: `Bearer ${tok(uid, name)}` }) }, body: body && JSON.stringify(body) });
  return r.status;
}
const put = (path, uid, name, data) => req("PATCH", path, uid, name, { fields: fields(data) });
const A = [`alice${RUN}`, "Alice"], M = [`mallory${RUN}`, "Mallory"];
const results = [];
const check = async (label, expect, p) => { const s = await p; results.push(`${s === expect ? "PASS" : "FAIL"} ${label}: ${s} (want ${expect})`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(label, path, want, uid) {
  let s;
  for (let i = 0; i < 40; i++) { s = await req("GET", path, uid); if (s === want) break; await sleep(250); }
  results.push(`${s === want ? "PASS" : "FAIL"} ${label}: ${s} (want ${want})`);
}
async function getJson(path) { return (await fetch(`${BASE}/${path}`)).json(); }
const priv = (o) => ({ notebookId: "nb1", title: "t", contentHtml: "<p>hello <b>world</b></p>", tags: ["a"], isPublic: false, updatedAt: Date.now(), kind: "text", ...o });

// --- rules: no client writes to the public side ---
await check("alice writes own publicNotes doc directly", 403, put(`publicNotes/${A[0]}_x`, ...A, note(...A)));
await check("alice writes own publicNotebooks doc directly", 403, put(`publicNotebooks/${A[0]}_x`, ...A, { name: "x" }));
await check("listing publicNotes denied", 403, req("GET", "publicNotes"));
await check("listing notebook notes denied", 403, req("GET", `publicNotebooks/${A[0]}_nb1/notes`));
await check("mallory reads alice's private note", 403, req("GET", `users/${A[0]}/notes/n1`, ...M));

// --- triggers: single note share ---
await check("alice creates notebook", 200, put(`users/${A[0]}/notebooks/nb1`, ...A, { name: "NB", isPublic: false, createdAt: 1 }));
await check("alice creates private note", 200, put(`users/${A[0]}/notes/n1`, ...A, priv({})));
await sleep(1500);
await check("private note not mirrored", 404, req("GET", `publicNotes/${A[0]}_n1`));
await put(`users/${A[0]}/notes/n1`, ...A, priv({ isPublic: true }));
await waitFor("shared note mirrored by trigger", `publicNotes/${A[0]}_n1`, 200);
await put(`users/${A[0]}/notes/n1`, ...A, priv({ isPublic: false }));
await waitFor("unshared note removed", `publicNotes/${A[0]}_n1`, 404);

// --- races: rapid share/unshare must always end private ---
for (let i = 0; i < 5; i++) {
  await put(`users/${A[0]}/notes/r${i}`, ...A, priv({ notebookId: "nbx", isPublic: true }));
  await put(`users/${A[0]}/notes/r${i}`, ...A, priv({ notebookId: "nbx", isPublic: false }));
}
await sleep(3000);
for (let i = 0; i < 5; i++) await check(`race ${i}: unshared right after share stays private`, 404, req("GET", `publicNotes/${A[0]}_r${i}`));
await put(`users/${A[0]}/notebooks/nbr`, ...A, { name: "R", isPublic: true, createdAt: 1 });
await put(`users/${A[0]}/notebooks/nbr`, ...A, { name: "R", isPublic: false, createdAt: 1 });
await sleep(3000);
await check("race: notebook unshared right after share stays private", 404, req("GET", `publicNotebooks/${A[0]}_nbr`));

// --- triggers: notebook share ---
await put(`users/${A[0]}/notes/n2`, ...A, priv({ title: "second" }));
await put(`users/${A[0]}/notebooks/nb1`, ...A, { name: "NB", isPublic: true, createdAt: 1 });
await waitFor("notebook mirrored", `publicNotebooks/${A[0]}_nb1`, 200);
await waitFor("notebook note mirrored", `publicNotebooks/${A[0]}_nb1/notes/n2`, 200);
let nb = await getJson(`publicNotebooks/${A[0]}_nb1`);
const idx = () => (nb.fields.notes?.arrayValue?.values ?? []).map((e) => e.mapValue.fields.id.stringValue).sort().join(",");
results.push(`${idx() === "n1,n2" ? "PASS" : "FAIL"} index has n1,n2: ${idx()}`);
await put(`users/${A[0]}/notes/n3`, ...A, priv({ title: "third" }));
await waitFor("new note in public notebook mirrored", `publicNotebooks/${A[0]}_nb1/notes/n3`, 200);
await sleep(500); nb = await getJson(`publicNotebooks/${A[0]}_nb1`);
results.push(`${idx() === "n1,n2,n3" ? "PASS" : "FAIL"} index updated: ${idx()}`);
await req("DELETE", `users/${A[0]}/notes/n2`, ...A);
await waitFor("deleted note removed from notebook", `publicNotebooks/${A[0]}_nb1/notes/n2`, 404);
await put(`users/${A[0]}/notebooks/nb1`, ...A, { name: "Renamed", isPublic: true, createdAt: 1 });
await sleep(1500); nb = await getJson(`publicNotebooks/${A[0]}_nb1`);
results.push(`${nb.fields.name.stringValue === "Renamed" ? "PASS" : "FAIL"} rename propagated: ${nb.fields.name.stringValue}`);
await put(`users/${A[0]}/notebooks/nb1`, ...A, { name: "Renamed", isPublic: false, createdAt: 1 });
await waitFor("unshared notebook removed", `publicNotebooks/${A[0]}_nb1`, 404);
await waitFor("its notes removed too", `publicNotebooks/${A[0]}_nb1/notes/n3`, 404);
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);

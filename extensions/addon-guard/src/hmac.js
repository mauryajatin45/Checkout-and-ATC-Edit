// @ts-check
// Minimal SHA-256 / HMAC-SHA256 for the function runtime (no crypto module there). Inputs are short ASCII strings.
// Written for the function instruction budget: typed arrays, no allocations inside the rounds.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Int32Array(64);

/** @param {string} s @returns {Uint8Array} UTF-8 bytes */
function utf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** One compression round over msg[off .. off+64) into h (Int32Array(8)). */
function compress(h, msg, off) {
  for (let i = 0; i < 16; i++) {
    const j = off + (i << 2);
    W[i] = (msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
  for (let i = 0; i < 64; i++) {
    const t1 = (k + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
}

/**
 * SHA-256 of `data`, continuing from state `h` after `prefixLen` bytes were already hashed (a multiple of 64).
 * @param {Int32Array} h @param {Uint8Array} data @param {number} prefixLen @returns {Uint8Array}
 */
function finish(h, data, prefixLen) {
  const total = prefixLen + data.length;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const bits = total * 8;
  const n = padded.length;
  padded[n - 4] = (bits >>> 24) & 255;
  padded[n - 3] = (bits >>> 16) & 255;
  padded[n - 2] = (bits >>> 8) & 255;
  padded[n - 1] = bits & 255;
  for (let off = 0; off < n; off += 64) compress(h, padded, off);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (h[i] >>> 24) & 255;
    out[i * 4 + 1] = (h[i] >>> 16) & 255;
    out[i * 4 + 2] = (h[i] >>> 8) & 255;
    out[i * 4 + 3] = h[i] & 255;
  }
  return out;
}

/** @param {Uint8Array} bytes */
export function sha256(bytes) {
  return finish(Int32Array.from(IV), bytes, 0);
}

/** SHA-256 states after the HMAC ipad / opad blocks of `key` (to precompute a fixed key). @param {string} key */
export function hmacMidstates(key) {
  let k = utf8(key);
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const b = i < k.length ? k[i] : 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  const hi = Int32Array.from(IV);
  compress(hi, ipad, 0);
  const ho = Int32Array.from(IV);
  compress(ho, opad, 0);
  return { inner: Array.from(hi), outer: Array.from(ho) };
}

/** HMAC-SHA256 as lowercase hex from precomputed midstates. @param {{inner:number[],outer:number[]}} m @param {string} message */
export function hmacHexFromMidstates(m, message) {
  const inner = finish(Int32Array.from(m.inner), utf8(message), 64);
  const outer = finish(Int32Array.from(m.outer), inner, 64);
  let hex = "";
  for (let i = 0; i < 32; i++) hex += (outer[i] < 16 ? "0" : "") + outer[i].toString(16);
  return hex;
}

/** HMAC-SHA256 as lowercase hex. @param {string} key @param {string} message */
export function hmacHex(key, message) {
  return hmacHexFromMidstates(hmacMidstates(key), message);
}

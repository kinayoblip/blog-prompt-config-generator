const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 17321);
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const deviceFile = path.join(__dirname, ".device-id");

function getDeviceId() {
  try {
    const existing = fs.readFileSync(deviceFile, "utf8").trim();
    if (existing) return existing;
  } catch {}
  const id = crypto.randomUUID();
  fs.writeFileSync(deviceFile, id, "utf8");
  return id;
}

const deviceId = getDeviceId();
const commonHeaders = {
  "X-Account-Id": deviceId,
  "X-Device-Id": deviceId,
  "X-Platform": "web",
  "X-Project-Id": "seaart",
  "X-App-Id": "web_global_seaart"
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-File-Name",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(body));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function confirmUpload(signed) {
  for (const delay of [900, 1600, 2800, 4500]) {
    await sleep(delay);
    const response = await fetch("https://www.seaart.ai/api/v1/resource/fast-confirm", {
      method: "POST",
      headers: { ...commonHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ signed, category: "29" })
    });
    const result = await response.json();
    if (result?.status?.code === 10000 && result?.data?.url) return result.data.url;
    if (result?.status?.code !== 10633) break;
  }
  return "";
}

let confirmationQueue = Promise.resolve();

function queueConfirmation(signed, fallbackUrl) {
  const job = confirmationQueue.then(async () => {
    const confirmedUrl = await confirmUpload(signed);
    return confirmedUrl || fallbackUrl;
  });
  confirmationQueue = job.catch(() => fallbackUrl);
  return job;
}

async function uploadImage(buffer, fileName, contentType) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: contentType }), fileName);
    form.append("filename", fileName);
    form.append("category", "29");
    const response = await fetch("https://www.seaart.ai/api/upload/image-v2", {
      method: "POST",
      headers: commonHeaders,
      body: form
    });
    const result = await response.json();
    if (response.ok && result?.status?.code === 10000 && result?.data?.url) {
      if (result.data.signed) queueConfirmation(result.data.signed, result.data.url).catch(() => {});
      return result.data.url;
    }
    if (result?.status?.code !== 10633 || attempt === 3) {
      throw new Error(result?.status?.msg || `Upload failed (${response.status})`);
    }
    await sleep(attempt * 1200);
  }
}

function serveHtml(res) {
  const html = fs.readdirSync(__dirname).find(name => name.toLowerCase().endsWith(".html"));
  if (!html) return json(res, 404, { error: "HTML file not found" });
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  fs.createReadStream(path.join(__dirname, html)).pipe(res);
}

function serveScript(res, fileName) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) return json(res, 404, { error: "Script not found" });
  res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) return serveHtml(res);
  if (req.method === "GET" && req.url === "/html-prompt-import.js") return serveScript(res, "html-prompt-import.js");
  if (req.method === "GET" && req.url === "/model-fields.js") return serveScript(res, "model-fields.js");
  if (req.method === "POST" && req.url === "/upload") {
    const fileName = decodeURIComponent(String(req.headers["x-file-name"] || "image.webp"));
    const contentType = String(req.headers["content-type"] || "application/octet-stream");
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_FILE_SIZE) req.destroy(new Error("Image exceeds 30 MB"));
      else chunks.push(chunk);
    });
    req.on("end", async () => {
      try {
        const url = await uploadImage(Buffer.concat(chunks), fileName, contentType);
        json(res, 200, { ok: true, url });
      } catch (error) {
        json(res, 500, { ok: false, error: error.message });
      }
    });
    req.on("error", error => json(res, 500, { ok: false, error: error.message }));
    return;
  }
  json(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Blog prompt config tool: http://${HOST}:${PORT}/`);
});

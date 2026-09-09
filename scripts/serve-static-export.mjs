import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.RESPONSIVE_PORT ?? "8798", 10);
const exportRoot = resolve(
  process.cwd(),
  process.env.STATIC_EXPORT_ROOT ?? "out"
);

if (!existsSync(exportRoot)) {
  throw new Error(
    `Missing static export directory: ${exportRoot}. Run the appropriate build first.`
  );
}

const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function resolveExportFile(urlPath) {
  const decoded = decodeURIComponent(urlPath).replaceAll("/", sep);
  const relative = normalize(decoded).replace(/^([.][.][\\/])+/, "").replace(/^[\\/]+/, "");
  const direct = resolve(exportRoot, relative);
  const candidates = [
    direct,
    join(direct, "index.html"),
    `${direct}.html`,
  ];

  return candidates.find((candidate) => {
    if (candidate !== exportRoot && !candidate.startsWith(`${exportRoot}${sep}`)) return false;
    return existsSync(candidate) && statSync(candidate).isFile();
  });
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
  const file = resolveExportFile(requestUrl.pathname);

  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  const size = statSync(file).size;
  const headers = {
    "Content-Type": contentTypes.get(extname(file).toLowerCase()) ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  let start = 0, end = size - 1;
  if (range) {
    start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return;
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file, { start, end }).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Static responsive audit server: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

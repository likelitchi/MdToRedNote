import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  maxDuration: 60
};

let browserPromise;

async function readPayload(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
  }

  return browserPromise;
}

async function capturePng(page, item, defaults) {
  const width = item.width || defaults.width;
  const height = item.height || defaults.height;
  const scale = item.scale || defaults.scale;

  await page.setViewport({
    width,
    height,
    deviceScaleFactor: scale
  });

  await page.setContent(
    `<!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="UTF-8" />
        <base href="${defaults.baseUrl}" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: ${width}px;
            min-width: ${width}px;
            background: transparent;
          }

          body {
            overflow: hidden;
          }
        </style>
        <style>${defaults.styles}</style>
      </head>
      <body>
        <div id="capture-root">${item.html}</div>
      </body>
    </html>`,
    { waitUntil: "load" },
  );

  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Font loading can fail for remote assets; export should still continue.
      }
    }

    await Promise.all(
      Array.from(document.images || []).map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }

            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          }),
      ),
    );
  });

  const target = await page.$("#capture-root");
  if (!target) {
    throw new Error("Capture root not found");
  }

  return target.screenshot({
    type: "png",
    omitBackground: item.transparent ?? defaults.transparent
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return;
  }

  let page;

  try {
    const payload = await readPayload(req);
    const {
      html,
      items,
      styles = "",
      width = 1080,
      height = 1350,
      scale = 1,
      transparent = true,
      baseUrl = "http://localhost:5173/"
    } = payload;

    if (!html && !Array.isArray(items)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Missing html payload" }));
      return;
    }

    const browser = await getBrowser();
    page = await browser.newPage();
    const exportItems = Array.isArray(items)
      ? items.filter((item) => item?.html)
      : [{ html, width, height, scale, transparent }];
    const defaults = { styles, width, height, scale, transparent, baseUrl };
    const results = [];

    for (const item of exportItems) {
      results.push(await capturePng(page, item, defaults));
    }

    if (Array.isArray(items)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ images: results.map((item) => Buffer.from(item).toString("base64")) }));
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.end(Buffer.from(results[0]));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Export failed"
      }),
    );
  } finally {
    await page?.close().catch(() => {});
  }
}

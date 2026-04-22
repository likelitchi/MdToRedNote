import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import puppeteer from "puppeteer";

function exportCapturePlugin() {
  let browserPromise;

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
    }

    return browserPromise;
  }

  async function getPage() {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.resourceType() === "font") {
        request.continue();
        return;
      }
      request.continue();
    });
    return page;
  }

  function attachMiddleware(server) {
    server.middlewares.use("/__export_png", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }

      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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

        const page = await getPage();

        try {
          const exportItems = Array.isArray(items)
            ? items.filter((item) => item?.html)
            : [{ html, width, height, scale, transparent }];

          const results = [];

          for (const item of exportItems) {
            await page.setViewport({
              width: item.width || width,
              height: item.height || height,
              deviceScaleFactor: item.scale || scale
            });

            await page.setContent(
              `<!doctype html>
              <html lang="zh-Hant">
                <head>
                  <meta charset="UTF-8" />
                  <base href="${baseUrl}" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <style>
                    html, body {
                      margin: 0;
                      padding: 0;
                      width: ${item.width || width}px;
                      min-width: ${item.width || width}px;
                      background: transparent;
                    }

                    body {
                      overflow: hidden;
                    }
                  </style>
                  <style>${styles}</style>
                </head>
                <body>
                  <div id="capture-root">${item.html}</div>
                </body>
              </html>`,
              { waitUntil: "load" }
            );

            await page.evaluate(async () => {
              if (document.fonts?.ready) {
                try {
                  await document.fonts.ready;
                } catch {
                  // Ignore font readiness failures in export.
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

            const buffer = await target.screenshot({
              type: "png",
              omitBackground: item.transparent ?? transparent
            });

            results.push(buffer);
          }

          if (Array.isArray(items)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ images: results.map((item) => item.toString("base64")) }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "image/png");
          res.end(results[0]);
        } finally {
          await page.close().catch(() => {});
        }
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Export failed"
          }),
        );
      }
    });
  }

  return {
    name: "export-capture-plugin",
    configureServer: attachMiddleware,
    configurePreviewServer: attachMiddleware
  };
}

export default defineConfig({
  plugins: [react(), exportCapturePlugin()]
});

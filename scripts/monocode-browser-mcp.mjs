#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stdin, stdout } from "node:process";

const cwd = process.env.MONOCODE_BROWSER_CWD || process.cwd();
const requestPath = join(cwd, ".monocode-browser.json");
const resultPath = join(cwd, ".monocode-browser-result.json");

const TOOLS = [
  {
    name: "browser_navigate",
    description: "Open a URL in MonoCode's in-app browser.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "browser_snapshot",
    description: "Read title, URL, visible text, and links from the current page.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser_take_screenshot",
    description: "Capture a screenshot of the in-app browser pane.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot of the in-app browser pane.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser_click",
    description: "Click a CSS selector (or ref) on the current page.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        ref: { type: "string" },
        doubleClick: { type: "boolean" },
      },
    },
  },
  {
    name: "browser_hover",
    description: "Hover a CSS selector.",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string" }, ref: { type: "string" } },
    },
  },
  {
    name: "browser_type",
    description: "Type text into a CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        ref: { type: "string" },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "browser_fill",
    description: "Fill a CSS selector with text.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        ref: { type: "string" },
        value: { type: "string" },
        text: { type: "string" },
      },
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page or an element. dy is pixels (positive = down).",
    inputSchema: {
      type: "object",
      properties: { dy: { type: "number" }, selector: { type: "string" } },
    },
  },
  {
    name: "browser_console_messages",
    description: "Read captured console logs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser_network_requests",
    description: "Read captured fetch/network requests.",
    inputSchema: { type: "object", properties: {} },
  },
];

const OP = {
  browser_navigate: "navigate",
  browser_snapshot: "snapshot",
  browser_screenshot: "screenshot",
  browser_take_screenshot: "screenshot",
  browser_click: "click",
  browser_hover: "hover",
  browser_type: "type",
  browser_fill: "type",
  browser_scroll: "scroll",
  browser_console_messages: "console",
  browser_network_requests: "network",
  browser_console: "console",
  browser_network: "network",
  browser_dblclick: "dblclick",
};

let nextId = 1;

function send(msg) {
  const json = JSON.stringify(msg);
  stdout.write(`${json}\n`);
}

async function callTool(name, args = {}) {
  let op = OP[name];
  if (!op) throw new Error(`Unknown tool ${name}`);
  if (name === "browser_click" && args.doubleClick) op = "dblclick";
  const id = `mcp-${process.pid}-${nextId++}`;
  const selector = args.selector || args.ref;
  const text = args.text ?? args.value;
  const body = { id, op, url: args.url, selector, text, dy: args.dy };
  await writeFile(requestPath, `${JSON.stringify(body)}\n`, "utf8");
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const parsed = JSON.parse(await readFile(resultPath, "utf8"));
      if (parsed && parsed.id === id) return parsed;
    } catch {
      /* not ready */
    }
  }
  throw new Error(
    "Timed out waiting for MonoCode to run the browser tool. Is the app open?",
  );
}

async function handle(msg) {
  if (!msg || typeof msg.method !== "string") return;
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "monocode-browser", version: "0.1.0" },
      },
    });
    return;
  }
  if (msg.method === "notifications/initialized" || msg.method === "ping") {
    return;
  }
  if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === "tools/call") {
    try {
      const result = await callTool(
        msg.params?.name,
        msg.params?.arguments ?? {},
      );
      const image =
        result.screenshot &&
        String(result.screenshot).startsWith("data:image")
          ? String(result.screenshot).replace(/^data:image\/png;base64,/, "")
          : null;
      const content = [
        {
          type: "text",
          text: JSON.stringify(
            { ...result, screenshot: result.screenshot ? "[png]" : undefined },
            null,
            2,
          ),
        },
      ];
      if (image) {
        content.push({ type: "image", data: image, mimeType: "image/png" });
      }
      send({ jsonrpc: "2.0", id: msg.id, result: { content } });
    } catch (err) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32000, message: String(err?.message || err) },
      });
    }
  }
}

let buf = Buffer.alloc(0);
stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const headerEnd = buf.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = buf.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        buf = buf.subarray(headerEnd + 4);
        continue;
      }
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (buf.length < start + len) return;
      const json = buf.subarray(start, start + len).toString("utf8");
      buf = buf.subarray(start + len);
      try {
        void handle(JSON.parse(json));
      } catch {
        /* ignore */
      }
      continue;
    }
    const nl = buf.indexOf("\n");
    if (nl < 0) return;
    const line = buf.subarray(0, nl).toString("utf8").trim();
    buf = buf.subarray(nl + 1);
    if (!line || /^content-length:/i.test(line)) continue;
    try {
      void handle(JSON.parse(line));
    } catch {
      /* incomplete */
    }
  }
});

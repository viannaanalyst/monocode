export const IN_APP_BROWSER_SKILL_NAME = "in-app-browser";

export const IN_APP_BROWSER_SKILL_DESCRIPTION =
  "Control MonoCode’s in-app browser pane. Use when the user wants you to open localhost, inspect a page, take a snapshot or screenshot, type into a form, or click in the embedded browser.";

export const IN_APP_BROWSER_SKILL_BODY = `---
name: in-app-browser
description: Control MonoCode’s in-app browser pane. Use when the user wants you to open localhost, inspect a page, take a snapshot or screenshot, type into a form, or click in the embedded browser.
---

# In-app browser

MonoCode has an embedded browser pane (globe button in the title bar). Prefer the MCP tools named \`browser_*\` when they are available. If they are not, write a JSON request in the project root and read the result.

## MCP tools

\`browser_navigate\`, \`browser_snapshot\`, \`browser_take_screenshot\`, \`browser_click\`, \`browser_hover\`, \`browser_type\`, \`browser_fill\`, \`browser_scroll\`, \`browser_console_messages\`, \`browser_network_requests\`.

Clicks and typing use a CSS \`selector\` (or \`ref\` treated as a selector). There is no accessibility-tree ref system like Cursor’s Chromium browser.

## Files (fallback)

| File | Role |
|------|------|
| \`.monocode-browser.json\` | Request you write |
| \`.monocode-browser-result.json\` | Result MonoCode writes |

Overwrite the request file each time. Wait until the result file has the same \`id\`.

## Operations

\`\`\`json
{"id":"1","op":"navigate","url":"http://localhost:5173"}
{"id":"2","op":"snapshot"}
{"id":"3","op":"screenshot"}
{"id":"4","op":"click","selector":"button.primary"}
{"id":"5","op":"dblclick","selector":"h1"}
{"id":"6","op":"hover","selector":".menu"}
{"id":"7","op":"type","selector":"input[name=q]","text":"hello"}
{"id":"8","op":"scroll","dy":400}
{"id":"9","op":"console"}
{"id":"10","op":"network"}
\`\`\`

## Rules

- Prefer this pane for localhost and app previews. Do not tell the user to copy URLs into Chrome unless they ask.
- Hosts not on the user’s allowlist (Settings → Browser) need approval in the UI. Localhost is allowed by default.
- If the result says no pane is open, ask the user to click **New Browser**, or retry navigate once.
- Screenshots need macOS Screen Recording permission for the app.
- Never print secrets from a snapshot into the chat unless the user asked for that page.
`;

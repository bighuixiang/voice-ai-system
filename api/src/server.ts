import { createApp } from "./app.js";

const port = Number(process.env.NOVEL_API_PORT || 8787);

createApp().listen(port, "127.0.0.1", () => {
  console.log(`Novel Codex API listening on http://127.0.0.1:${port}`);
});

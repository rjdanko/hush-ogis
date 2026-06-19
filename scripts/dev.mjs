// Boots dashboard + mobile + ai-service together. Pure Node, no extra deps.
import { spawn } from "node:child_process";

const procs = [
  ["dashboard", "npm", ["run", "dev", "--workspace", "apps/dashboard"]],
  ["mobile", "npm", ["run", "start", "--workspace", "apps/mobile"]],
  ["ai-service", "bash", ["scripts/run-ai.sh"]],
];

const children = procs.map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (code) => console.log(`[${name}] exited ${code}`));
  return child;
});

const shutdown = () => children.forEach((c) => c.kill());
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

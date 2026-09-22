import { spawn } from "child_process";

const proxy = process.env.GLOSSARY_PROXY || "http://127.0.0.1:10808";
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
  process.env[key] = proxy;
}
process.env.ELECTRON_GET_USE_PROXY = "true";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const task = process.argv[2] || "dist";
const child = spawn(npmCmd, ["run", task], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 1));

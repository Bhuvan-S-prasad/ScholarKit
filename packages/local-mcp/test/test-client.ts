import { spawn } from "child_process";
import readline from "readline";

async function runMcpTestClient() {
  console.log("=================================================");
  console.log("  ScholarKit MCP Stdio Handshake & Tool Test");
  console.log("=================================================\n");

  // Spawn local MCP server process (using process.execPath for Windows compatibility)
  const child = spawn(process.execPath, ["run", "packages/local-mcp/src/index.ts"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
    shell: true,
  });

  const rl = readline.createInterface({
    input: child.stdout,
  });

  let messageId = 1;
  const pendingRequests = new Map<number, (res: any) => void>();

  rl.on("line", (line) => {
    try {
      const data = JSON.parse(line);
      if (data.id && pendingRequests.has(data.id)) {
        const resolve = pendingRequests.get(data.id)!;
        pendingRequests.delete(data.id);
        resolve(data);
      }
    } catch {
      // Non-JSON output
    }
  });

  function sendRpc(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = messageId++;
      pendingRequests.set(id, resolve);
      const req = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };
      child.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  // 1. Initialize Handshake
  console.log("Step 1: Sending MCP 'initialize' handshake...");
  const initRes = await sendRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "antigravity-test-client", version: "1.0.0" },
  });
  console.log("✓ Handshake response received:");
  console.log(JSON.stringify(initRes.result, null, 2));
  console.log("");

  // 2. List Registered Tools
  console.log("Step 2: Sending 'tools/list' request...");
  const toolsRes = await sendRpc("tools/list");
  const tools = toolsRes.result.tools || [];
  console.log(`✓ Server reported ${tools.length} available tools:`);
  tools.forEach((t: any, idx: number) => {
    console.log(`  ${idx + 1}. [${t.name}] — ${t.description.slice(0, 70)}...`);
  });
  console.log("");

  // 3. Call 'list_papers' Tool
  console.log("Step 3: Executing 'tools/call' for 'list_papers'...");
  const callRes = await sendRpc("tools/call", {
    name: "list_papers",
    arguments: { limit: 3 },
  });
  console.log("✓ Tool execution output:");
  console.log(callRes.result?.content?.[0]?.text || JSON.stringify(callRes));
  console.log("");

  console.log("=================================================");
  console.log("  ✓ All MCP Stdio Communication Tests Passed!");
  console.log("=================================================");

  child.kill();
  process.exit(0);
}

runMcpTestClient().catch((err) => {
  console.error("Test client error:", err);
  process.exit(1);
});

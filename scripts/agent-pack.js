import { exportPack, installPack, loadBundle, loadPack, packReceipt } from "../src/agent-packs.js";

const HELP = `Starlight agent pack — offline, no credentials or cloud changes\n\nUsage:\n  node scripts/agent-pack.js verify [--bundle FILE]\n  node scripts/agent-pack.js install --workspace DIRECTORY [--bundle FILE]\n  node scripts/agent-pack.js export --output FILE [--bundle FILE]\n\nInstall adds one versioned workspace skill. It never activates personality profiles.\nExport contains only the curated pack; workspace memory and secrets are never read.\nHashes check integrity, not publisher identity. Trust the source before importing.\n`;

try {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]))) {
    process.stdout.write(HELP);
  } else {
    const command = args.shift();
    if (!["verify", "install", "export"].includes(command)) throw new Error("Unknown command; use --help");
    const options = {};
    const allowed = command === "install" ? ["--workspace", "--bundle"] : command === "export" ? ["--output", "--bundle"] : ["--bundle"];
    while (args.length) {
      const key = args.shift();
      const value = args.shift();
      if (!allowed.includes(key) || options[key] || !value || value.startsWith("--")) throw new Error("Unknown, duplicate or incomplete option; use --help");
      options[key] = value;
    }
    const bundle = options["--bundle"] ? loadBundle(options["--bundle"]) : loadPack();
    const result = command === "verify" ? packReceipt(bundle)
      : command === "install" ? installPack(options["--workspace"], bundle)
        : exportPack(options["--output"], bundle);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`Agent pack: ${error.message}\n`);
  process.exitCode = 1;
}

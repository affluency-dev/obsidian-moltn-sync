import esbuild from "esbuild";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  // These are provided by Obsidian at runtime — never bundle them.
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2018",
  platform: "browser",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  minify: prod,
  logLevel: "info",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("built main.js (production)");
} else {
  await ctx.watch();
  console.log("watching… (Ctrl+C to stop)");
}

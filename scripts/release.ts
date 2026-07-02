#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Bump = "patch" | "minor" | "major";

function run(cmd: string): void {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function runCapture(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = (args.find((a) => !a.startsWith("--")) ?? "patch") as Bump;

if (!["patch", "minor", "major"].includes(bump)) {
  fail(`Unknown bump type "${bump}". Use one of: patch, minor, major.`);
}

const status = runCapture("git status --porcelain");
if (status.length > 0) {
  fail("Working tree is dirty. Commit or stash your changes before releasing.");
}

const branch = runCapture("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  fail(`You must be on "main" to release (currently on "${branch}").`);
}

if (!dryRun) {
  try {
    runCapture("npm whoami");
  } catch {
    fail("Not logged in to npm. Run `npm login` first.");
  }
}

console.log(`\nReleasing a ${bump} version bump${dryRun ? " (dry run)" : ""}...`);

run("npm run typecheck");
run("npm test");
run("npm run build");

if (!existsSync("dist/cli.js")) {
  fail("Build did not produce dist/cli.js — aborting release.");
}

if (dryRun) {
  console.log("\n✅ Dry run passed: typecheck, tests, and build all succeeded. No tag or publish performed.");
  process.exit(0);
}

run(`npm version ${bump} -m "release: v%s"`);

const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;

run("git push");
run("git push --tags");
run("npm publish --access public");

console.log(`\n✅ Published vhostctl@${version} to npm and pushed the v${version} tag.`);

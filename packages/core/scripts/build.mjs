import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(packageDir, "build");
const isWindows = process.platform === "win32";

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function findEmsdk() {
  const found = firstExisting([
    process.env.EMSDK,
    join(homedir(), "emsdk"),
    "C:/emsdk",
    "/opt/emsdk",
    "/usr/local/emsdk",
  ]);
  if (!found) {
    throw new Error(
      "Emscripten SDK not found. Install it (https://emscripten.org/docs/getting_started/downloads.html) " +
        "into ~/emsdk or point EMSDK at it.",
    );
  }
  return found;
}

function newestSubdir(dir) {
  if (!existsSync(dir)) return undefined;
  const entries = readdirSync(dir).sort();
  return entries.length ? join(dir, entries[entries.length - 1]) : undefined;
}

function findNinja() {
  if (process.env.NINJA && existsSync(process.env.NINJA)) return process.env.NINJA;
  const onPath = spawnSync(isWindows ? "where" : "which", ["ninja"], { encoding: "utf8" });
  if (onPath.status === 0) return onPath.stdout.split(/\r?\n/)[0].trim();
  if (!isWindows) return undefined;
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
    "Microsoft Visual Studio/Installer/vswhere.exe",
  );
  if (!existsSync(vswhere)) return undefined;
  const vsPath = execFileSync(vswhere, ["-latest", "-products", "*", "-property", "installationPath"], {
    encoding: "utf8",
  }).trim();
  const bundled = join(vsPath, "Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe");
  return existsSync(bundled) ? bundled : undefined;
}

function emscriptenEnvironment(emsdk) {
  const pythonDir = newestSubdir(join(emsdk, "python"));
  const nodeDir = newestSubdir(join(emsdk, "node"));
  const pythonExe = pythonDir ? join(pythonDir, isWindows ? "python.exe" : "bin/python3") : undefined;
  const pathSeparator = isWindows ? ";" : ":";
  const extraPath = [join(emsdk, "upstream/emscripten"), nodeDir ? join(nodeDir, "bin") : undefined].filter(Boolean);
  return {
    ...process.env,
    EMSDK: emsdk,
    EMSDK_PYTHON: process.env.EMSDK_PYTHON ?? (pythonExe && existsSync(pythonExe) ? pythonExe : undefined),
    PATH: [...extraPath, process.env.PATH].join(pathSeparator),
  };
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const emsdk = findEmsdk();
const env = emscriptenEnvironment(emsdk);
const ninja = findNinja();
const generator = ninja ? ["-G", "Ninja", `-DCMAKE_MAKE_PROGRAM=${ninja}`] : [];
const withTests = process.argv.includes("--no-tests") ? "OFF" : "ON";
const buildType = process.argv.includes("--debug") ? "Debug" : "Release";
const emcmake = join(emsdk, "upstream/emscripten", isWindows ? "emcmake.exe" : "emcmake");

run(emcmake, ["cmake", "-S", packageDir, "-B", buildDir, `-DCMAKE_BUILD_TYPE=${buildType}`, `-DFRETLESS_CORE_TESTS=${withTests}`, ...generator], env);
run("cmake", ["--build", buildDir, "--parallel"], env);

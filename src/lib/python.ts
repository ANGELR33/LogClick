import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";

export async function runPython(params: { scriptPath: string; args: string[] }) {
  const venvPython = path.resolve(process.cwd(), ".venv", "Scripts", "python.exe");
  const pythonBin =
    process.env.PYTHON_BIN ?? (fs.existsSync(venvPython) ? venvPython : "python");

  const { exitCode, stderr } = await execa(
    pythonBin,
    [params.scriptPath, ...params.args],
    {
      stdout: "pipe",
      stderr: "pipe",
      reject: false,
    },
  );

  if (exitCode !== 0) throw new Error(`python failed (code ${exitCode}): ${stderr}`);
}

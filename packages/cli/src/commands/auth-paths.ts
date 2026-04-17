import { homedir } from "node:os";
import { join } from "node:path";

export function getFusionAuthPath(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  return join(home, ".fusion", "agent", "auth.json");
}


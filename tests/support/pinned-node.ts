import {readFileSync} from "node:fs";

const config = readFileSync(new URL("../../.mise/config.toml", import.meta.url), "utf8");

export const pinnedNodeVersion = `v${/^node = "(.*)"$/m.exec(config)?.[1]}`;
export const onPinnedNode = process.version === pinnedNodeVersion;

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../../src/index.js";

const _contract: (api: ExtensionAPI) => Promise<void> = extension;
void _contract;

import core from "@fungi.computer/cloudflare-computer/shell/core";
import jq from "@fungi.computer/cloudflare-computer/shell/jq";
import yq from "@fungi.computer/cloudflare-computer/shell/yq";
import xan from "@fungi.computer/cloudflare-computer/shell/xan";
import file from "@fungi.computer/cloudflare-computer/shell/file";

const commands: readonly Readonly<Record<string, { js: string }>>[] = [
  core,
  jq,
  yq,
  xan,
  file,
];
const source: string | undefined = commands[0]?.["shell.js"]?.js;
void source;

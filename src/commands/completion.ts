import { z } from "zod";
import { complete } from "../cli/complete.ts";
import { defineCommand, positional } from "../cli/define.ts";

const SHELLS = ["zsh", "bash", "fish"] as const;
type Shell = (typeof SHELLS)[number];

const ZSH = `#compdef btk bun-toolkit
_btk() {
  local -a lines values
  lines=("\${(@f)$(\${words[1]} __complete -- "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  (( \${lines[(I):files]} )) && _files
  values=("\${(@)lines:#:files}")
  values=("\${(@)values//:/\\\\:}")
  values=("\${(@)values/$'\\t'/:}")
  (( \${#values} )) && _describe btk values
}
if [[ \${funcstack[1]} == _btk ]]; then _btk "$@"; else compdef _btk btk bun-toolkit; fi
`;

const BASH = `_btk() {
  local cur=\${COMP_WORDS[COMP_CWORD]} line files=0
  local -a values=()
  while IFS= read -r line; do
    if [[ $line == ":files" ]]; then files=1; elif [[ -n $line ]]; then values+=("\${line%%$'\\t'*}"); fi
  done < <("\${COMP_WORDS[0]}" __complete -- "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null)
  COMPREPLY=($(compgen -W "\${values[*]}" -- "$cur"))
  if (( files )); then
    compopt -o filenames 2>/dev/null
    COMPREPLY+=($(compgen -f -- "$cur"))
  fi
}
complete -F _btk btk bun-toolkit
`;

const FISH = `function __btk_complete
    set -l tokens (commandline -opc) (commandline -ct)
    for line in ($tokens[1] __complete -- $tokens[2..-1] 2>/dev/null)
        if test "$line" = ":files"
            __fish_complete_path (commandline -ct)
        else
            echo $line
        end
    end
end
complete -c btk -f -a '(__btk_complete)'
complete -c bun-toolkit -f -a '(__btk_complete)'
`;

const SCRIPTS: Record<Shell, string> = { zsh: ZSH, bash: BASH, fish: FISH };

export const completion = defineCommand({
  name: "completion",
  description: "Print the shell completion script",
  examples: [
    "source <(btk completion zsh)",
    "btk completion bash > ~/.local/share/bash-completion/completions/btk",
    "btk completion fish > ~/.config/fish/completions/btk.fish",
  ],
  requiresConfig: false,
  args: {
    shell: positional(z.enum(SHELLS), { valueHint: "shell", description: "zsh, bash or fish" }),
  },
  run: (input): string => SCRIPTS[input.shell],
  render: (script, out) => out.raw(script),
});

export const completeWords = defineCommand({
  name: "__complete",
  description: "Completion candidates for the words typed so far",
  hidden: true,
  requiresConfig: false,
  args: {
    words: positional(z.array(z.string()).default([]), {
      description: "Words after btk, the last one being typed",
    }),
  },
  run: (input, ctx): string[] => complete(ctx.registry, input.words, ctx),
  render: (lines, out) => {
    for (const line of lines) out.text(line);
  },
});

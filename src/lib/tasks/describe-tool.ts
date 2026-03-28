/** Build a human-readable description from a tool_use content block. */
export function describeToolUse(name: string, input: Record<string, unknown>): string {
  const file =
    (input.file_path as string) ??
    (input.path as string) ??
    (input.filename as string) ??
    null;
  const short = file ? file.split("/").pop() : null;

  switch (name) {
    case "Read":
      return short ? `Reading ${short}` : "Reading file";
    case "Write":
      return short ? `Writing ${short}` : "Writing file";
    case "Edit":
      return short ? `Editing ${short}` : "Editing file";
    case "Bash": {
      const cmd = String(input.command ?? input.description ?? "").trim();
      return cmd.slice(0, 120) || "Running command";
    }
    case "Grep":
      return `Searching content: ${input.pattern ?? ""}`.trim();
    case "Glob":
      return `Searching files: ${input.pattern ?? ""}`.trim();
    default:
      return name;
  }
}

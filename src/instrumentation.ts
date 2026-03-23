export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartup } = await import("./lib/startup");
    await runStartup();
  }
}

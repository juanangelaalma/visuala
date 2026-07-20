export function SandboxSimulationTutorial() {
  return (
    <aside aria-labelledby="sandbox-title" className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p id="sandbox-title" className="font-semibold text-primary">Sandbox payment tutorial</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-300">
        <li>No real charge occurs.</li>
        <li>Click <strong>Simulate payment</strong>.</li>
        <li>Xendit completes asynchronously through webhook.</li>
        <li>Click <strong>Refresh payment status</strong> afterward.</li>
      </ol>
    </aside>
  );
}

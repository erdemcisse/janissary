export function KeybindsTab(): React.JSX.Element {
  const binds: readonly (readonly [string, string])[] = [
    ["W A S D", "Move"],
    ["Mouse", "Look · Left click fire / swing blade · Right click aim down sights"],
    ["E", "Melee attack (butt stroke with a firearm)"],
    ["R", "Reload"],
    ["F", "Mount / dismount / man a gun / board"],
    ["C", "Crouch"],
    ["Space", "Jump / cavalry hop"],
    ["V", "Toggle first/third person view"],
    ["G", "Torch on/off"],
    ["B", "Raise earthwork (shovel)"],
    ["N", "Dig earthwork (shovel)"],
    ["Tab", "Scoreboard"],
    ["M", "Minimap"],
    ["Esc", "War menu"],
    ["F3", "Diagnostics"],
    ["Enter / T", "Team chat"],
    ["Y", "All chat"],
    ["H", "Toggle chat visibility"],
  ];
  return (
    <>
      <p className="clan-note">Reference only — rebinding arrives in a later phase.</p>
      <table className="keybinds">
        <tbody>
          {binds.map(([key, action]) => <tr key={key}><td><kbd>{key}</kbd></td><td>{action}</td></tr>)}
        </tbody>
      </table>
    </>
  );
}

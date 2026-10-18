import type { Metadata } from "next";
import { SITE_ORIGIN } from "../../lib/site";
import { SiteFooter } from "../../components/site-footer";

export const metadata: Metadata = {
  title: "Game guide — classes, weapons, and the siege",
  description:
    "How to play Janissary: controls, classes, weapons, the siege loop, artillery, cavalry, and galleys — a complete guide to the free 1453 browser FPS.",
  alternates: { canonical: "/guide" },
  openGraph: {
    type: "article",
    url: "/guide",
    title: "Janissary game guide — classes, weapons, and the siege",
    description: "Everything you need to fight the 1453 siege: controls, classes, weapons, artillery, cavalry, and galleys.",
  },
};

const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Janissary game guide — classes, weapons, and the siege",
  description:
    "How to play Janissary: controls, classes, weapons, the siege loop, artillery, cavalry, and galleys.",
  inLanguage: "en",
  publisher: { "@type": "Organization", name: "Janissary Project", url: SITE_ORIGIN },
};

export default function GuidePage(): React.JSX.Element {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />
      <header className="shell site-head">
        <a className="brand" href="/">
          <img src="/favicon.svg" width={40} height={40} alt="" />
          <span>
            Janissary
            <small>The 1453 siege FPS</small>
          </span>
        </a>
        <nav className="site-nav" aria-label="Primary">
          <a href="/#features">Features</a>
          <a href="/#requirements">Requirements</a>
          <a href="/#faq">FAQ</a>
          <a href="/guide">Game guide</a>
          <a className="btn" href="/play">Play free</a>
        </nav>
      </header>

      <main className="shell prose">
        <h1>Janissary game guide</h1>
        <p className="updated">Free to play in your browser — this guide covers everything you need for the siege.</p>

        <h2>Objective</h2>
        <p>
          Janissary is a real-time multiplayer siege. The Ottomans attack the Theodosian walls of
          Constantinople while the Byzantines defend. Each side fights over capture points across
          the battlefield, and the war is decided by tickets — take and hold objectives, kill the
          enemy, and drain their ticket count before yours runs out.
        </p>

        <h2>Controls</h2>
        <table className="controls">
          <tbody>
            <tr><td><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td><td>Move</td></tr>
            <tr><td><kbd>Mouse</kbd></td><td>Look / aim (click the field to capture the pointer)</td></tr>
            <tr><td><kbd>Space</kbd></td><td>Jump</td></tr>
            <tr><td><kbd>Left click</kbd></td><td>Fire the equipped weapon (blades swing on click)</td></tr>
            <tr><td><kbd>Right click</kbd></td><td>Melee with the equipped weapon (butt stroke with a firearm)</td></tr>
            <tr><td><kbd>Shift</kbd></td><td>Aim down sights — tighter spread with firearms</td></tr>
            <tr><td><kbd>R</kbd></td><td>Reload (holstered weapons reload on their own)</td></tr>
            <tr><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></td><td>Weapon slots: blade, primary firearm, dagger</td></tr>
            <tr><td><kbd>F</kbd></td><td>Interact — board cannons, climb ladders, mount horses, board galleys, repair walls</td></tr>
            <tr><td><kbd>M</kbd></td><td>Toggle the minimap</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>Chat</td></tr>
            <tr><td><kbd>Tab</kbd></td><td>Scoreboard</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>War menu</td></tr>
          </tbody>
        </table>

        <h2>Classes</h2>
        <p>Every class carries a blade, a primary firearm, and a dagger. Pick per life:</p>
        <ul>
          <li><strong>Janissary / Guardsman</strong> — the balanced core: arquebus (Ottoman) or crossbow (Byzantine), sword, dagger.</li>
          <li><strong>Sipahi / Knight</strong> — cavalry. Spawn mounted, ride at speed for lance damage, dismount to remount riderless horses.</li>
          <li><strong>Topçu / Wall Gunner</strong> — artillery crew. Topçu get a personal field gun and man the bombards; Wall Gunners operate the fixed wall guns.</li>
          <li><strong>Mehter / Priest</strong> — support. Carry a banner that grants allies a speed and aura buff; they cannot fire, but their presence turns fights.</li>
        </ul>

        <h2>Weapons</h2>
        <ul>
          <li><strong>Arquebus</strong> (Ottoman primary) — 60 damage per body shot, two hits to kill, one-shot headshot at any range.</li>
          <li><strong>Crossbow</strong> (Byzantine primary) — 50 damage, two hits to kill, quieter and slower projectiles, one-shot headshot.</li>
          <li><strong>Blades</strong> — sword, kilij, hanger, and the fast dagger sidearm. Melee hits need range and facing; mounted fights use the saber.</li>
          <li><strong>Butt stroke</strong> — right-click with a firearm equipped: the weakest melee tier, but always available.</li>
        </ul>

        <h2>The siege loop</h2>
        <ol>
          <li>Push the heavy bombards from the staging line toward the wall — one gunner plus pushers move it faster.</li>
          <li>Deploy the cannon (it cannot fire while moving) and fire at the wall. A wall segment breaks after enough shelling.</li>
          <li>Attack through the breach — or climb the siege ladders for a second path over the wall.</li>
          <li>Defenders: repair damaged segments with F and hold the capture points inside the city.</li>
          <li>Fight for the capture points — the inner city is the final objective that decides the war.</li>
        </ol>

        <h2>Horses, galleys, and the sea</h2>
        <p>
          Riderless horses are public mounts — any class may take one. Galleys launch from the
          docks: take the helm to steer, man the side guns to fire, or board as a passenger and
          leap into the harbor fight. A galley that sinks dumps its crew into the water.
        </p>

        <h2>Tips</h2>
        <ul>
          <li>Stand still for a second before firing — movement spreads your shot.</li>
          <li>Headshots always kill, even at maximum range.</li>
          <li>Support banners are force multipliers; stick with your Mehter or Priest.</li>
          <li>The river has fords marked by their sandy shallows — cross there without drowning.</li>
          <li>Use the Low quality tier on modest laptops; it stays playable.</li>
        </ul>
      </main>

      <SiteFooter />
    </>
  );
}

import type { Metadata } from "next";
import { PLAY_URL, SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from "../lib/site";
import { SiteFooter } from "../components/site-footer";

export const metadata: Metadata = {
  title: "Free 1453 siege FPS in your browser",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: `${SITE_NAME} — Free 1453 siege FPS in your browser`,
    description: SITE_DESCRIPTION,
  },
};

const FAQ_ITEMS = [
  {
    q: "Is Janissary free to play?",
    a: "Yes. Janissary is completely free — no purchase, no subscription, no download. Just open the page in your browser and press Play.",
  },
  {
    q: "Do I need to download anything?",
    a: "No. The game runs entirely in your web browser over WebGL. There is nothing to install.",
  },
  {
    q: "What are the system requirements?",
    a: "Any modern laptop or desktop with a web browser that supports WebGL. The game has Low, Medium, and High quality settings, so it runs on modest hardware and scales up on gaming PCs.",
  },
  {
    q: "Is it multiplayer?",
    a: "Yes — it is a real-time multiplayer battle. Two factions fight over capture points in a siege of Constantinople, with players and allied bots on both sides.",
  },
  {
    q: "What can I do in the game?",
    a: "Lead infantry and cavalry, fire arquebus and crossbow, operate bombards and wall guns, push siege cannons, row and board galleys, climb siege ladders, repair the walls, and capture the inner city.",
  },
  {
    q: "What era is the game set in?",
    a: "The game is set during the Ottoman siege of Constantinople in 1453 — the fall of the Byzantine capital — with period weapons, classes, fortifications, and naval warfare.",
  },
  {
    q: "Does the game work on a potato PC?",
    a: "Yes, the Low quality tier is built for potato PCs: pixel-ratio caps, optional shadows, reduced water tessellation, and static far-field characters keep it playable on modest hardware.",
  },
];

const SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
    {
      "@type": "VideoGame",
      "@id": `${SITE_ORIGIN}/#game`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: `${SITE_ORIGIN}/`,
      image: [`${SITE_ORIGIN}/og-image.jpg`],
      genre: ["First-Person Shooter", "Strategy", "Action"],
      playMode: "MultiPlayer",
      gamePlatform: "Web Browser",
      applicationCategory: "GameApplication",
      operatingSystem: "Any modern web browser",
      browserRequirements: "Requires JavaScript and WebGL",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "Janissary Project",
      url: `${SITE_ORIGIN}/`,
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/icon-512.png` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_ORIGIN}/#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function HomePage(): React.JSX.Element {
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
          <a className="btn" href={PLAY_URL}>Play free</a>
        </nav>
      </header>

      <main>
        <section className="hero shell">
          <h1>Play a free 1453 siege FPS in your browser</h1>
          <p className="lede">
            Command the Ottoman assault on Constantinople — or defend the walls of Byzantium.
            Bombards, cavalry, galleys, and massed arquebus fire in a real-time multiplayer
            browser battle. No download. No cost.
          </p>
          <div className="cta-row">
            <a className="btn" href={PLAY_URL}>Play free — no download</a>
            <a className="btn btn-ghost" href="/guide">Read the game guide</a>
          </div>
          <p className="meta">Free · Multiplayer · WebGL · Runs on any modern laptop</p>
        </section>

        <section className="shell section" id="features">
          <h2>Siege warfare in the year 1453</h2>
          <p className="sub">
            Every mechanic is built around the siege: batter the walls, breach the city, and
            take the inner keep — or hold the line as the defenders.
          </p>
          <div className="grid">
            <article className="card">
              <h3>Bombards and wall guns</h3>
              <p>Push heavy siege cannons across the field, deploy them, and pound the Theodosian walls until they breach.</p>
            </article>
            <article className="card">
              <h3>Massed firearms</h3>
              <p>Arquebus and crossbow classes with muzzle smoke, headshot reads, and server-authoritative hits — one shot, one reload.</p>
            </article>
            <article className="card">
              <h3>Cavalry charges</h3>
              <p>Ride Sipahi and Knight cavalry into the lines, lance damage from a gallop, and a true mounted melee.</p>
            </article>
            <article className="card">
              <h3>Galleys on the Golden Horn</h3>
              <p>Row the harbor, man the side guns, and board enemy ships — the sea flank is part of the siege.</p>
            </article>
            <article className="card">
              <h3>Ladders, mantlets, and earthworks</h3>
              <p>Climb siege ladders over the wall, dig cover under fire, and repair the damage as a defender.</p>
            </article>
            <article className="card">
              <h3>Potato-PC friendly</h3>
              <p>Three quality tiers from Low to High. The Low tier is built for modest laptops — shadows off, lighter water, static distant troops.</p>
            </article>
          </div>
        </section>

        <section className="shell section">
          <h2>On the battlefield</h2>
          <p className="sub">Captured from the live game — the bright stylized siege map, the green meadow, the breached wall line, and the river approach.</p>
          <div className="screenshot-grid">
            <figure>
              <img src="/screenshots/siege-wall.png" alt="The Theodosian wall under bombardment on the bright Janissary battlefield" width={1200} height={633} loading="lazy" />
              <figcaption>The wall line and the city beyond it.</figcaption>
            </figure>
            <figure>
              <img src="/screenshots/forest.png" alt="Forests on the green meadow of the Janissary siege map" width={1200} height={633} loading="lazy" />
              <figcaption>The meadow and its woods.</figcaption>
            </figure>
            <figure>
              <img src="/screenshots/river.png" alt="The river crossing with its bridges on the Janissary map" width={1200} height={633} loading="lazy" />
              <figcaption>The river, its bridges, and the fords.</figcaption>
            </figure>
          </div>
        </section>

        <section className="shell section" id="requirements">
          <h2>System requirements</h2>
          <p className="sub">Honest numbers: the game runs on any modern laptop, and the Low tier keeps it playable on modest hardware.</p>
          <table className="req-table">
            <thead>
              <tr><th>Requirement</th><th>Minimum</th><th>Recommended</th></tr>
            </thead>
            <tbody>
              <tr><td>Browser</td><td>Chrome, Edge, or Firefox with WebGL</td><td>Latest Chrome or Edge</td></tr>
              <tr><td>Graphics</td><td>Integrated GPU (WebGL capable)</td><td>Discrete GPU</td></tr>
              <tr><td>Memory</td><td>4 GB</td><td>8 GB</td></tr>
              <tr><td>Connection</td><td>Broadband (10 Mbps)</td><td>25 Mbps or faster</td></tr>
              <tr><td>Storage</td><td>Nothing to install</td><td>Nothing to install</td></tr>
            </tbody>
          </table>
        </section>

        <section className="shell section" id="faq">
          <h2>Frequently asked questions</h2>
          <div className="faq">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

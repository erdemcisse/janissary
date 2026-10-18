import type { Metadata } from "next";
import { SITE_NAME } from "../../lib/site";
import { SiteFooter } from "../../components/site-footer";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${SITE_NAME} handles your data: guest accounts, chat, and gameplay statistics — plain language, no surprises.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage(): React.JSX.Element {
  return (
    <>
      <header className="shell site-head">
        <a className="brand" href="/">
          <img src="/favicon.svg" width={40} height={40} alt="" />
          <span>
            Janissary
            <small>The 1453 siege FPS</small>
          </span>
        </a>
        <nav className="site-nav" aria-label="Primary">
          <a href="/">Home</a>
          <a href="/guide">Game guide</a>
        </nav>
      </header>

      <main className="shell prose">
        <h1>Privacy policy</h1>
        <p className="updated">Effective date: 2026-08-08</p>

        <h2>What this game collects</h2>
        <p>
          Janissary is a multiplayer browser game. To make it work, the game server stores the
          minimum it needs:
        </p>
        <ul>
          <li><strong>Guest account</strong> — a random guest token and the display name you choose at join. This is what lets you come back to the same account and rank.</li>
          <li><strong>Gameplay statistics</strong> — your kills, deaths, captures, headshots, XP, rank, medals, and equipped skins. These drive progression and leaderboards.</li>
          <li><strong>Chat messages</strong> — sent messages are relayed to other players and retained briefly on the server; players can report a message, and reported messages are stored with the sender id.</li>
          <li><strong>Optional account linking</strong> — if you choose to verify with an email link, a one-time magic link is sent and a permanent link between your game account and your email is stored. This is optional and off by default.</li>
        </ul>

        <h2>What we do not collect</h2>
        <ul>
          <li>No cookies, no trackers, and no analytics scripts.</li>
          <li>No advertising identifiers.</li>
          <li>No personal data beyond the account name you choose and the optional email link.</li>
        </ul>

        <h2>Where data lives</h2>
        <p>
          Game data is stored in the game server's own database. If optional email linking is
          enabled, the email verification uses an external identity provider; the provider only
          receives the verification request, never your gameplay data.
        </p>

        <h2>Data deletion</h2>
        <p>
          There is no account deletion button yet. Contact the address in the footer and we will
          remove your account and its data on request. Guest accounts with no activity are
          periodically cleaned from the active cache.
        </p>

        <h2>Children</h2>
        <p>
          The game is not directed at children under 13, and we do not knowingly collect their data.
        </p>

        <h2>Changes</h2>
        <p>
          If this policy changes, the effective date above is updated. Continued play after a
          change counts as acceptance.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

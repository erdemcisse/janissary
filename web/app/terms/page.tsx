import type { Metadata } from "next";
import { SITE_NAME, SITE_ORIGIN } from "../../lib/site";
import { SiteFooter } from "../../components/site-footer";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `The fair, short terms for playing ${SITE_NAME} — a free browser game, no purchases, no guarantees beyond fair play.`,
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage(): React.JSX.Element {
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
        <h1>Terms of service</h1>
        <p className="updated">Effective date: 2026-08-08</p>

        <h2>1. The game is free</h2>
        <p>
          {SITE_NAME} is provided free of charge. There are no purchases, no subscriptions, and no
          in-game payments. Nothing in these terms sells you anything.
        </p>

        <h2>2. Fair play</h2>
        <p>
          Play fair. Cheating tools, automation, exploitation of bugs for advantage, and abuse of
          other players (including in chat) can result in removal from the game. Reported chat
          messages are reviewed and muted where appropriate.
        </p>

        <h2>3. Accounts</h2>
        <p>
          Your guest account is tied to a token stored by the server and your chosen display name.
          Do not share your token. You are responsible for the activity on your account. We may
          remove accounts that violate these terms.
        </p>

        <h2>4. Availability</h2>
        <p>
          The game is provided as-is, without warranties of any kind. We may update, suspend, or
          end the service. Downtime happens; we will keep it short when we can.
        </p>

        <h2>5. Content and assets</h2>
        <p>
          The game uses free, licensed assets (CC0, CC-BY, and OFL fonts) and original work.
          Licences and credits are documented in the repository. You may play the game, but you
          may not redistribute its assets or claim them as your own.
        </p>

        <h2>6. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, the {SITE_NAME} project is not liable for any
          damages arising from your use of the game. This is a hobby-scale free game; please treat
          it accordingly.
        </p>

        <h2>7. Contact</h2>
        <p>
          Questions about these terms: contact the address in the footer. The project is operated
          from {new URL(SITE_ORIGIN).hostname || "the game's hosting region"}.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

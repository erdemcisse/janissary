import { SITE_NAME } from "../lib/site";

/** Shared footer: honest contact placeholder (owner fills in), policy links,
 * and the required about/contact surface for ad-policy compliance. */
export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="shell site-foot">
      <div className="cols">
        <div>
          <strong>{SITE_NAME} — The 1453 siege FPS</strong>
          <p>Free multiplayer siege warfare in your browser. Set during the Ottoman siege of Constantinople, 1453.</p>
        </div>
        <nav aria-label="Footer">
          <a href="/guide">Game guide</a>
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms of service</a>
          <a href="/#faq">FAQ</a>
        </nav>
        <div>
          <strong>Contact</strong>
          <p>janissary@example.com</p>
        </div>
      </div>
    </footer>
  );
}

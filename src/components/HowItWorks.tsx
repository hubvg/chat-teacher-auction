import { money, sentence, typo } from '../lib/format';
import { closeLabel, config } from '../site';

export function HowItWorks() {
  const payment = config.payment.trim();
  return (
    <section className="info" id="how-to-bid" aria-labelledby="how-title">
      <div className="wrap info__grid">
        <div>
          <h2 className="section-title" id="how-title">
            How bidding works
          </h2>
          <ol className="steps">
            <li>
              <h3>Pick an activity</h3>
              <p>Each one shows the top bid and who has it. Search by name, teacher or number.</p>
            </li>
            <li>
              <h3>Place your bid</h3>
              <p>
                Tap <strong>Bid</strong>, enter your amount, name and email, and press <strong>Place bid</strong>. The
                smallest bid that counts is already filled in.
              </p>
            </li>
            <li>
              <h3>Watch the board</h3>
              <p>Your bid shows up right away. If someone outbids you, their name replaces yours, so check back.</p>
            </li>
            <li>
              <h3>Win it</h3>
              <p>
                {closeLabel
                  ? `When bidding closes ${closeLabel}, the top bid on each activity wins.`
                  : 'When bidding closes, the top bid on each activity wins.'}
                {payment ? ` ${typo(sentence(payment))}` : ''}
              </p>
            </li>
          </ol>
        </div>
        <div>
          <h2 className="section-title" id="rules-title">
            Rules
          </h2>
          <ul className="rules" aria-labelledby="rules-title">
            <li>
              A bid counts only if it beats the top bid on that activity by at least {money(config.minIncrement)}. The
              first bid on an activity must be at least its starting bid.
            </li>
            <li>If two people bid the same amount, whoever bid first keeps the lead.</li>
            <li>
              {closeLabel
                ? `Bidding closes ${closeLabel}. After that, the bid form stops taking bids.`
                : 'When bidding closes, the bid form stops taking bids.'}
            </li>
            <li>Bid on as many activities as you like, as many times as you like.</li>
            <li>Use your real name. Your email is only for the organizers, to reach you if you win.</li>
            <li>Organizers remove joke and fake bids. Only bid what you can pay.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

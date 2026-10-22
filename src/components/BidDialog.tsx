import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Phase } from '../App';
import type { LotState } from '../lib/auction';
import { EMAIL_MAX, emailProblem, NAME_MAX, nameProblem, parseAmount } from '../lib/bidForm';
import { money } from '../lib/format';
import { boardName } from '../lib/names';
import { config } from '../site';
import type { RawBid } from '../types';

/** Where bids are sent. Always /api/bid on the real site. */
const BID_ENDPOINT: string = import.meta.env.VITE_BID_ENDPOINT || '/api/bid';
const SAVED = 'teacher-auction:bidder';

type Field = 'amount' | 'name' | 'email';

interface Props {
  /** The activity being bid on, or null when the dialog is closed. */
  lot: LotState | null;
  phase: Phase;
  onClose: () => void;
  /** Called with the saved bid, so the board can show it straight away. */
  onPlaced: (bid: RawBid) => void;
}

/** Name and email from this browser's last bid, so a second bid is one tap. */
function loadSaved(): { name: string; email: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED) ?? '{}') as { name?: unknown; email?: unknown };
    return {
      name: typeof saved.name === 'string' ? saved.name : '',
      email: typeof saved.email === 'string' ? saved.email : '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

function save(name: string, email: string) {
  try {
    localStorage.setItem(SAVED, JSON.stringify({ name, email }));
  } catch {
    // Private browsing or blocked storage: they'll just type it again next time.
  }
}

export function BidDialog({ lot, phase, onClose, onPlaced }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const titleId = useId();

  // What they typed. Until they type, the field shows the smallest bid that counts and follows new bids.
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  // The top bid and smallest bid that counts, as the server last reported them after an outbid.
  // They can be ahead of the board for a few seconds, until its next refresh.
  const [serverMin, setServerMin] = useState(0);
  const [serverTop, setServerTop] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [touched, setTouched] = useState<Record<Field, boolean>>({ amount: false, name: false, email: false });
  const [serverField, setServerField] = useState<{ field: Field; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [placed, setPlaced] = useState<RawBid | null>(null);

  const lotNumber = lot?.activity.lot ?? null;
  const nextMin = Math.max(lot?.nextMin ?? config.minIncrement, serverMin);
  const amount = typedAmount ?? String(nextMin);
  const open = phase === 'open' || phase === 'unknown';

  // Open or close the native dialog, and start fresh for each activity.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (lotNumber !== null && !el.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const saved = loadSaved();
      setTypedAmount(null);
      setServerMin(0);
      setServerTop(0);
      setName(saved.name);
      setEmail(saved.email);
      setHp('');
      setTouched({ amount: false, name: false, email: false });
      setServerField(null);
      setNotice('');
      setPlaced(null);
      setSending(false);
      el.showModal();
      requestAnimationFrame(() => amountInput.current?.select());
    } else if (lotNumber === null && el.open) {
      el.close();
    }
    // Only a different activity (or closing) resets the form; live top-bid changes don't.
  }, [lotNumber]);

  // Esc, the close button and backdrop clicks all end up here.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const handleClose = () => {
      // The close event arrives a moment after closing. If the dialog was reopened for another
      // activity in between, this event is stale and must not close the new one.
      if (el.open) return;
      onClose();
      opener.current?.focus();
    };
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  const parsed = parseAmount(amount);
  const errors: Record<Field, string> = {
    amount:
      parsed === null
        ? 'Enter an amount, like 45.'
        : parsed + 1e-9 < nextMin
          ? `Bid at least ${money(nextMin)}.`
          : parsed > config.maxBid
            ? `Bids over ${money(config.maxBid)} aren’t accepted.`
            : '',
    name: nameProblem(name),
    email: emailProblem(email),
  };
  const shown = (field: Field) =>
    serverField?.field === field ? serverField.message : touched[field] ? errors[field] : '';

  const fieldRefs: Record<Field, typeof amountInput> = { amount: amountInput, name: nameInput, email: emailInput };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lot || sending) return;
    setNotice('');
    setServerField(null);
    const firstBad = (['amount', 'name', 'email'] as Field[]).find((f) => errors[f]);
    if (firstBad) {
      setTouched({ amount: true, name: true, email: true });
      fieldRefs[firstBad].current?.focus();
      return;
    }

    setSending(true);
    try {
      const res = await fetch(BID_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ lot: lot.activity.lot, amount: parsed, name: name.trim(), email: email.trim(), hp }),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && data?.ok && data.bid) {
        const bid = data.bid as RawBid;
        save(name.trim(), email.trim());
        setPlaced(bid);
        onPlaced(bid);
        return;
      }
      if (data?.error === 'too_low') {
        const min = Number(data.nextMin) || 0;
        const top = Number(data.top) || 0;
        setServerMin(min);
        setServerTop(top);
        setTypedAmount(null);
        setNotice(
          data.yours === true && top
            ? `You already have the top bid, ${money(top)}. To raise it, bid at least ${money(min)}.`
            : top
              ? `Someone just bid ${money(top)}. To take the lead, bid at least ${money(min)}.`
              : `Bid at least ${money(min)}.`,
        );
        amountInput.current?.focus();
      } else if (data?.error === 'invalid' && typeof data.field === 'string' && typeof data.message === 'string') {
        const field = data.field as Field;
        setServerField({ field, message: data.message });
        fieldRefs[field]?.current?.focus();
      } else if (data?.error === 'closed') {
        setNotice('Bidding just closed, so this bid can’t be placed.');
      } else if (data?.error === 'not_open') {
        setNotice('Bidding hasn’t opened yet.');
      } else if (res.status === 429 || data?.error === 'busy') {
        setNotice('Lots of bids are coming in at once. Wait a few seconds and press Place bid again.');
      } else if (data?.error === 'not_configured') {
        setNotice('Bidding isn’t set up yet. Ask the organizers.');
      } else if (typeof data?.hint === 'string' && ['upstream_auth', 'upstream_not_json', 'bad_config'].includes(String(data.error))) {
        // Only happens when the site is set up wrong, so the fix is spelled out for the organizers.
        setNotice(`Bids can’t be saved right now. Please tell the organizers. Setup problem: ${data.hint}`);
      } else if (typeof data?.error === 'string' && data.error.startsWith('upstream')) {
        setNotice('Your bid didn’t go through because the bid sheet didn’t answer. Press Place bid again in a moment.');
      } else {
        setNotice('Your bid didn’t go through. Check your connection and press Place bid again.');
      }
    } catch {
      setNotice('Your bid didn’t go through. Check your connection and press Place bid again.');
    } finally {
      setSending(false);
    }
  }

  const close = () => dialog.current?.close();
  const label = (field: Field) => `${titleId}-${field}`;

  return (
    <dialog
      ref={dialog}
      className="bid"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      {lot ? (
        <div className="bid__inner">
          <div className="bid__head">
            <h2 className="bid__title" id={titleId}>
              {placed ? 'You’re in the lead' : 'Place a bid'}
            </h2>
            <button type="button" className="bid__close" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="bid__activity">
            <span className="bid__lot">#{lot.activity.lot}</span> {lot.activity.name}
          </p>

          {placed ? (
            <div className="bid__done">
              <p className="bid__done-amount">{money(placed.amount)}</p>
              <p>
                The board shows you as <strong>{placed.name}</strong>
                {placed.name.endsWith('.') ? '' : '.'} If someone outbids you, their name replaces yours, so check back
                before bidding closes.
              </p>
              <button type="button" className="btn btn--solid btn--lg bid__submit" onClick={close}>
                Done
              </button>
            </div>
          ) : (
            <form className="bid__form" onSubmit={submit} noValidate>
              <p className="bid__top">
                {serverTop > (lot.top?.amount ?? 0) ? (
                  <>
                    Top bid <strong>{money(serverTop)}</strong>
                  </>
                ) : lot.top ? (
                  <>
                    Top bid <strong>{money(lot.top.amount)}</strong> by {lot.top.name}
                  </>
                ) : (
                  'No bids yet. Be the first.'
                )}
              </p>

              <div className="bid__field">
                <label className="bid__label" htmlFor={label('amount')}>
                  Your bid
                </label>
                <div className="bid__money">
                  <span aria-hidden="true">$</span>
                  <input
                    ref={amountInput}
                    id={label('amount')}
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => {
                      setTypedAmount(e.target.value);
                      if (serverField?.field === 'amount') setServerField(null);
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                    aria-invalid={Boolean(shown('amount'))}
                    aria-describedby={`${label('amount')}-hint`}
                  />
                </div>
                <p className={shown('amount') ? 'bid__hint is-error' : 'bid__hint'} id={`${label('amount')}-hint`}>
                  {shown('amount') || `At least ${money(nextMin)}`}
                </p>
              </div>

              <div className="bid__field">
                <label className="bid__label" htmlFor={label('name')}>
                  Your name
                </label>
                <input
                  ref={nameInput}
                  id={label('name')}
                  className="input"
                  autoComplete="name"
                  maxLength={NAME_MAX}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (serverField?.field === 'name') setServerField(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  aria-invalid={Boolean(shown('name'))}
                  aria-describedby={`${label('name')}-hint`}
                />
                <p className={shown('name') ? 'bid__hint is-error' : 'bid__hint'} id={`${label('name')}-hint`}>
                  {shown('name') ||
                    (boardName(name, config.nameStyle)
                      ? `Shown on the board as ${boardName(name, config.nameStyle)}`
                      : 'Use your real name.')}
                </p>
              </div>

              <div className="bid__field">
                <label className="bid__label" htmlFor={label('email')}>
                  Your email
                </label>
                <input
                  ref={emailInput}
                  id={label('email')}
                  className="input"
                  type="email"
                  autoComplete="email"
                  maxLength={EMAIL_MAX}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (serverField?.field === 'email') setServerField(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  aria-invalid={Boolean(shown('email'))}
                  aria-describedby={`${label('email')}-hint`}
                />
                <p className={shown('email') ? 'bid__hint is-error' : 'bid__hint'} id={`${label('email')}-hint`}>
                  {shown('email') || 'Only the organizers see this, to reach you if you win.'}
                </p>
              </div>

              {/* Hidden from people; bots that fill in every field get ignored. */}
              <div className="bid__trap" aria-hidden="true">
                <label>
                  Leave this empty
                  <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
                </label>
              </div>

              <p className="bid__notice" role="alert">
                {notice || (open ? '' : 'Bidding has closed, so new bids can’t be placed.')}
              </p>

              <div className="bid__actions">
                <button type="submit" className="btn btn--solid btn--lg bid__submit" disabled={sending || !open}>
                  {sending ? 'Placing your bid…' : parsed && !errors.amount ? `Place bid ${money(parsed)}` : 'Place bid'}
                </button>
                <button type="button" className="btn btn--outline btn--lg" onClick={close}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </dialog>
  );
}

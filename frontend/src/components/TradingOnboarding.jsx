import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/tradingOnboarding.css';

const steps = [
  ['Your team desk', 'fa-people-group', 'Create a team or join using the code your captain shares. The team panel shows who you are playing with. Everyone can research; your captain submits the team decisions.'],
  ['Read the market briefings', 'fa-newspaper', 'Open the cards in Market mission. Read the confirmed brief and check the unverified desk chatter. Pin useful clues, discuss what they mean, and compare them with the price board.'],
  ['Build your decisions', 'fa-arrow-right-arrow-left', 'Each tradable asset has Buy, Hold, and Sell controls. Enter the quantity in units and review your cash before submitting. Hold leaves the position unchanged. Your captain can unsubmit and edit while the decision window is open.'],
  ['Watch the time left', 'fa-stopwatch', 'The host opens and advances each round. Submit before the countdown reaches zero. When you scroll past the main timer, a small timer stays visible so you can keep working.'],
  ['Compare the results', 'fa-ranking-star', 'After the host advances the quarter, open Team results to compare portfolios and returns. Your team is highlighted, with its rank relative to the other teams. Select a completed quarter to revisit its standings.'],
];

const targets = ['.yf-team-card', '.yf-newsroom-head', '.yf-card-decision', '.yf-round-hero .yf-round-timer', '.yf-leaderboard'];

export default function TradingOnboarding({ onClose, onTabChange }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef(null);
  const [spotlight, setSpotlight] = useState(null);
  const [placement, setPlacement] = useState(null);
  useEffect(() => {
    setSpotlight(null);
    setPlacement(null);
    onTabChange(index === 4 ? 'portfolio' : 'market');
    let frame;
    let attempts = 0;
    let target;
    function measure() {
      if (!target || !dialogRef.current) return;
      const rect = target.getBoundingClientRect();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const top = Math.max(8, rect.top - 7);
      const left = Math.max(8, rect.left - 7);
      const right = Math.min(width - 8, rect.right + 7);
      const bottom = Math.min(height - 8, rect.bottom + 7);
      setSpotlight({ top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
      const cardWidth = Math.min(420, width - 32);
      const cardHeight = dialogRef.current.offsetHeight;
      let cardLeft = Math.max(16, Math.min(left, width - cardWidth - 16));
      let cardTop;
      if (right + cardWidth + 32 <= width) {
        cardLeft = right + 16;
        cardTop = top;
      } else if (left >= cardWidth + 32) {
        cardLeft = left - cardWidth - 16;
        cardTop = top;
      } else if (bottom + cardHeight + 32 <= height) {
        cardTop = bottom + 16;
      } else if (top >= cardHeight + 32) {
        cardTop = top - cardHeight - 16;
      } else {
        cardTop = height - cardHeight - 16;
      }
      setPlacement({ left: cardLeft, top: Math.max(16, Math.min(cardTop, height - cardHeight - 16)) });
    }
    function findTarget() {
      target = document.querySelector(targets[index]);
      if (!target && attempts++ < 30) { frame = requestAnimationFrame(findTarget); return; }
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      frame = requestAnimationFrame(measure);
    }
    frame = requestAnimationFrame(findTarget);
    const observer = new ResizeObserver(measure);
    if (dialogRef.current) observer.observe(dialogRef.current);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [index, onTabChange]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.focus({ preventScroll: true });
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    }
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); previousFocus?.focus(); };
  }, [onClose]);
  const [title, icon, description] = steps[index];
  return createPortal(<div className={`yf-onboarding-layer ${spotlight ? 'yf-onboarding-spotlit' : ''}`}>
    {spotlight && <div className="yf-onboarding-spotlight" style={spotlight} aria-hidden="true" />}
    <section className="yf-onboarding-dialog" style={placement || undefined} role="dialog" aria-modal="true" aria-labelledby="yf-onboarding-title" tabIndex={-1} ref={dialogRef}>
      <div className="yf-onboarding-top"><span>TRADING DESK · {index + 1} / {steps.length}</span><button type="button" onClick={onClose} aria-label="Close onboarding">Close</button></div>
      <i className={`fa-solid ${icon} yf-onboarding-icon`} aria-hidden="true" />
      <div aria-live="polite"><h2 id="yf-onboarding-title">{title}</h2><p>{description}</p></div>
      <div className="yf-onboarding-dots" aria-hidden="true">{steps.map((step, position) => <span key={step[0]} className={position === index ? 'active' : ''} />)}</div>
      <div className="yf-onboarding-actions"><button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button><button type="button" onClick={() => index === steps.length - 1 ? onClose() : setIndex(index + 1)}>{index === steps.length - 1 ? 'Open my trading desk' : 'Next'}</button></div>
      <small>Replay this introduction using the question mark in the header.</small>
    </section>
  </div>, document.body);
}

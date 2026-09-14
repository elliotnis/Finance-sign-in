import { useEffect, useRef } from 'react';
export default function useModalFocus(onClose, busy = false, active = true) {
  const ref = useRef(null);
  const current = useRef({onClose,busy});
  useEffect(() => { current.current = {onClose,busy}; });
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current;
    const focusable = () => Array.from(dialog.querySelectorAll('button:not([disabled]), input, textarea, select, a[href]')).filter(element => element.offsetParent !== null);
    focusable()[0]?.focus();
    const onKey = event => {
      if (event.key === 'Escape' && !current.current.busy) current.current.onClose();
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    return () => {document.body.style.overflow = overflow;document.removeEventListener('keydown',onKey);previous?.focus();};
  }, [active]);
  return ref;
}

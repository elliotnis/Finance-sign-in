import { useEffect, useState } from 'react';

const AUTO_ADVANCE_MS = 7000;

const SLIDES = [
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/2023-09/img_Finance.jpg',
    label: 'Finance learning in action',
    position: 'center center',
  },
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/inline-images/Advancing-Financial-Literacy-2.png',
    label: 'Student finance workshops',
    position: 'center center',
  },
  {
    src: 'https://hkust.edu.hk/sites/default/files/styles/hkust_standard_page_header/public/2025-08/Visit%20HKUST.jpg?itok=VFTxjKWp',
    label: 'Clear Water Bay campus life',
    position: 'center center',
  },
  {
    src: 'https://hkust.edu.hk/sites/default/files/styles/hkust_image_text_block/public/2026-06/DSC_8082-1-2.jpg?itok=eYu5ZFIC',
    label: 'HKUST campus in bloom',
    position: 'center center',
  },
];

function PortalAuthCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionQuery.matches);

    updateMotionPreference();
    motionQuery.addEventListener('change', updateMotionPreference);

    return () => motionQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isPaused || isHoveringControls || hasFocusWithin) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(intervalId);
  }, [activeSlide, hasFocusWithin, isHoveringControls, isPaused, prefersReducedMotion]);

  const handleBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setHasFocusWithin(false);
    }
  };

  return (
    <>
      <div className="portal-auth-carousel-media" aria-hidden="true">
        {SLIDES.map((slide, index) => (
          <img
            className={`portal-auth-carousel-slide ${index === activeSlide ? 'active' : ''}`}
            key={slide.src}
            src={slide.src}
            alt=""
            fetchPriority={index === 0 ? 'high' : 'low'}
            style={{ objectPosition: slide.position }}
          />
        ))}
      </div>

      <section
        className="portal-auth-carousel-controls"
        aria-label={`HKUST Business School photography, slide ${activeSlide + 1} of ${SLIDES.length}: ${SLIDES[activeSlide].label}`}
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
        onFocusCapture={() => setHasFocusWithin(true)}
        onBlurCapture={handleBlur}
      >
        <p className="portal-auth-carousel-caption">
          <span aria-hidden="true">{String(activeSlide + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}</span>
          {SLIDES[activeSlide].label}
        </p>

        <div className="portal-auth-carousel-actions">
          <div className="portal-auth-carousel-dots" role="group" aria-label="Choose a photo">
            {SLIDES.map((slide, index) => (
              <button
                aria-current={index === activeSlide ? 'true' : undefined}
                aria-label={`Show photo ${index + 1}: ${slide.label}`}
                className={index === activeSlide ? 'active' : ''}
                key={slide.src}
                onClick={() => setActiveSlide(index)}
                type="button"
              />
            ))}
          </div>

          <button
            aria-pressed={isPaused}
            className="portal-auth-carousel-toggle"
            onClick={() => setIsPaused((paused) => !paused)}
            type="button"
          >
            {isPaused ? 'Play' : 'Pause'}
          </button>
        </div>
      </section>
    </>
  );
}

export default PortalAuthCarousel;

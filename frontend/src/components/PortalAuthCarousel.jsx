import { useEffect, useState } from 'react';

const AUTO_ADVANCE_MS = 3000;

const SLIDES = [
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/inline-images/FINA-1.png',
    position: 'center center',
  },
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/inline-images/38%20-%20Copy.jpg',
    position: 'center 55%',
  },
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/inline-images/Advancing-Financial-Literacy-2.png',
    position: 'center center',
  },
  {
    src: 'https://bm.hkust.edu.hk/sites/default/files/inline-images/Setting-Sail-for-the-GBA-1.png',
    position: 'center 55%',
  },
];

function PortalAuthCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="portal-auth-carousel-media" aria-hidden="true">
      {SLIDES.map((slide, index) => (
        <img
          className={`portal-auth-carousel-slide ${index === activeSlide ? 'active' : ''}`}
          key={slide.src}
          src={slide.src}
          alt=""
          fetchPriority={index === 0 ? 'high' : 'auto'}
          style={{ objectPosition: slide.position }}
        />
      ))}
    </div>
  );
}

export default PortalAuthCarousel;
